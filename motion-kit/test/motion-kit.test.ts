/**
 * The motion-kit generator: the chart's value axis as Chart.js and
 * `buildChartOptions` lay it out, what the film's modules may and may not
 * hold, the motion and plan states read from the Kenya render, and the
 * checks on specs, cue sheets, selectors and units. The chart and Kenya
 * tests bundle render.tsx with esbuild (about a second), since the renderer
 * imports the app's SCSS modules and SVG icons; the Kenya test also reads
 * the motion in Chrome and is skipped where none is installed, or fails
 * under CI.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';

import postcss from 'postcss';
import type { Browser } from 'playwright-core';

import { cssModules, FONTS, generate, loadRenderer, MODULE_LIMIT, writeFilm } from '../build.ts';
import { externalUrls, filmCss, mediaMatches, scopeSelector, toPx } from '../css.ts';
import { readCues } from '../cues.ts';
import { outfitMeasure, parseFont } from '../fontMetrics.ts';
import type { Motion } from '../motion.ts';
import { readSpec } from '../spec.ts';
import { hasBrowser, startBrowser } from './browser.ts';
import type { ChartWidget } from '../../src/lib/chat/widgets.ts';
import { plotHeight, plotShape } from '../../src/lib/studio/chartFit.ts';

const KENYA = join(import.meta.dirname, '../demos/kenya-debt-health.json');

const chart = (unit: string, series: (number | null)[][]): ChartWidget => ({
    kind: 'chart',
    id: 'c',
    chartType: 'line',
    title: 't',
    unit,
    categories: series[0]!.map((_, index) => String(2015 + index)),
    series: series.map((values, index) => ({ label: `s${index}`, values })),
});

test('the value axis takes Chart.js nice steps under four ticks, in the app format', async () => {
    const { renderer } = await loadRenderer();
    const spec = JSON.parse(await readFile(KENYA, 'utf8'));
    const kenya = spec.cards.find((card: { widget: ChartWidget }) => card.widget.kind === 'chart');
    const axis = (widget: ChartWidget, line: boolean) => {
        const layout = renderer.layoutDefaultChart(widget, { line, width: 446, fontsDir: FONTS });

        const ticks = layout.valueTicks.map((tick) => tick.label);
        const drawn = layout.texts.map((text) => text.text);

        // What the axis holds is what reaches the film as HTML text.
        assert.deepEqual(
            [
                ...ticks,
                ...widget.categories,
                ...(layout.valueTitle ? [layout.valueTitle] : []),
            ].filter((label) => !drawn.includes(label)),
            [],
        );

        return { ticks, title: layout.valueTitle };
    };

    // Max 5.67bn over at most 4 ticks: a 2bn step from zero.
    assert.deepEqual(axis(kenya.widget, true), {
        ticks: ['0', '2.0B', '4.0B', '6.0B'],
        title: 'US Dollar',
    });
    // A percentage carries its sign on the ticks and has no axis title.
    assert.deepEqual(
        axis(
            chart('Percent', [
                [12.5, 33.1, 47.9],
                [5, 9.5, null],
            ]),
            false,
        ),
        {
            ticks: ['0%', '20%', '40%', '60%'],
            title: null,
        },
    );
    // Below zero the axis takes the same step down; thousands compact.
    assert.deepEqual(
        axis(
            chart('Person', [
                [-120, 340, 910],
                [80, 200, 260],
                [0, 50, 600],
            ]),
            true,
        ),
        {
            ticks: ['-500', '0', '500', '1.0K'],
            title: 'Person',
        },
    );
});

test('a ranking wraps its labels at the bold weight it draws them in, at a settled height', async () => {
    const { renderer } = await loadRenderer();
    const ranking: ChartWidget = {
        kind: 'chart',
        id: 'r',
        chartType: 'bar',
        horizontal: true,
        title: 't',
        unit: 'USD',
        categories: ['Democratic Republic of the Congo', 'Kenya'],
        series: [{ label: 's', values: [5.2e9, 3.1e9] }],
    };
    // The gutter is 34% of the plot: at 364 px, 123.8 px, which holds the
    // name in Outfit 400 (122 px) but not in the 700 the gutter draws.
    const width = 364;
    const layout = renderer.layoutDefaultChart(ranking, { line: false, width, fontsDir: FONTS });
    const drawn = layout.texts.map((text) => text.text);

    assert.ok(drawn.includes('Democratic Republic of the'), drawn.join(' | '));
    assert.ok(drawn.includes('Congo'), drawn.join(' | '));

    // Drawn at the height its own value axis asks for, as the Studio's
    // measuring ends, for one row (whose axis Chart.js caps) and two.
    for (const rows of [1, 2]) {
        const widget = {
            ...ranking,
            categories: ranking.categories.slice(0, rows),
            series: [{ label: 's', values: [5.2e9, 3.1e9].slice(0, rows) }],
        };
        const settled = renderer.layoutDefaultChart(widget, {
            line: false,
            width,
            fontsDir: FONTS,
        });

        assert.ok(settled.band !== null && settled.band > 0);
        assert.equal(
            Math.round(
                plotHeight(plotShape(widget, false), {
                    plotWidth: width,
                    band: settled.band,
                    cell: 20,
                }),
            ),
            settled.height,
        );
    }
});

test('canvas font strings keep their weight with or without a style word', () => {
    const measure = outfitMeasure(FONTS);
    const text = 'Democratic Republic of the Congo';

    assert.deepEqual(parseFont('700 8px Outfit'), {
        style: 'normal',
        weight: '700',
        size: 8,
        family: 'Outfit',
    });
    assert.equal(parseFont('italic bold 12.5px "Outfit", sans-serif').weight, '700');
    assert.equal(parseFont('12px Outfit').weight, '400');
    assert.equal(measure('700 8px Outfit', text), measure('normal 700 8px Outfit', text));
    assert.ok(measure('700 8px Outfit', text) > measure('400 8px Outfit', text));
    assert.throws(() => parseFont('8pt Outfit'), /cannot read/);
    assert.throws(() => measure('8px DM Mono', text), /not Outfit/);
});

let browser: Browser | string;

before(async () => {
    browser = await startBrowser();
});

after(async () => {
    if (typeof browser !== 'string') {
        await browser.close();
    }
});

test('the Kenya film modules hold no motion, no outside URL and no unscoped rule', async (t) => {
    if (!hasBrowser(t, browser)) {
        return;
    }

    const out = await mkdtemp(join(tmpdir(), 'motion-kit-test-'));

    try {
        const { modules, manifest } = await generate({ specPath: KENYA, outDir: out, browser });
        const css = modules.filter((file) => file.kind === 'css').map((file) => file.text);
        const html = modules.find((file) => file.name === 'studio.html')!.text;

        for (const text of css) {
            assert.doesNotMatch(text, /@(-webkit-)?keyframes|@font-face/);
            assert.doesNotMatch(
                text,
                /(^|[;{\s])(-webkit-|-moz-)?(animation|transition)[\w-]*\s*:/,
            );
            assert.deepEqual(externalUrls(text), []);
            postcss.parse(text).walkRules((rule) => {
                for (const selector of rule.selectors) {
                    assert.match(selector, /^\.dfo-ui(?![\w-])/, selector);
                    assert.doesNotMatch(
                        selector,
                        /(^|[\s,>+~(])(:root|html|body)(?![\w-])/,
                        selector,
                    );
                }
            });
        }

        for (const file of modules) {
            assert.ok(Buffer.byteLength(file.text) <= MODULE_LIMIT, file.name);
        }

        const hooks = manifest.hooks as string[];

        for (const hook of hooks) {
            assert.equal(html.split(`data-v="${hook}"`).length - 1, 1, hook);
        }

        assert.ok(hooks.includes('series-debt-vs-health-1'));
        assert.doesNotMatch(html, /<script|<canvas|<text[\s>]/);

        // Both plan states are in the one fragment, each with its hooks.
        assert.deepEqual(manifest.states, {
            pending: { hooks: ['plan', 'plan-bar', 'plan-approve'] },
            approved: {
                hooks: ['plan-pill'],
                attrs: {
                    prompt: { placeholder: 'Ask a follow up...', 'aria-label': 'Ask a follow up' },
                },
            },
        });

        // The app's motion, read before the stylesheet dropped it: each card
        // arrives with the card's own keyframes.
        const { keyframes, animations, transitions } = manifest as unknown as Motion;
        const arrivals = animations.filter(({ name }) => /widget-in$/.test(name));

        assert.deepEqual(
            arrivals.map(({ v }) => v),
            ['card-debt-service-2024', 'card-health-aid-2024', 'card-debt-vs-health'],
        );
        assert.equal(arrivals[0]!.duration, 0.45);
        assert.deepEqual(keyframes[arrivals[0]!.name], [
            { offset: 0, style: { opacity: '0', translate: '0 10px' } },
        ]);
        assert.ok(animations.some(({ v, name }) => v === 'canvas' && /board-in$/.test(name)));
        assert.deepEqual(
            Object.keys(keyframes).toSorted(),
            [...new Set(animations.map(({ name }) => name))].toSorted(),
        );
        // A tab switch eases the view in; a segmented tab turning active eases
        // its colour.
        assert.deepEqual(
            transitions['.ChatPanel_module_viewActive']
                ?.find(({ element }) => element.v === 'view-activity')
                ?.properties.map(({ property }) => property),
            ['opacity', 'translate'],
        );
        assert.ok(
            transitions['[data-active="true"]']?.every(({ properties }) =>
                properties.some(({ property }) => property === 'color'),
            ),
        );

        // The cue sheet beside the spec rides along.
        const cues = JSON.parse(modules.find((file) => file.name === 'cues.json')!.text);

        assert.ok(
            cues.cues.some(
                ({ v, kind }: { v: string; kind: string }) =>
                    v === 'plan-approve' && kind === 'press',
            ),
        );
        assert.equal((manifest.modules as { cues?: string }).cues, 'cues.json');

        const stored = await readdir(join(out, 'store/modules'));

        assert.deepEqual(stored.toSorted(), modules.map((file) => `${file.name}.json`).toSorted());

        for (const file of modules) {
            const document = JSON.parse(
                await readFile(join(out, 'store/modules', `${file.name}.json`), 'utf8'),
            );

            assert.deepEqual(document, { kind: file.kind, text: file.text });
        }

        // The preview plays the film through the runtime: every frame is the
        // same played forwards or backwards, the prompt grows past one line
        // as the question is typed, and approval swaps the plan for its pill.
        const page = await browser.newPage();

        try {
            await page.goto(pathToFileURL(join(out, 'preview.html')).href);
            // The page mounts the film once the app's fonts have loaded.
            await page.waitForFunction('film !== null');
            assert.deepEqual(
                await page.evaluate(`[...document.fonts]
                    .filter((face) => face.status === 'loaded')
                    .map((face) => face.family + ' ' + face.weight)`),
                [
                    ...[300, 400, 500, 600, 700, 800].map((weight) => `Outfit ${weight}`),
                    ...[300, 400, 500].map((weight) => `"DM Mono" ${weight}`),
                ],
            );

            const film = await page.evaluate(() => {
                const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
                const at = (t: number) => {
                    scrub.value = String(t);
                    scrub.dispatchEvent(new Event('input'));
                };
                const shown = (hook: string) =>
                    getComputedStyle(document.querySelector(`[data-v="${hook}"]`)!).display !==
                    'none';
                const prompt = document.querySelector<HTMLTextAreaElement>('[data-v="prompt"]')!;
                const line = parseFloat(getComputedStyle(prompt).lineHeight);

                const frame = (t: number) => {
                    at(t);
                    // An emptied inline style renders as none at all.
                    return document
                        .querySelector('.dfo-desk')!
                        .outerHTML.replaceAll(' style=""', '');
                };
                const times = Array.from({ length: Math.ceil(Number(scrub.max) * 2) + 1 }, (_, i) =>
                    Math.min(i / 2, Number(scrub.max)),
                );
                const forwards = times.map(frame);
                const backwards = times.toReversed().map(frame).toReversed();
                const differ = times.filter((_, i) => forwards[i] !== backwards[i]);

                at(4.2);
                const lines = Math.round(prompt.offsetHeight / line);
                at(9.5);
                const pending = [shown('plan'), shown('plan-pill')];
                at(10.8);
                const approved = [shown('plan'), shown('plan-pill')];

                return {
                    error: document.querySelector('#error')!.textContent,
                    length: Number(scrub.max),
                    differ,
                    lines,
                    pending,
                    approved,
                };
            });

            assert.equal(film.error, '');
            assert.ok(film.length > 20, `the preview runs ${film.length} s`);
            assert.deepEqual(film.differ, []);
            assert.ok(film.lines > 1, `prompt is ${film.lines} line(s) tall`);
            assert.deepEqual(film.pending, [true, false]);
            assert.deepEqual(film.approved, [false, true]);

            // Two tab cues, to Activity at 5 s and back at 10 s: each holds
            // only from its own time, whichever order the frames come in.
            const views = (await page.evaluate(`(() => {
                stage.replaceChildren();
                const tabs = DFO.mount(kit, {}).cue([
                    { v: 'view-activity', from: 'view-chat', kind: 'tab', at: 5 },
                    { v: 'view-chat', from: 'view-activity', kind: 'tab', at: 10 },
                ]);
                const active = kit.json('manifest.json').classes.viewActive;
                const shown = (t) => {
                    tabs.render(t);
                    return ['view-chat', 'view-activity'].find((v) =>
                        document.querySelector('[data-v="' + v + '"]').classList.contains(active),
                    );
                };
                return [12, 0, 7, 12, 7, 0].map(shown);
            })()`)) as string[];

            assert.deepEqual(views, [
                'view-chat',
                'view-chat',
                'view-activity',
                'view-chat',
                'view-activity',
                'view-chat',
            ]);
        } finally {
            await page.close();
        }
    } finally {
        await rm(out, { recursive: true, force: true });
    }
});

test('media queries are decided at the viewport, and an unknown feature or type is refused', () => {
    const desktop = { width: 1280, height: 800 };

    for (const [query, matches] of [
        ['(min-width: 1024px) and (max-height: 710px)', false],
        ['(max-width: 659px), (min-width: 1024px)', true],
        ['(prefers-reduced-motion: reduce)', false],
        ['(max-width: 600px) or (min-width: 1000px)', true],
        ['not (max-width: 600px)', true],
        ['only screen and (min-width: 1000px)', true],
        ['screen and not (min-width: 1000px)', false],
        ['print', false],
        ['not print', true],
        ['all', true],
    ] as const) {
        assert.equal(mediaMatches(query, desktop), matches, query);
    }

    for (const [query, problem] of [
        ['(scripting: none)', /scripting/],
        ['(max-width: 600px) or (scripting: none)', /scripting/],
        ['tv and (min-width: 1000px)', /media type "tv"/],
        ['screen and (max-width: 600px) or (min-width: 1000px)', /media condition/],
        ['(min-width: 1px) and (max-width: 2px) or (hover: hover)', /media condition/],
        ['((min-width: 1px))', /media condition/],
    ] as const) {
        assert.throws(() => mediaMatches(query, desktop), problem, query);
    }
});

test('a stylesheet URL outside the film is found in a url() or a quoted @import', () => {
    assert.deepEqual(
        externalUrls(
            '@import "https://fonts.example/x.css"; @import url(/y.css);' +
                ' .a { background: url("data:image/png;base64,AA"); mask: url(#m); }',
        ),
        ['/y.css', 'https://fonts.example/x.css'],
    );
});

test('the stylesheet splits so each store document, escaped, fits the module limit', () => {
    // Backslashes and quotes double in JSON: the text alone would fit.
    const rule = (index: number) => `.r${index}::before { content: "${'\\"'.repeat(200)}"; }\n`;
    const css = Array.from({ length: 300 }, (_, index) => rule(index)).join('');
    const modules = cssModules(css);

    assert.ok(Buffer.byteLength(css) < MODULE_LIMIT);
    assert.ok(modules.length > 1);
    // Named as a film's store takes them.
    assert.deepEqual(
        modules.map(({ name }) => name),
        modules.map((_, index) => `dfo-ui-${index + 1}.css`),
    );

    for (const { kind, text } of modules) {
        assert.ok(Buffer.byteLength(JSON.stringify({ kind, text })) <= MODULE_LIMIT);
    }
});

test('a film replaces a previous film, never a directory of other files or a bad name', async () => {
    const out = await mkdtemp(join(tmpdir(), 'motion-kit-out-'));
    const film = join(out, 'film');
    const manifest = { name: 'manifest.json', kind: 'json', text: '{}' } as const;

    try {
        await writeFilm(film, [manifest]);
        await writeFilm(film, [manifest]);
        await mkdir(join(out, 'specs'));
        await writeFile(join(out, 'specs/demo.json'), '{}');
        await assert.rejects(writeFilm(join(out, 'specs'), [manifest]), /specs holds files/);
        assert.equal(await readFile(join(out, 'specs/demo.json'), 'utf8'), '{}');
        await assert.rejects(
            writeFilm(film, [manifest, { name: 'dfo-ui.css~1', kind: 'css', text: '' }]),
            /dfo-ui.css~1 is not a name a film's store takes/,
        );
    } finally {
        await rm(out, { recursive: true, force: true });
    }
});

test('selectors go under the wrapper, which stands for :root, html and body', () => {
    for (const [selector, scoped] of [
        ['.card', '.dfo-ui .card'],
        ['html', '.dfo-ui'],
        ['html body', '.dfo-ui'],
        [':root body .page', '.dfo-ui .page'],
        [':root[data-theme="dark"]', '.dfo-ui[data-theme="dark"]'],
        ['body > main', '.dfo-ui > main'],
        ['bodyText', '.dfo-ui bodyText'],
        ['html-root', '.dfo-ui html-root'],
    ]) {
        assert.equal(scopeSelector(selector!), scoped, selector);
    }
});

test('rem and viewport units become px at the root size and viewport', () => {
    const viewport = { width: 1280, height: 800 };

    for (const [value, px] of [
        ['1.5rem', '24px'],
        ['-.5rem 0', '-8px 0'],
        ['calc(100dvh - 2rem)', 'calc(800px - 32px)'],
        ['10vmin 10vmax', '80px 128px'],
        ['33.333vw', '426.662px'],
        ['50svh 1lvw', '400px 12.8px'],
        ['2em 10px', '2em 10px'],
    ]) {
        assert.equal(toPx(value!, viewport, 16), px, value);
    }

    // A page captured at its own root size converts at that size.
    assert.equal(toPx('2rem', viewport, 10), '20px');
});

test('a spec at a phone viewport or with a card off the grid is refused', () => {
    const spec = { title: 't', question: 'q', messages: [], cards: [] };

    assert.doesNotThrow(() => readSpec({ ...spec, viewport: { width: 660, height: 800 } }));
    assert.throws(
        () => readSpec({ ...spec, viewport: { width: 390, height: 844 } }),
        /390 px wide.*660 px/,
    );

    const card = (slot: object) => ({ ...spec, cards: [{ widget: { id: 'c' }, slot }] });

    assert.doesNotThrow(() => readSpec(card({ col: 0, row: 0, w: 24, h: 3 })));

    for (const [slot, problem] of [
        [{ col: -1, row: 0 }, /non-negative "col"/],
        [{ col: 0, row: 1.5 }, /non-negative "row"/],
        [{ col: 0, row: 0, w: '24' }, /positive "w"/],
        [{ col: 0, row: 0, h: -3 }, /positive "h"/],
        [{ col: 0, row: 0, w: 0 }, /positive "w"/],
    ] as const) {
        assert.throws(() => readSpec(card(slot)), problem, JSON.stringify(slot));
    }
});

test('a cue sheet names fragment hooks, known kinds and keys in time order', () => {
    const hooks = ['prompt', 'plan', 'plan-approve'];
    const good = {
        keys: [{ t: 0 }, { t: 1.3, hook: 'prompt', z: 1.9 }],
        cues: [{ v: 'plan-approve', kind: 'press', at: 10 }],
    };

    assert.deepEqual(readCues(good, hooks), good);

    for (const [sheet, problem] of [
        [
            {
                ...good,
                cues: [
                    { v: 'plan', sel: '.x', kind: 'press', at: 1 },
                    { v: 'gone', kind: 'show', at: 1 },
                ],
            },
            /cue 1 names "gone"/,
        ],
        [{ ...good, cues: [{ v: 'plan', kind: 'wiggle', at: 1 }] }, /kind "wiggle"/],
        [{ ...good, cues: [{ v: 'plan', kind: 'show' }] }, /start time "at"/],
        [{ ...good, keys: [{ t: 2 }, { t: 1 }] }, /key 1 at 1 s does not come after key 0 at 2 s/],
        [{ ...good, keys: [{ t: 0, hook: 'msg-9' }] }, /key 0 names "msg-9"/],
        [
            { ...good, cues: [{ v: 'plan', kind: 'tab', at: 1, from: 'view-x' }] },
            /"from" names "view-x"/,
        ],
        [{ ...good, cues: [{ v: 'plan', kind: 'tab', at: 1 }] }, /needs "from"/],
        [{ ...good, cues: [{ v: 'prompt', kind: 'type', at: 1 }] }, /needs the "text"/],
        [{ ...good, cues: [{ v: 'plan', kind: 'show', at: 1, dur: '1' }] }, /"dur" that is not/],
        [{ ...good, keys: [{ t: 0, drift: [0, 1] }] }, /"drift" as three numbers/],
        [
            { ...good, cues: [{ v: 'plan', name: 'x', kind: 'animate', at: 1 }] },
            /both a hook and keyframes/,
        ],
    ] as const) {
        assert.throws(() => readCues(sheet, hooks), problem);
    }

    assert.throws(
        () =>
            readCues({ keys: [], cues: [{ v: 'plan', kind: 'animate', at: 0 }] }, hooks, {
                animated: ['prompt'],
            }),
        /which the app does not animate/,
    );

    // A page capture's cue or key plays in every state, or in its `in` one,
    // and its hooks must be there.
    const page = {
        states: ['empty', 'typed'],
        boxes: { prompt: { empty: {}, typed: {} }, plan: { empty: null, typed: {} } },
    };
    const staged = {
        keys: [{ t: 0, hook: 'plan', in: 'typed' }],
        cues: [
            { v: 'prompt', kind: 'type', text: 'x', at: 0 },
            { v: 'plan', kind: 'show', at: 1, in: 'typed' },
        ],
    };

    assert.deepEqual(readCues(staged, hooks, { page }), staged);

    for (const [sheet, targets, problem] of [
        [{ keys: [], cues: [{ v: 'plan', kind: 'show', at: 1 }] }, { page }, /absent from empty/],
        [{ keys: [{ t: 0, in: 'done' }], cues: [] }, { page }, /not a captured state/],
        [staged, {}, /only a page capture's may/],
        [
            { keys: [], cues: [{ v: 'plan', kind: 'animate', at: 0, in: 'typed' }] },
            { page },
            /needs the Studio/,
        ],
    ] as const) {
        assert.throws(() => readCues(sheet, hooks, targets), problem);
    }
});

test('the stylesheet keeps its motion, scoped, only when asked', () => {
    const css =
        '@keyframes spin { from { rotate: 0deg } to { rotate: 1turn } } .a { animation: spin 1s; margin: 1rem }';
    const kept = filmCss(css, { width: 1280, height: 800 }, { keepMotion: true });
    const frozen = filmCss(css, { width: 1280, height: 800 });

    assert.match(kept, /@keyframes spin\s*\{\s*from\s*\{/);
    assert.match(kept, /\.dfo-ui \.a\s*\{\s*animation: spin 1s;\s*margin: 16px/);
    assert.doesNotMatch(frozen, /keyframes|animation/);
});
