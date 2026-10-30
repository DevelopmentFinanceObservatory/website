/**
 * Page capture: the page spec's validation, the sanitiser's leak check, and
 * captures of a small fixture page served from this process, so the tests
 * need Chrome (or CHROMIUM_PATH) but not the site. The browser tests skip
 * when no browser starts, and fail under CI.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';

import type { Browser } from 'playwright-core';

import { generatePage } from '../capture.ts';
import { htmlLeaks } from '../html.ts';
import { pageSteps, readPageSpec } from '../spec.ts';
import { hasBrowser, startBrowser } from './browser.ts';

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
);

const FIXTURE = `<!doctype html>
<html lang="en"><head>
<link rel="stylesheet" href="/site.css">
<style>.inline-used { color: rgb(1, 2, 3); } .inline-unused { color: red; }</style>
<script>window.loaded = true;</script>
</head>
<body class="page">
<header class="bar">Fixture</header>
<button class="go" onclick="alert(1)">Go</button>
<input class="field" type="text" placeholder="Search">
<label><input class="tick" type="checkbox"> Tick</label>
<textarea class="note"></textarea>
<img class="logo" src="/logo.png" alt="">
<img class="far" src="http://example.invalid/far.png" alt="">
<div class="tile">tile</div>
<div class="banner" style="background-image: url(/tile.png)">banner</div>
<canvas class="chart" width="40" height="20"></canvas>
<iframe src="/frame.html" width="100" height="50"></iframe>
<noscript><p>no script</p></noscript>
<a class="out" href="https://example.org/elsewhere">elsewhere</a>
<div class="list"><p>one</p><p>two</p><p>three</p><p>four</p></div>
<p class="twin">a</p><p class="twin">b</p>
<p class="inline-used">styled inline</p>
<div class="tall"></div>
<div class="wrap"><p class="pin">pinned</p></div>
<script>
const context = document.querySelector('.chart').getContext('2d');
context.fillStyle = 'rgb(0, 128, 0)';
context.fillRect(0, 0, 40, 20);
</script>
</body></html>`;

const CSS = `
body { margin: 0; padding-top: 3rem; font-size: 1rem; }
.tall { height: 1000px; }
.pin { position: fixed; top: 20px; right: 0; margin: 0; }
.bar { position: fixed; top: 0; left: 0; right: 0; height: 2rem; }
.tile { width: 50vw; background: url(/tile.png) repeat; }
.tile:hover { outline: 2px solid rgb(0, 0, 255); }
.go::before { content: '>'; }
.list { height: 40px; overflow: auto; }
.list p { height: 30px; margin: 0; }
.never-rendered { color: red; }
@media (max-width: 400px) { .tile { width: 10px; } }
@keyframes spin { to { transform: rotate(1turn); } }
`;

const serve = async () => {
    // Served once: the page loads it, and the capture's re-read finds it gone.
    let flakyServed = false;
    const server = createServer((request, response) => {
        const files: Record<string, [string, string | Buffer]> = {
            '/': ['text/html', FIXTURE],
            '/flaky': ['text/html', '<link rel="stylesheet" href="/flaky.css"><p>flaky</p>'],
            '/flaky.css': ['text/css', 'p { color: red; }'],
            '/site.css': ['text/css', CSS],
            '/logo.png': ['image/png', PNG],
            '/tile.png': ['image/png', PNG],
            '/frame.html': ['text/html', '<p>frame</p>'],
        };
        const path = new URL(request.url ?? '/', 'http://x').pathname;
        const gone = path === '/flaky.css' && flakyServed;

        flakyServed ||= path === '/flaky.css';

        const file = gone ? undefined : files[path];

        response.writeHead(file ? 200 : 404, { 'content-type': file?.[0] ?? 'text/plain' });
        response.end(file?.[1] ?? 'not found');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

test('a page spec is checked for its route, hooks, steps and states', () => {
    const spec = {
        name: 'kenya',
        path: '/data',
        hooks: [{ v: 'prompt', selector: 'textarea' }],
        steps: [
            { type: 'capture', state: 'empty' },
            { type: 'type', selector: 'textarea', text: 'Kenya' },
            { type: 'wait', ms: 10 },
            { type: 'scroll', y: 200 },
            { type: 'capture', state: 'typed' },
        ],
    };

    assert.deepEqual(readPageSpec(structuredClone(spec)), spec);

    const refusals: [unknown, RegExp][] = [
        [{ ...spec, name: 'a b' }, /"name"/],
        [{ ...spec, path: 'data' }, /"path"/],
        [{ ...spec, viewport: { width: 0, height: 800 } }, /"viewport"/],
        [
            {
                ...spec,
                hooks: [
                    { v: 'x', selector: 'a' },
                    { v: 'x', selector: 'b' },
                ],
            },
            /named twice/,
        ],
        [{ ...spec, hooks: [{ v: 'x y', selector: 'a' }] }, /hook "x y"/],
        [{ ...spec, steps: [{ type: 'drag', selector: 'a' }] }, /unknown type "drag"/],
        [{ ...spec, steps: [{ type: 'type', selector: 'a' }] }, /"text"/],
        [{ ...spec, steps: [{ type: 'click' }] }, /"selector"/],
        [{ ...spec, steps: [{ type: 'wait' }] }, /"selector" or "ms"/],
        [{ ...spec, steps: [{ type: 'scroll' }] }, /"y"/],
        [{ ...spec, steps: [{ type: 'capture', state: 'a/b' }] }, /state "a\/b"/],
        [
            {
                ...spec,
                steps: [
                    { type: 'capture', state: 'a' },
                    { type: 'capture', state: 'a' },
                ],
            },
            /captured twice/,
        ],
    ];

    for (const [raw, message] of refusals) {
        assert.throws(() => readPageSpec(raw), message);
    }

    assert.deepEqual(pageSteps({ name: 'p', path: '/', steps: [{ type: 'press', key: 'Tab' }] }), [
        { type: 'press', key: 'Tab' },
        { type: 'capture', state: 'page' },
    ]);
});

test('the leak check finds what a film cannot hold', () => {
    assert.deepEqual(
        htmlLeaks(
            '<div onclick="x()"><script>1</script><canvas></canvas>' +
                '<img src="https://example.org/a.png"><a href="/data">x</a>' +
                '<div style="background: url(&quot;/bg.png&quot;)"></div></div>',
        ),
        [
            '<script>',
            '<canvas>',
            'onclick attribute',
            'src="https://example.org/a.png"',
            'href="/data"',
            'url(/bg.png)',
        ],
    );
    assert.deepEqual(
        htmlLeaks(
            '<div><img src="data:image/png;base64,AA"><a href="#">x</a>' +
                '<div style="background: url(&quot;data:image/png;base64,AA&quot;)">once upon</div></div>',
        ),
        [],
    );
});

let browser: Browser | string;
let fixture: Awaited<ReturnType<typeof serve>>;
let out: string;

before(async () => {
    browser = await startBrowser();
    fixture = await serve();
    out = await mkdtemp(join(tmpdir(), 'motion-kit-capture-'));
});

after(async () => {
    if (typeof browser !== 'string') {
        await browser.close();
    }
    fixture.server.close();
    await rm(out, { recursive: true, force: true });
});

const capture = async (spec: unknown, name = 'fixture', cues?: unknown) => {
    const specPath = join(out, `${name}.json`);

    await writeFile(specPath, JSON.stringify(spec));

    if (cues) {
        await writeFile(join(out, `${name}.cues.json`), JSON.stringify(cues));
    }

    return generatePage({
        specPath,
        base: fixture.base,
        outDir: join(out, name),
        browser: browser as Browser,
        stepTimeout: 10_000,
    });
};

test('a fixture page captures as static markup and the CSS its states use', async (t) => {
    if (!hasBrowser(t, browser)) {
        return;
    }

    const { modules, manifest, dropped } = await capture(
        {
            name: 'fixture',
            path: '/',
            viewport: { width: 800, height: 600 },
            hooks: [
                { v: 'tile', selector: '.tile' },
                { v: 'field', selector: '.field' },
            ],
            steps: [
                { type: 'capture', state: 'start' },
                { type: 'type', selector: '.field', text: 'Kenya "debt"' },
                { type: 'type', selector: '.note', text: 'a <note>' },
                { type: 'click', selector: '.tick' },
                { type: 'scroll', selector: '.list', y: 50 },
                { type: 'scroll', y: 40 },
                { type: 'hover', selector: '.tile' },
                { type: 'capture', state: 'filled' },
            ],
        },
        'fixture',
        {
            keys: [{ t: 0 }, { t: 1, hook: 'tile', z: 2 }],
            cues: [
                { v: 'field', kind: 'type', text: 'Kenya', at: 0, cps: 10 },
                { v: 'field', kind: 'remove', at: 1, in: 'start' },
            ],
        },
    );
    const text = (name: string) => modules.find((file) => file.name === name)!.text;
    const start = text('start.html');
    const filled = text('filled.html');
    const css = text('dfo-ui.css');

    for (const html of [start, filled]) {
        assert.deepEqual(htmlLeaks(html), []);
        assert.doesNotMatch(html, /<script|<canvas|<iframe|<noscript|\son[a-z]+=/i);
        assert.doesNotMatch(html, /(?:src|href)="(?!data:|#)/);
        // The canvas's pixels, as an image of the size it was laid out at.
        assert.match(html, /<img class="chart" [^>]*src="data:image\/png;base64,/);
        assert.match(html, /src="data:image\/png;base64,[^"]+" alt=""/);
        assert.match(html, /^<div class="dfo-ui" data-viewport="800x600" data-state="\w+"/);
        assert.match(
            html,
            /<div lang="en" data-mk-html=""><div class="page"[^>]* data-mk-body="">/,
        );
        assert.match(html, /<div class="tile" data-v="tile"/);
    }

    assert.match(
        filled,
        /class="field" type="text" placeholder="Search" data-v="field" value="Kenya &quot;debt&quot;"/,
    );
    assert.match(filled, /<textarea class="note"[^>]*>a &lt;note&gt;<\/textarea>/);
    assert.match(filled, /class="tick" type="checkbox"[^>]*checked=""/);
    assert.doesNotMatch(start, /checked/);
    // The list's children move up by its scroll; the body's by the window's,
    // and the fixed bar stays where it shows.
    assert.match(filled, /<p style="translate: 0px -50px;">one/);
    assert.match(
        filled,
        /<div class="tile" data-v="tile" data-mk-hover="" style="translate: 0px -40px;">/,
    );
    // A style rewritten for its url() keeps the shift.
    assert.match(
        filled,
        /<div class="banner" style="background-image: url\(&quot;data:image\/png;base64,[^"]+; translate: 0px -40px;">/,
    );
    assert.match(filled, /<header class="bar">/);
    assert.ok(
        dropped.some((line) => line.startsWith('<img src="http://example.invalid/far.png">')),
    );
    assert.ok(dropped.some((line) => line.startsWith('<iframe src="/frame.html">')));

    assert.match(css, /\.dfo-ui \.tile\[data-mk-hover\] \{\s*outline/);
    assert.match(css, /\.dfo-ui \.inline-used/);
    assert.match(css, /url\("data:image\/png;base64,/);
    assert.match(
        css,
        /\.dfo-ui \[data-mk-body\] \{\s*margin: 0;\s*padding-top: 48px;\s*font-size: 16px/,
    );
    assert.match(css, /\.dfo-ui \.go::before/);
    assert.match(css, /width: 400px/);
    assert.doesNotMatch(css, /never-rendered|inline-unused|@keyframes|width: 10px/);

    assert.deepEqual(manifest.modules, {
        css: ['dfo-ui.css'],
        html: { start: 'start.html', filled: 'filled.html' },
        cues: 'cues.json',
    });
    assert.deepEqual(manifest.hooks, ['tile', 'field']);

    const boxes = manifest.boxes as Record<string, Record<string, { y: number } | null>>;

    assert.equal(boxes.tile!.filled!.y, boxes.tile!.start!.y - 40);

    const stored = await readdir(join(out, 'fixture/store/modules'));

    assert.deepEqual(stored.toSorted(), modules.map((file) => `${file.name}.json`).toSorted());
    assert.equal(
        JSON.parse(await readFile(join(out, 'fixture/store/modules/filled.html.json'), 'utf8'))
            .kind,
        'html',
    );

    // The preview plays the capture's cue sheet on the state it opens.
    const page = await browser.newPage();

    try {
        await page.goto(
            `${pathToFileURL(join(out, 'fixture/preview.html')).href}?state=filled&t=2`,
        );
        await page.waitForFunction('film !== null');
        assert.equal(await page.locator('#error').textContent(), '');
        assert.equal(await page.locator('#state').inputValue(), 'filled');
        assert.equal(await page.locator('[data-v="field"]').inputValue(), 'Kenya');
        // The runtime places a hook where the capture saw it, scrolled.
        const placed = (await page.evaluate(
            `film.box(document.querySelector('[data-v="tile"]')).y`,
        )) as number;
        const fit = Math.min(1920 / 800, 1080 / 600);

        // Within two px of the page; ignoring the scroll puts it 40 px off.
        assert.ok(
            Math.abs(placed - (1080 - 600 * fit) / 2 - boxes.tile!.filled!.y * fit) < 2 * fit,
            `placed at ${placed}`,
        );

        // A fixed element inside an unscrolled wrapper stays where it showed,
        // 20 px from the top, however far down the page the wrapper starts.
        const pinned = (await page.evaluate(
            `film.box(document.querySelector('.dfo-frame .pin')).y`,
        )) as number;

        assert.ok(Math.abs(pinned - 20 * fit) < 2 * fit, `pinned at ${pinned}`);

        // The cue `in` the other state is left out.
        assert.ok(await page.locator('[data-v="field"]').isVisible());

        // In its own state the `remove` hides the field from 1 s, and
        // scrubbing back before it shows the field again.
        const scrub = (t: number) =>
            page.locator('#scrub').evaluate((input: HTMLInputElement, value) => {
                input.value = String(value);
                input.dispatchEvent(new Event('input'));
            }, t);

        await page.locator('#state').selectOption('start');
        await scrub(2);
        assert.ok(await page.locator('[data-v="field"]').isHidden());
        await scrub(0.5);
        assert.ok(await page.locator('[data-v="field"]').isVisible());
    } finally {
        await page.close();
    }
});

test('a hook must find one element: never none in every state, never two', async (t) => {
    if (!hasBrowser(t, browser)) {
        return;
    }

    await assert.rejects(
        capture({ name: 'twin', path: '/', hooks: [{ v: 'twin', selector: '.twin' }] }, 'twin'),
        /hook "twin": "\.twin" matches 2 elements/,
    );
    await assert.rejects(
        capture({ name: 'none', path: '/', hooks: [{ v: 'gone', selector: '.gone' }] }, 'none'),
        /hook "gone": "\.gone" matches nothing in any state/,
    );
});

test('a stylesheet the server no longer has fails the capture', async (t) => {
    if (!hasBrowser(t, browser)) {
        return;
    }

    await assert.rejects(
        capture({ name: 'flaky', path: '/flaky' }, 'flaky'),
        /stylesheet http:\/\/[\d.:]+\/flaky\.css answered 404/,
    );
});
