import { basename, extname, join, relative } from 'node:path';

import type { Browser, Page } from 'playwright-core';

import { launchBrowser } from './browser.ts';
import {
    cssModules,
    cuesBeside,
    cuesModule,
    KIT,
    manifestModule,
    type Module,
    readJson,
    writeFilm,
} from './build.ts';
import { readCues } from './cues.ts';
import { htmlLeaks } from './html.ts';
import { filmCss } from './css.ts';
import { pageCss, parseSheet, type ParsedSheet, usageSelectors } from './pageCss.ts';
import { type Box, matchSelectors, snapshotPage, stampHooks } from './snapshot.ts';
import { DEFAULT_VIEWPORT, type PageSpec, type PageStep, pageSteps, readPageSpec } from './spec.ts';

/**
 * `pnpm motion-kit capture`: drives a route of the running site through a
 * page spec's steps in Chrome and writes each captured state as a static
 * fragment, with one stylesheet for all of them. See motion-kit/README.md.
 */

export const DEFAULT_BASE = 'http://localhost:3000';

// A search answer can take two minutes to stream in.
const STEP_TIMEOUT = 180_000;

// The longest a capture waits for finite CSS animations to come to rest.
const SETTLE_MS = 3_000;

const runStep = async (page: Page, step: Exclude<PageStep, { type: 'capture' }>) => {
    switch (step.type) {
        case 'click':
            return page.locator(step.selector).click();
        case 'hover':
            return page.locator(step.selector).hover();
        case 'focus':
            return page.locator(step.selector).focus();
        case 'type':
            return page.locator(step.selector).pressSequentially(step.text);
        case 'press':
            return page.keyboard.press(step.key);
        case 'wait':
            if (step.selector) {
                await page.locator(step.selector).first().waitFor({ state: 'visible' });
            }

            if (step.ms) {
                await page.waitForTimeout(step.ms);
            }

            return;
        case 'scroll':
            if (step.selector) {
                return page
                    .locator(step.selector)
                    .evaluate(
                        (element, y) => element.scrollTo({ top: y, behavior: 'instant' }),
                        step.y,
                    );
            }

            return page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), step.y);
    }
};

// Fonts loaded and every finite animation and transition finished, so the
// live page shows the resting state the film's CSS freezes it in.
const settle = (page: Page) =>
    page.evaluate(async (limit) => {
        await document.fonts.ready;

        const finite = document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);

        await Promise.race([
            Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
            new Promise((resolve) => setTimeout(resolve, limit)),
        ]);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, SETTLE_MS);

export type CapturedState = { state: string; html: string; boxes: Record<string, Box | null> };

export type Capture = {
    states: CapturedState[];
    css: string;
    rootFontSize: number;
    dropped: string[];
};

/**
 * Opens `spec.path` on `base`, runs the steps and snapshots the page at
 * each capture step. The stylesheet keeps the rules any state uses. Fails
 * when a hook's selector finds more than one element in a state or nothing
 * in every state, or when a fragment still holds something a film cannot.
 */
