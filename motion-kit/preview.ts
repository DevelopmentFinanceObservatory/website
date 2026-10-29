/**
 * `preview.html`, written beside a film's modules: one page that mounts the
 * film in a stand-in for Motion's stage and plays it from its cue sheet, so a
 * film can be checked in a browser before its modules go to Motion. It holds
 * every module inline and opens from disk.
 *
 * The stand-in implements the part of Motion's `kit` that the runtime and
 * the film's scenes call: `stage`, `module`, `json`, `css`, `h`, `el`,
 * `seg`, `lerp`, the `eo`, `ei`, `eio` and `eob` eases and `typist`. A
 * scene's own timing is absent: the page plays the cue sheet from 0 to the
 * runtime's `end`, when its last cue or camera hold ends. `?t=4.2` opens it paused at 4.2 s, and
 * `?state=typed` opens a captured page's state.
 */

import type { Module } from './build.ts';

// Escapes `<` so no module text can close the inline script.
const inline = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export const previewHtml = (title: string, modules: Module[]): string => {
    const texts = Object.fromEntries(modules.map((file) => [file.name, file.text]));

    return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${title.replace(/[<&]/g, '')} preview</title>
<style>
    body { margin: 0; background: #1d1d1f; color: #eee; font: 13px system-ui, sans-serif; }
    #bar { display: flex; gap: 12px; align-items: center; padding: 10px 16px; }
    #bar input[type=range] { flex: 1; }
    #time { font-variant-numeric: tabular-nums; width: 9ch; }
    #error { color: #ff8a80; white-space: pre-wrap; padding: 0 16px; }
    #stage { position: relative; width: 1920px; height: 1080px; overflow: hidden; transform-origin: 0 0; background: #fff; }
</style>
<div id="bar">
    <button id="play" type="button">Play</button>
    <input id="scrub" type="range" min="0" step="0.01" value="0">
    <span id="time"></span>
    <select id="state" hidden></select>
</div>
<div id="error"></div>
<div id="stage"></div>
<script>
const MODULES = ${inline(texts)};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const stage = document.getElementById('stage');
const kit = {
    stage,
    module: (name) => MODULES[name] ?? null,
    json: (name) => JSON.parse(MODULES[name]),
    css(text) {
        const style = document.createElement('style');
        style.textContent = text;
        stage.append(style);
    },
    h(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstElementChild;
    },
    el(tag, options = {}) {
        const el = document.createElement(tag);
        if (options.text != null) el.textContent = options.text;
        return el;
    },
    seg: (t, a, b) => clamp01((t - a) / (b - a)),
    lerp: (a, b, p) => a + (b - a) * p,
    eo: (x) => 1 - (1 - x) ** 3,
    ei: (x) => x ** 3,
    eio: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
    eob: (x, s = 1.4) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
    typist: (text, t0, cps) => ({
        at: (t) => text.slice(0, Math.max(0, Math.floor((t - t0) * cps))),
        end: t0 + text.length / cps,
    }),
};

const params = new URLSearchParams(location.search);
const cues = MODULES['cues.json'] ? kit.json('cues.json') : { keys: [], cues: [] };
let length = 1;
const scrub = document.getElementById('scrub');
const time = document.getElementById('time');
const play = document.getElementById('play');
const select = document.getElementById('state');
const html = kit.json('manifest.json').modules.html;
let film = null;
let playing = null;

const fit = () => {
    const scale = Math.min(innerWidth / 1920, (innerHeight - 60) / 1080);
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.marginBottom = 1080 * (scale - 1) + 'px';
};

const show = (t) => {
    scrub.value = t;
    time.textContent = (+t).toFixed(2) + ' s';
    try {
        film?.render(+t);
    } catch (error) {
        document.getElementById('error').textContent = error.stack;
        throw error;
    }
};

const mount = (state) => {
    stage.replaceChildren();
    try {
        new Function('kit', MODULES['shared.js'])(kit);
        film = DFO.mount(kit, { keys: cues.keys, state }).cue(cues.cues);
        length = Math.max(1, film.end);
        scrub.max = length;
    } catch (error) {
        document.getElementById('error').textContent = error.stack;
        throw error;
    }
    show(scrub.value);
};

if (typeof html !== 'string') {
    select.hidden = false;
    for (const name of Object.keys(html)) select.add(new Option(name, name));
    select.value = params.get('state') ?? select.value;
    select.onchange = () => mount(select.value);
}

scrub.value = params.get('t') ?? 0;
scrub.oninput = () => show(scrub.value);
play.onclick = () => {
    if (playing) {
        cancelAnimationFrame(playing);
        playing = null;
        play.textContent = 'Play';
        return;
    }
    const from = +scrub.value >= length ? 0 : +scrub.value;
    const start = performance.now();
    play.textContent = 'Pause';
    const frame = (now) => {
        const t = Math.min(length, from + (now - start) / 1000);
        show(t);
        playing = t < length ? requestAnimationFrame(frame) : null;
        if (!playing) play.textContent = 'Play';
    };
    playing = requestAnimationFrame(frame);
};
addEventListener('resize', fit);
fit();
mount(typeof html === 'string' ? undefined : select.value);
</script>
</html>
`;
};
