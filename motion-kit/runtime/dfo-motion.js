// The film's shared.js: places a generated Studio or a captured page on a
// Motion stage and animates it from a cue sheet. Runs once before any scene;
// each scene calls DFO.mount(kit, …) with its own kit. Plain ES, no imports:
// Motion runs it as-is in its sandbox.
//
// What the app does in JavaScript is mirrored here from its components:
// PromptForm grows its field up to MAX_LINES, and ChatPanel pins the
// transcript to its latest line. What the app does in CSS plays from the
// manifest's own keyframes, timings and easing (cue kind `animate`).
window.DFO = (() => {
    const STAGE = { width: 1920, height: 1080 };

    // PromptForm.tsx MAX_LINES.
    const PROMPT_MAX_LINES = 5;

    const manifestOf = (kit) => JSON.parse(kit.module('manifest.json'));

    const cssOf = (kit, manifest) =>
        manifest.modules.css.map((name) => kit.module(name)).join('\n');

    // CSS easing functions, as the browser evaluates them.
    const bezier = (x1, y1, x2, y2) => {
        const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
        return (x) => {
            if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
            let lo = 0;
            let hi = 1;
            for (let i = 0; i < 40; i++) {
                const mid = (lo + hi) / 2;
                if (at(x1, x2, mid) < x) lo = mid;
                else hi = mid;
            }
            return at(y1, y2, (lo + hi) / 2);
        };
    };
    const NAMED = {
        linear: (x) => x,
        ease: bezier(0.25, 0.1, 0.25, 1),
        'ease-in': bezier(0.42, 0, 1, 1),
        'ease-out': bezier(0, 0, 0.58, 1),
        'ease-in-out': bezier(0.42, 0, 0.58, 1),
    };
    const easing = (spec) => {
        if (NAMED[spec]) return NAMED[spec];
        const cubic = /^cubic-bezier\(([^)]+)\)$/.exec(spec);
        if (cubic) return bezier(...cubic[1].split(',').map(Number));
        const steps = /^steps\((\d+)(?:,\s*([\w-]+))?\)$/.exec(spec);
        if (steps) {
            const n = Number(steps[1]);
            const start = steps[2] === 'jump-start' || steps[2] === 'start';
            return (x) => Math.min(1, Math.floor(x * n + (start ? 1 : 0)) / n);
        }
        throw new Error('DFO: unknown easing ' + spec);
    };

    // Where a keyframe list leaves a property unset at 0% or 100%, the element
    // shows its own value: opacity 1, no offset, no scaling.
    const NUMBER = /-?\d*\.?\d+(?:e-?\d+)?/g;
    const resting = (prop, sample) => {
        if (prop === 'opacity') return '1';
        if (prop === 'translate') return sample.replace(NUMBER, '0');
        if (prop === 'scale') return sample.replace(NUMBER, '1');
        if (prop === 'transform') {
            return sample.replace(
                /([a-zA-Z3]+)\(([^)]*)\)/g,
                (_, fn, args) =>
                    fn + '(' + args.replace(NUMBER, /^scale/.test(fn) ? '1' : '0') + ')',
            );
        }
        return null;
    };
    // Interpolates two values of one shape number by number; a value of
    // another shape switches at the midpoint, as discrete CSS properties do.
    const mix = (a, b, p) => {
        const an = a.match(NUMBER) ?? [];
        const bn = b.match(NUMBER) ?? [];
        if (an.length !== bn.length || a.replace(NUMBER, '#') !== b.replace(NUMBER, '#')) {
            return p < 0.5 ? a : b;
        }
        let i = 0;
        return a.replace(NUMBER, () => {
            const v = Number(an[i]) + (Number(bn[i]) - Number(an[i])) * p;
            i++;
            return String(Math.round(v * 1000) / 1000);
        });
    };

    // A keyframe list as full 0%..100% steps, each holding every property.
    const steps = (frames) => {
        const props = [...new Set(frames.flatMap((f) => Object.keys(f.style)))];
        const sorted = [...frames].sort((a, b) => a.offset - b.offset);
        const ends = [];
        if (sorted[0].offset > 0) ends.push({ offset: 0, style: {} });
        ends.push(...sorted);
        if (sorted[sorted.length - 1].offset < 1) ends.push({ offset: 1, style: {} });
        for (const prop of props) {
            const sample = sorted.find((f) => f.style[prop] != null).style[prop];
            for (const f of ends) {
                if (f.style[prop] == null) f.style = { ...f.style, [prop]: resting(prop, sample) };
            }
        }
        return { props, frames: ends };
    };
    const sample = ({ props, frames }, p) => {
        const out = {};
        let i = 0;
        while (i < frames.length - 2 && frames[i + 1].offset <= p) i++;
        const a = frames[i];
        const b = frames[i + 1];
        const local = b.offset === a.offset ? 1 : (p - a.offset) / (b.offset - a.offset);
        for (const prop of props) {
            const from = a.style[prop];
            const to = b.style[prop];
            out[prop] =
                from == null || to == null ? (local < 0.5 ? from : to) : mix(from, to, local);
        }
        return out;
    };

    // One CSS animation from the manifest, as a function of seconds since it
    // was triggered: null where the element shows its own style.
    const player = (entry, frames) => {
        const ease = easing(entry.timing);
        const fill = entry.fill;
        const runs = entry.iterations === 'infinite' ? Infinity : entry.iterations;
        const plan = steps(frames);
        // Iteration `pass` at progress p, in the direction it plays.
        const at = (pass, p) => {
            const odd = pass % 2 === 1;
            const back =
                entry.direction === 'reverse' ||
                (entry.direction === 'alternate' && odd) ||
                (entry.direction === 'alternate-reverse' && !odd);
            return sample(plan, ease(back ? 1 - p : p));
        };
        return (local) => {
            const t = local - entry.delay;
            if (t < 0) return fill === 'backwards' || fill === 'both' ? at(0, 0) : null;
            const total = entry.duration * runs;
            if (t >= total) {
                if (fill !== 'forwards' && fill !== 'both') return null;
                const part = runs % 1;
                return part ? at(Math.floor(runs), part) : at(runs - 1, 1);
            }
            return at(Math.floor(t / entry.duration), (t % entry.duration) / entry.duration);
        };
    };

    // Wraps every word inside `el` in a span, once, and returns the spans in
    // reading order, so a cue can reveal them by count.
    const wordSpans = (kit, el) => {
        const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = [];

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeValue.trim()) nodes.push(node);
        }

        const spans = [];

        for (const node of nodes) {
            const frag = el.ownerDocument.createDocumentFragment();

            for (const part of node.nodeValue.split(/(\s+)/)) {
                if (!part) continue;
                if (/^\s+$/.test(part)) {
                    frag.append(part);
                    continue;
                }
                const span = kit.el('span', { text: part });
                spans.push(span);
                frag.append(span);
            }
            node.replaceWith(frag);
        }

        return spans;
    };

    // Prepares one cue against the mounted fragment; returns `apply(t)`, the
    // elements whose style it writes (`touches`), whether it sets attributes
    // or classes instead (`attrs`) and the time it ends. Every
    // frame starts from those elements' own inline styles (`mount` restores
    // them), so a cue writes only what it shows at t, and cues apply in list
    // order: a later cue on the same element wins.
    const prepare = (kit, studio, cue) => {
        const { seg, eo, ei, eob, lerp } = kit;

        if (cue.kind === 'animate') {
            // Plays the app's own animation: every manifest entry on the hook
            // (or inside it, or with that keyframe name), triggered at `at`.
            const entries = (studio.manifest.animations ?? []).filter((a) =>
                cue.name
                    ? a.name === cue.name
                    : a.v === cue.v && (cue.sel == null || a.sel === cue.sel),
            );
            if (!entries.length)
                throw new Error('DFO: no app animation for ' + (cue.name ?? cue.v));
            const runs = entries.map((entry) => {
                const el = entry.v
                    ? studio.q(entry.v, entry.sel)
                    : studio.root.querySelector(entry.sel);
                if (!el) throw new Error('DFO: nothing at ' + entry.sel);
                return { el, play: player(entry, studio.manifest.keyframes[entry.name]) };
            });
            const end = Math.max(
                ...entries.map((a) =>
                    a.iterations === 'infinite' ? 0 : a.delay + a.duration * a.iterations,
                ),
            );
            return {
                touches: runs.map((r) => r.el),
                end: cue.at + end,
                apply(t) {
                    for (const { el, play } of runs) {
                        const style = play(t - cue.at);
                        for (const prop of Object.keys(style ?? {})) el.style[prop] = style[prop];
                    }
                },
            };
        }

        if (cue.kind === 'state') {
            // Switches the fragment's attributes to a manifest state's, as the
            // app does when the plan is approved (the prompt's placeholder).
            const attrs = studio.manifest.states?.[cue.to]?.attrs ?? {};
            const changes = Object.entries(attrs).flatMap(([hook, values]) =>
                Object.entries(values).map(([name, value]) => {
                    const el = studio.q(hook);
                    return { el, name, value, was: el.getAttribute(name) };
                }),
            );
            return {
                touches: [],
                attrs: true,
                end: cue.at,
                apply(t) {
                    for (const c of changes) {
                        const v = t >= cue.at ? c.value : c.was;
                        if (v == null) c.el.removeAttribute(c.name);
                        else c.el.setAttribute(c.name, v);
                    }
                },
            };
        }

        const el = studio.q(cue.v, cue.sel);
        const s = el.style;
        const dur = cue.dur ?? 0.4;
        const only = (end, apply) => ({ touches: [el], end, apply });
        // An entering element takes no room before its time.
        const before = (t) => {
            if (t >= cue.at) return false;
            s.display = 'none';
            return true;
        };

        switch (cue.kind) {
            case 'show':
                // dur 0: the element simply appears, as a new message does.
                return only(cue.at + dur, (t) => {
                    if (before(t) || !dur) return;
                    const p = eo(seg(t, cue.at, cue.at + dur));
                    s.opacity = p;
                    s.transform = 'translateY(' + lerp(cue.dy ?? 10, 0, p) + 'px)';
                });
            case 'pop': {
                // For film overlays; product cards use `animate`.
                const end = cue.at + (cue.dur ?? 0.45);
                return only(end, (t) => {
                    if (before(t)) return;
                    const p = seg(t, cue.at, end);
                    s.opacity = eo(Math.min(1, p * 1.6));
                    s.transform = 'scale(' + lerp(0.94, 1, eob(p, 1.5)) + ')';
                });
            }
            case 'stream': {
                // The words are spans of the cue's own, so they keep their
                // state between frames and change only when the count does.
                const spans = wordSpans(kit, el);
                const wps = cue.wps ?? 9;
                let shown = -1;
                return only(cue.at + spans.length / wps, (t) => {
                    before(t);
                    const n = Math.max(0, Math.min(spans.length, Math.floor((t - cue.at) * wps)));
                    if (n === shown) return;
                    // Unstreamed words take no room, so the transcript grows
                    // line by line as the app's does.
                    spans.forEach((span, i) => (span.style.display = i < n ? '' : 'none'));
                    shown = n;
                });
            }
            case 'draw': {
                if (typeof el.getTotalLength !== 'function')
                    throw new Error('DFO: a draw cue needs an SVG shape at ' + cue.v);
                const length = el.getTotalLength();
                const points = cue.points ? studio.q(cue.points) : null;
                const end = cue.at + (cue.dur ?? 1.6);
                return {
                    touches: points ? [el, points] : [el],
                    end,
                    apply(t) {
                        if (before(t)) return;
                        const p = kit.eio(seg(t, cue.at, end));
                        s.strokeDasharray = String(length);
                        s.strokeDashoffset = String(length * (1 - p));
                        if (points) points.style.opacity = p >= 1 ? 1 : 0;
                    },
                };
            }
            case 'type': {
                const typer = kit.typist(cue.text, cue.at, cue.cps ?? 24);
                return only(Math.max(typer.end, cue.clearAt ?? 0), (t) => {
                    const text = cue.clearAt != null && t >= cue.clearAt ? '' : typer.at(t);
                    el.value = text;
                    el.textContent = text;
                    // PromptForm's own sizing: the field's content height,
                    // capped at MAX_LINES lines.
                    s.height = 'auto';
                    const line = parseFloat(getComputedStyle(el).lineHeight) || el.scrollHeight;
                    s.height = Math.min(el.scrollHeight, line * PROMPT_MAX_LINES) + 'px';
                });
            }
            case 'press':
                return only(cue.at + 0.16, (t) => {
                    if (t < cue.at) return;
                    s.transform =
                        'scale(' +
                        (1 - 0.06 * Math.sin(Math.PI * seg(t, cue.at, cue.at + 0.16))) +
                        ')';
                });
            case 'remove':
                // Gone at once, as the app unmounts it (the pending plan on approval).
                return only(cue.at, (t) => {
                    if (t >= cue.at) s.display = 'none';
                });
            case 'hide':
                // For film overlays: fades out, then folds the height it has
                // as earlier cues leave it.
                return only(cue.at + 0.2 + dur, (t) => {
                    if (t < cue.at) return;
                    const height = el.offsetHeight;
                    const fold = kit.eio(seg(t, cue.at + 0.2, cue.at + 0.2 + dur));
                    s.opacity = 1 - ei(seg(t, cue.at, cue.at + 0.25));
                    if (fold <= 0) return;
                    s.overflow = 'hidden';
                    s.height = lerp(height, 0, fold) + 'px';
                    if (fold < 1) return;
                    s.marginTop = s.marginBottom = '0';
                    s.visibility = 'hidden';
                });
            case 'tab': {
                // Switches the chat panel between Chat and Activity at `at`.
                const active = studio.manifest.classes?.viewActive;
                if (!active) throw new Error('DFO: a tab cue needs the Studio, not a page capture');
                const from = studio.q(cue.from);
                return {
                    touches: [],
                    attrs: true,
                    end: cue.at,
                    apply(t) {
                        const on = t >= cue.at;
                        el.classList.toggle(active, on);
                        from.classList.toggle(active, !on);
                    },
                };
            }
            default:
                throw new Error('DFO: unknown cue kind ' + cue.kind + ' on ' + cue.v);
        }
    };

    /**
     * Mounts the generated Studio, or one captured page state, in a scene.
     * Options: `state` (a captured page's state; default its first), `keys`
     * (camera keys; a key may name a `hook` to centre on), `fit` (scale on
     * top of fitting the stage), `desk` (the colour around the frame). A
     * capture's key or cue that names a state in `in` plays in that state only.
     * Returns:
     * - q(hook, sel?): the element with that data-v hook, or `sel` inside it;
     * - focus(hook, z): a camera key centred on that element;
     * - cue(list): adds cues; render(t): applies cues, then the camera;
     * - end: when the last cue or camera hold ends, in seconds.
     *
     * Camera keys are {t, cx, cy, z, hold?, from?, drift?} in stage px, where
     * the whole frame fits the stage at z = 1: the view rests on a key for
     * `hold` seconds, then eases to the next one, arriving at its `t`. A key
     * that names a hook follows that element where the layout has put it at
     * that moment.
     */
    const mount = (kit, options = {}) => {
        const manifest = manifestOf(kit);
        const { width, height } = manifest.viewport;
        const fit = Math.min(STAGE.width / width, STAGE.height / height) * (options.fit ?? 1);
        const left = (STAGE.width - width * fit) / 2;
        const top = (STAGE.height - height * fit) / 2;

        kit.css(cssOf(kit, manifest));
        kit.css(
            '.dfo-desk { position:absolute; inset:0; overflow:hidden; background:' +
                (options.desk ?? '#ecece0') +
                ' }' +
                '.dfo-cam { position:absolute; left:0; top:0; width:' +
                STAGE.width +
                'px; height:' +
                STAGE.height +
                'px; transform-origin:0 0 }' +
                '.dfo-frame { position:absolute; transform-origin:0 0; border-radius:14px; overflow:hidden;' +
                ' box-shadow:0 24px 70px rgba(0,0,0,.12) }',
        );

        const desk = kit.h(
            '<div class="dfo-desk"><div class="dfo-cam"><div class="dfo-frame"></div></div></div>',
        );
        const camLayer = desk.firstChild;
        const frame = camLayer.firstChild;
        // A Studio render has one fragment; a page capture has one per state.
        const html = manifest.modules.html;
        const state =
            typeof html === 'string' ? undefined : (options.state ?? Object.keys(html)[0]);
        const file = state === undefined ? html : html[state];
        if (!file) throw new Error('DFO: no captured state ' + state);
        // A capture's cue or key with `in` plays in that state only.
        const here = (item) => item.in == null || item.in === state;
        frame.innerHTML = kit.module(file);
        Object.assign(frame.style, {
            left: left + 'px',
            top: top + 'px',
            width: width + 'px',
            height: height + 'px',
            transform: 'scale(' + fit + ')',
        });
        kit.stage.append(desk);

        // ChatPanel keeps its transcript at scrollTop = scrollHeight. A film
        // cannot scroll an element, so the same offset moves the transcript's
        // children with `translate`, which no cue uses.
        const transcript = frame.querySelector('[data-v="view-chat"] [class*="chatScroll"]');
        const pin = () => {
            if (!transcript) return;
            for (const child of transcript.children) child.style.translate = '';
            const shift = Math.max(0, transcript.scrollHeight - transcript.clientHeight);
            for (const child of transcript.children) {
                child.style.translate = shift ? '0 ' + -shift + 'px' : '';
            }
        };

        const cues = [];
        let keys = [];
        // Each element a cue styles, with its own inline style, which every
        // frame starts from so no cue's value outlives its time.
        const own = new Map();
        const apply = (t) => {
            for (const [el, style] of own) el.setAttribute('style', style);
            // Attributes and classes first (`state` and `tab`): a cue that
            // measures, such as the prompt's height under its placeholder,
            // must see this frame's.
            for (const c of cues) if (c.attrs) c.apply(t);
            for (const c of cues) if (!c.attrs) c.apply(t);
        };

        // An element's box in stage px at z = 1, as it shows inside the frame:
        // the frame's own rendered size gives the scale above it (the fit, the
        // camera and the player's scaling of the stage), so every transform
        // inside the frame counts, the transcript pin and a capture's scroll
        // offset among them.
        const box = (el) => {
            if (!frame.contains(el) || !el.getClientRects().length)
                throw new Error('DFO: cannot place ' + (el.dataset.v ?? el.className));
            const f = frame.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            const scale = f.width / frame.offsetWidth;
            return {
                x: left + ((r.left - f.left) / scale) * fit,
                y: top + ((r.top - f.top) / scale) * fit,
                w: (r.width / scale) * fit,
                h: (r.height / scale) * fit,
            };
        };

        // A key that names a hook centres on that element as the layout
        // stands at the key's own time: the cues are applied at k.t to
        // measure it. A fixed time gives a fixed layout, so it is measured
        // once.
        const placed = new Map();
        const point = (k) => {
            if (!k.hook) return k;
            if (!placed.has(k)) {
                apply(k.t);
                pin();
                const r = box(studio.q(k.hook));
                placed.set(k, { ...k, cx: r.x + r.w / 2, cy: r.y + r.h / 2 });
            }
            return placed.get(k);
        };

        const view = (t) => {
            const at = (k, s) => {
                const d = k.drift ?? [0, 0, 0];
                const dt = Math.max(0, s - k.t);
                return {
                    cx: k.cx + d[0] * dt,
                    cy: k.cy + d[1] * dt,
                    lz: Math.log(k.z) + d[2] * dt,
                };
            };
            let i = 0;
            while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
            const a = point(keys[i]);
            const next = keys[i + 1];
            if (!next || t <= a.t) return at(a, Math.max(t, a.t));
            const from = next.from ?? a.t + (a.hold ?? 0);
            if (t <= from) return at(a, t);
            const b = point(next);
            const p = kit.eio(kit.seg(t, from, b.t));
            const s = at(a, from);
            return {
                cx: kit.lerp(s.cx, b.cx, p),
                cy: kit.lerp(s.cy, b.cy, p),
                lz: kit.lerp(s.lz, Math.log(b.z), p),
            };
        };

        const studio = {
            manifest,
            root: frame,
            // `sel` narrows to a descendant, for controls with no hook of their own.
            q(hook, sel) {
                const base = '[data-v="' + hook + '"]';
                const el = frame.querySelector(sel ? base + ' ' + sel : base);
                if (!el) throw new Error('DFO: nothing at ' + hook + (sel ? ' ' + sel : ''));
                return el;
            },
            box,
            focus(hook, z = 1.6) {
                const r = box(studio.q(hook));
                return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, z };
            },
            cue(list) {
                for (const c of list.filter(here)) {
                    const prepared = prepare(kit, studio, c);
                    for (const el of prepared.touches) {
                        if (!own.has(el)) own.set(el, el.getAttribute('style') ?? '');
                    }
                    cues.push(prepared);
                }
                return studio;
            },
            // When the last cue ends or the camera's last hold does.
            get end() {
                const last = keys[keys.length - 1];
                return Math.max(last.t + (last.hold ?? 0), ...cues.map((c) => c.end));
            },
            render(t) {
                // The camera first: placing a key may apply the cues at
                // another time, so the cues for t come after.
                const v = view(t);
                apply(t);
                pin();
                const z = Math.exp(v.lz);
                camLayer.style.transform =
                    'translate(' +
                    (STAGE.width / 2 - v.cx * z) +
                    'px,' +
                    (STAGE.height / 2 - v.cy * z) +
                    'px) scale(' +
                    z +
                    ')';
            },
        };

        const wide = { cx: STAGE.width / 2, cy: STAGE.height / 2, z: 1 };
        // No keys holds the whole stage in view.
        const mine = (options.keys ?? []).filter(here);
        keys = (mine.length ? mine : [{ t: 0 }]).map((k) => ({ ...wide, ...k }));
        return studio;
    };

    return { mount };
})();
