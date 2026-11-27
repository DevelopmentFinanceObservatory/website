/**
 * Opens /studio in one layout behind routes that answer every request from
 * the recorded scenario, and plays the scenario as a reader would: types
 * each question, answers each pause, and waits for each stream to end.
 */
import type { Browser, Page } from 'playwright-core';

import { type Act, type Scenario } from './scenario.ts';
import { Player, serveHarness } from './harness.ts';

export type Layout = 'classic' | 'prompt';

export type Session = {
    page: Page;
    player: Player;
    /** Console errors and page errors, in order. */
    errors: string[];
    /** Requests no route answered. */
    unanswered: string[];
    close: () => Promise<void>;
};

// The page counts a guest's prompts in localStorage and walls the prompt
// field after five (src/lib/studio/promptAllowance.ts). The proxy that
// meters the real allowance is not in the path, so a scenario with more
// questions reads the count as 0, as a signed-in reader's page would let it
// go on.
const GUEST_COUNT_KEY = 'dfo-guest-prompts';
const GUEST_PROMPTS = 5;

// The consent banner's loader, answered with an empty script.
const CONSENT_LOADER = /^https:\/\/web\.cmp\.usercentrics\.eu\/ui\/loader\.js/;

// The card's neighbours the page reads that no recording holds: answered
// with each route's own not-found document or success body.
const neighbour = (method: string, pathname: string): { status: number; body: unknown } | null => {
    const missing = (detail: string) => ({
        status: 404,
        body: {
            type: '/codes/not_found',
            title: 'Not Found',
            status: 404,
            detail,
            code: 'not_found',
            retryable: false,
        },
    });

    if (/^\/api\/(v1\/)?(source-doc|graph\/documentation)\//.test(pathname)) {
        return missing('No documentation is recorded.');
    }

    if (pathname.startsWith('/api/version-download/') || pathname.startsWith('/api/share')) {
        return missing('No files or shares are recorded.');
    }

    if (pathname === '/api/download-pin') {
        return { status: 204, body: null };
    }

    if (pathname === '/api/feedback' && method === 'POST') {
        return { status: 200, body: { ok: true, message: 'Thanks for your feedback!' } };
    }

    return null;
};

export const openStudio = async (
    browser: Browser,
    siteUrl: string,
    scenario: Scenario,
    layout: Layout,
): Promise<Session> => {
    const player = new Player(scenario);
    const harness = await serveHarness(player);
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: 'light',
    });
    const page = await context.newPage();

    // A control the layout does not draw fails the run in 10 s.
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    const unanswered: string[] = [];
    const site = new URL(siteUrl);

    if (scenario.turns.length > GUEST_PROMPTS) {
        await context.addInitScript((key) => {
            const read = Storage.prototype.getItem;

            Storage.prototype.getItem = function getItem(name: string) {
                return name === key ? '0' : read.call(this, name);
            };
        }, GUEST_COUNT_KEY);
    }

    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(`console: ${message.text()}`);
        }
    });
    page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.origin !== site.origin) {
            if (CONSENT_LOADER.test(url.href)) {
                return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
            }

            unanswered.push(`${request.method()} ${url.href}`);

            return route.abort('blockedbyclient');
        }

        const { pathname, search } = url;

        if (
            pathname.startsWith('/api/studio/') ||
            pathname.startsWith('/api/presentation/components/')
        ) {
            return route.continue({ url: `${harness.url}${pathname}${search}` });
        }

        if (pathname === '/api/events') {
            return route.fulfill({ status: 204, body: '' });
        }

        if (pathname === '/api/auth/get-session') {
            // A guest: no session.
            return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
        }

        const answer = neighbour(request.method(), pathname);

        if (answer) {
            return route.fulfill({
                status: answer.status,
                contentType: 'application/json',
                body: answer.body === null ? '' : JSON.stringify(answer.body),
            });
        }

        if (pathname.startsWith('/api/')) {
            unanswered.push(`${request.method()} ${pathname}${search}`);

            return route.fulfill({
                status: 501,
                contentType: 'application/json',
                body: '{"error":"not_implemented"}',
            });
        }

        return route.continue();
    });

    await page.goto(`${siteUrl}/studio?studio=${layout}`, { waitUntil: 'load' });

    return {
        page,
        player,
        errors,
        unanswered,
        close: async () => {
            await context.close();
            await harness.close();
        },
    };
};

const segmentEnd = (player: Player, turn: number, segment: number) =>
    new Promise<void>((resolve) => {
        const check = (ended: { turn: number; segment: number }) => {
            if (ended.turn === turn && ended.segment === segment) {
                player.off('segment-end', check);
                resolve();
            }
        };

        player.on('segment-end', check);
    });

// Waits for the page's running animations to finish (endless ones aside).
const settle = async (page: Page) => {
    await page.waitForTimeout(300);
    await page
        .waitForFunction(
            () =>
                document
                    .getAnimations()
                    .every(
                        (one) =>
                            one.playState !== 'running' ||
                            one.effect?.getComputedTiming().iterations === Infinity,
                    ),
            null,
            { timeout: 5000, polling: 100 },
        )
        .catch(() => {});
};

const ask = async (page: Page, question: string) => {
    const named = page
        .getByRole('textbox', { name: /ask|question|follow|message/i })
        .filter({ visible: true });
    const field =
        (await named.count()) > 0
            ? named.first()
            : page.getByRole('textbox').filter({ visible: true }).first();

    await field.fill(question);
    await field.press('Enter');
};

// Answers a pause as a reader would: approves a plan, or picks each
// clarifying answer and sends the form when the last pick did not send it.
const answer = async (page: Page, player: Player, act: Act) => {
    const sent = player.interrupts;

    if (act.kind === 'approve') {
        await page
            .getByRole('button', { name: /^approve/i })
            .filter({ visible: true })
            .first()
            .click();

        return;
    }

    for (const label of Object.values(act.picks)) {
        await page
            .getByRole('radio', { name: label })
            .or(page.getByRole('button', { name: label, exact: true }))
            .or(page.getByRole('checkbox', { name: label }))
            .filter({ visible: true })
            .first()
            .click();
    }

    for (let waited = 0; waited < 1500 && player.interrupts === sent; waited += 100) {
        await page.waitForTimeout(100);
    }

    if (player.interrupts === sent) {
        await page
            .getByRole('button', { name: /^(submit|continue|answer|done|next)\b/i })
            .filter({ visible: true })
            .first()
            .click();
    }
};

/**
 * Plays every turn of the session's scenario. `atPause(turn, segment)` runs
 * when a segment ends on a pause, before the reader answers it.
 */
export const play = async (
    session: Session,
    atPause: (turn: number, segment: number) => Promise<void>,
    { segmentMs = 30_000 } = {},
) => {
    const { page, player } = session;

    for (const [at, turn] of player.scenario.turns.entries()) {
        for (const [index, segment] of turn.segments.entries()) {
            const ended = segmentEnd(player, at + 1, index);

            if (index === 0) {
                await ask(page, turn.question);
            } else {
                await atPause(at + 1, index - 1);
                await answer(page, player, segment.act!);
            }

            await Promise.race([
                ended,
                new Promise((_, reject) =>
                    setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `turn ${at + 1} segment ${index}: no stream ended in ${segmentMs / 1000} s`,
                                ),
                            ),
                        segmentMs,
                    ),
                ),
            ]);
            await settle(page);
        }
    }
};