export const capturePage = async ({
    spec,
    base,
    browser,
    stepTimeout = STEP_TIMEOUT,
}: {
    spec: PageSpec;
    base: string;
    browser: Browser;
    // How long a step waits for its element, in ms.
    stepTimeout?: number;
}): Promise<Capture> => {
    const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
    // Two device px per CSS px keep canvas pixels sharp on the larger stage.
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });

    try {
        const page = await context.newPage();

        page.setDefaultTimeout(stepTimeout);
        await page.goto(new URL(spec.path, base).href, { waitUntil: 'load' });

        const hooks = spec.hooks ?? [];
        const sheets = new Map<string, ParsedSheet>();
        const used = new Set<string>();
        const states: CapturedState[] = [];
        const dropped = new Set<string>();
        let rootFontSize = 0;

        for (const step of pageSteps(spec)) {
            if (step.type !== 'capture') {
                await runStep(page, step);
                continue;
            }

            await settle(page);

            const boxes = await page.evaluate(stampHooks, hooks);
            const snapshot = await page.evaluate(snapshotPage, { viewport, state: step.state });
            const leaks = htmlLeaks(snapshot.html);

            if (leaks.length) {
                throw new Error(
                    `motion-kit: state "${step.state}" still holds ${leaks.join(', ')}`,
                );
            }

            for (const source of snapshot.sheets) {
                if (!sheets.has(source.key)) {
                    sheets.set(source.key, parseSheet(source));
                }
            }

            const selectors = usageSelectors([...sheets.values()]).filter(
                (selector) => !used.has(selector),
            );
            const matched = await page.evaluate(matchSelectors, selectors);

            selectors.forEach((selector, index) => {
                if (matched[index]) {
                    used.add(selector);
                }
            });

            for (const line of snapshot.dropped) {
                dropped.add(line);
            }

            rootFontSize ||= snapshot.rootFontSize;
            states.push({ state: step.state, html: snapshot.html, boxes });
        }

        for (const { v, selector } of hooks) {
            if (states.every(({ boxes }) => !boxes[v])) {
                throw new Error(
                    `motion-kit: hook "${v}": "${selector}" matches nothing in any state`,
                );
            }
        }

        const cssDropped: string[] = [];
        const css = await pageCss({
            sheets: [...sheets.values()],
            used,
            dropped: cssDropped,
            inline: async (url) => {
                const response = await context.request.get(url).catch(() => null);

                if (!response?.ok()) {
                    return null;
                }

                const type =
                    response.headers()['content-type']?.split(';')[0] ?? 'application/octet-stream';

                return `data:${type};base64,${(await response.body()).toString('base64')}`;
            },
        });

        return {
            states,
            css,
            rootFontSize,
            dropped: [...dropped, ...cssDropped],
        };
    } finally {
        await context.close();
    }
};

export type GeneratedPage = {
    outDir: string;
    modules: Module[];
    manifest: Record<string, unknown>;
    dropped: string[];
};

/** Reads the page spec at `specPath`, captures it from `base` and writes
 *  the film's modules to `outDir` (`motion-kit/dist/<spec file name>`). */
export const generatePage = async ({
    specPath,
    base = DEFAULT_BASE,
    outDir,
    browser,
    stepTimeout,
}: {
    specPath: string;
    base?: string;
    outDir?: string;
    // A running browser to capture in; one is launched and closed when absent.
    browser?: Browser;
    stepTimeout?: number;
}): Promise<GeneratedPage> => {
    const spec = readPageSpec(await readJson(specPath));
    const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
    const target = outDir ?? join(KIT, 'dist', basename(specPath, extname(specPath)));
    const hooks = (spec.hooks ?? []).map(({ v }) => v);
    // A capture has no app motion or states, so its cue sheet may name
    // neither.
    const rawCues = await cuesBeside(specPath);
    const states = pageSteps(spec).flatMap((step) => (step.type === 'capture' ? [step.state] : []));
    const cues =
        rawCues === null ? null : readCues(rawCues, hooks, { keyframes: [], page: { states } });
    const own = browser ? null : await launchBrowser();

    try {
        const capture = await capturePage({
            spec,
            base,
            browser: browser ?? own!,
            stepTimeout,
        });
        const css = cssModules(
            filmCss(capture.css, viewport, { rootFontSize: capture.rootFontSize }),
        );
        const manifest = {
            viewport,
            rootFontSize: capture.rootFontSize,
            path: spec.path,
            modules: {
                css: css.map((file) => file.name),
                html: Object.fromEntries(
                    capture.states.map(({ state }) => [state, `${state}.html`]),
                ),
                ...(cues ? { cues: 'cues.json' } : {}),
            },
            hooks,
            boxes: Object.fromEntries(
                hooks.map((v) => [
                    v,
                    Object.fromEntries(capture.states.map(({ state, boxes }) => [state, boxes[v]])),
                ]),
            ),
            dropped: capture.dropped,
        };

        // Once captured, each cue's hooks are checked against its states.
        if (cues) {
            readCues(cues, hooks, {
                keyframes: [],
                page: { states, boxes: manifest.boxes },
            });
        }
        const modules = await writeFilm(target, [
            ...css,
            ...capture.states.map(({ state, html }): Module => ({
                name: `${state}.html`,
                kind: 'html',
                text: html,
            })),
            manifestModule(manifest),
            ...(cues ? [cuesModule(cues)] : []),
        ]);

        return {
            outDir: relative(process.cwd(), target) || '.',
            modules,
            manifest,
            dropped: capture.dropped,
        };
    } finally {
        await own?.close();
    }
};
