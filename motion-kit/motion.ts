import type { Page } from 'playwright-core';
import postcss from 'postcss';

import type { StateClasses } from './stateClasses.ts';
import { WRAPPER } from './spec.ts';

/**
 * The app's own motion, read as data before the film's stylesheet drops
 * it. The fragment is loaded in Chrome under the stylesheet with its motion
 * kept (`filmCss(…, { keepMotion: true })`), so the cascade, custom
 * properties and the `animation` and `transition` shorthands resolve as the
 * Studio resolves them.
 *
 * - `animations`: every element (and `::before`/`::after`) whose computed
 *   `animation-name` is not `none`, with the animation's timing.
 * - `keyframes`: the declared steps of each keyframes rule those name.
 * - `transitions`: what a state class or attribute toggle changes and how
 *   it eases there. A toggle is a state class a component adds beside one of
 *   the element's classes (stateClasses.ts), or a value the stylesheet names
 *   for an attribute the element carries (`[data-active="true"]`). A toggle
 *   is listed when it changes the computed value of a property the element,
 *   or one inside it, transitions in the state it lands in.
 */

/** An element of the fragment: a hook (`v`), `sel` inside a hook, or `sel`
 *  alone from the fragment's root, as the runtime's `q(v, sel)` reads. */
export type Target = { v?: string; sel?: string };

export type AnimationEntry = Target & {
    pseudo?: '::before' | '::after';
    name: string;
    // Seconds.
    duration: number;
    timing: string;
    delay: number;
    iterations: number | 'infinite';
    fill: string;
    direction: string;
};

export type Keyframe = { offset: number; style: Record<string, string> };

export type TransitionTiming = {
    property: string;
    duration: number;
    timing: string;
    delay: number;
};

export type TransitionEntry = {
    // `add` or `remove` for a class; `set` gives an attribute the value the
    // key names.
    toggle: 'add' | 'remove' | 'set';
    on: Target;
    element: Target;
    properties: TransitionTiming[];
};

export type Motion = {
    keyframes: Record<string, Keyframe[]>;
    animations: AnimationEntry[];
    // By toggle: `.class` or `[attribute="value"]`.
    transitions: Record<string, TransitionEntry[]>;
};

// --- stylesheet ---------------------------------------------------------------

/** Each `data-*` or `aria-*` attribute an `[name="value"]` selector
 *  tests, with the values it tests for. */
export const attributeValues = (css: string): Record<string, string[]> => {
    const values = new Map<string, Set<string>>();

    postcss.parse(css).walkRules((rule) => {
        for (const match of rule.selector.matchAll(
            /\[((?:data|aria)-[\w-]+)=(?:"([^"]*)"|'([^']*)'|([\w-]+))\]/g,
        )) {
            const name = match[1]!;

            values.set(
                name,
                (values.get(name) ?? new Set()).add(match[2] ?? match[3] ?? match[4]!),
            );
        }
    });

    return Object.fromEntries([...values].map(([name, set]) => [name, [...set].toSorted()]));
};

const OFFSET = /^(from|to|(-?[\d.]+)%)$/;

/** The declared steps of every `@keyframes` rule named in `names`. The last
 *  rule of a name wins, as in the cascade. */
export const keyframesOf = (css: string, names: Set<string>): Record<string, Keyframe[]> => {
    const found: Record<string, Keyframe[]> = {};

    postcss.parse(css).walkAtRules(/keyframes$/i, (atRule) => {
        const name = atRule.params.trim();

        if (!names.has(name)) {
            return;
        }

        const steps: Keyframe[] = [];

        atRule.walkRules((rule) => {
            const style: Record<string, string> = {};

            rule.walkDecls((decl) => {
                style[decl.prop] = decl.important ? `${decl.value} !important` : decl.value;
            });

            for (const selector of rule.selectors) {
                const match = OFFSET.exec(selector.trim());

                if (!match) {
                    throw new Error(`motion: keyframe "${selector}" of "${name}" is not an offset`);
                }

                const offset =
                    match[1] === 'from' ? 0 : match[1] === 'to' ? 1 : Number(match[2]) / 100;

                steps.push({ offset, style });
            }
        });

        found[name] = steps.toSorted((a, b) => a.offset - b.offset);
    });

    const missing = [...names].filter((name) => !found[name]);

    if (missing.length) {
        throw new Error(`motion: no @keyframes for ${missing.join(', ')}`);
    }

    return found;
};

// --- in the browser -----------------------------------------------------------

type PageInput = {
    wrapper: string;
    stateClasses: StateClasses;
    attributes: Record<string, string[]>;
};

type PageOutput = Pick<Motion, 'animations' | 'transitions'> & { refused: string[] };

// Runs in the page: no closure over this module.
const readPage = ({ wrapper, stateClasses, attributes }: PageInput): PageOutput => {
    const root = document.querySelector<HTMLElement>(`.${wrapper}`)!;
    const elements = [root, ...root.querySelectorAll<Element>('*')];
    const refused: string[] = [];

    const target = (element: Element): Target => {
        const steps: string[] = [];
        let node: Element = element;

        while (node !== root && !node.getAttribute('data-v')) {
            const parent = node.parentElement!;

            steps.unshift(`${node.localName}:nth-child(${[...parent.children].indexOf(node) + 1})`);
            node = parent;
        }

        const v = node.getAttribute('data-v');
        const path = steps.length ? `> ${steps.join(' > ')}` : undefined;

        if (v) {
            return path ? { v, sel: path } : { v };
        }

        return { sel: path ? `.${wrapper} ${path}` : `.${wrapper}` };
    };

    // A computed list split at its top-level commas.
    const list = (value: string): string[] => {
        const parts: string[] = [];
        let depth = 0;
        let part = '';

        for (const char of value) {
            depth += char === '(' ? 1 : char === ')' ? -1 : 0;

            if (char === ',' && depth === 0) {
                parts.push(part.trim());
                part = '';
            } else {
                part += char;
            }
        }

        return [...parts, part.trim()];
    };
    const seconds = (value: string) =>
        Math.round(parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)) / 1000;
    // The ith entry of a list the browser repeats to the names' length.
    const nth = (values: string[], index: number) => values[index % values.length]!;

    const animations: AnimationEntry[] = [];

    for (const element of elements) {
        for (const pseudo of [null, '::before', '::after'] as const) {
            const style = getComputedStyle(element, pseudo);

            if (pseudo && style.content === 'none') {
                continue;
            }

            const names = list(style.animationName);

            names.forEach((name, index) => {
                if (name === 'none') {
                    return;
                }

                const iterations = nth(list(style.animationIterationCount), index);

                animations.push({
                    ...target(element),
                    ...(pseudo ? { pseudo } : {}),
                    name,
                    duration: seconds(nth(list(style.animationDuration), index)),
                    timing: nth(list(style.animationTimingFunction), index),
                    delay: seconds(nth(list(style.animationDelay), index)),
                    iterations: iterations === 'infinite' ? 'infinite' : Number(iterations),
                    fill: nth(list(style.animationFillMode), index),
                    direction: nth(list(style.animationDirection), index),
                });
            });
        }
    }

    // The properties `element` transitions in its current state, with how.
    const transitioned = (element: Element): TransitionTiming[] => {
        const style = getComputedStyle(element);
        const properties = list(style.transitionProperty);
        const durations = list(style.transitionDuration);
        const timings = list(style.transitionTimingFunction);
        const delays = list(style.transitionDelay);

        return properties.flatMap((property, index) => {
            const duration = seconds(nth(durations, index));
            const delay = seconds(nth(delays, index));

            if (property === 'none' || property.startsWith('--') || duration + delay <= 0) {
                return [];
            }

            if (property === 'all') {
                refused.push(`"transition: all" on ${JSON.stringify(target(element))}`);

                return [];
            }

            return [{ property, duration, timing: nth(timings, index), delay }];
        });
    };

    type Toggle = { key: string; toggle: TransitionEntry['toggle']; on: Element; flip: () => void };

    const toggles: Toggle[] = [];
    // An attribute's values: those the stylesheet tests for and those the
    // fragment's elements carry, so an active tab can turn inactive too.
    const valuesOf = new Map(
        Object.entries(attributes).map(([name, values]) => [name, new Set(values)]),
    );

    for (const element of elements) {
        for (const [name, values] of valuesOf) {
            const value = element.getAttribute(name);

            if (value !== null) {
                values.add(value);
            }
        }
    }

    for (const element of elements) {
        const states = new Set([...element.classList].flatMap((name) => stateClasses[name] ?? []));

        for (const state of states) {
            toggles.push({
                key: `.${state}`,
                toggle: element.classList.contains(state) ? 'remove' : 'add',
                on: element,
                flip: () => element.classList.toggle(state),
            });
        }

        for (const name of element.getAttributeNames()) {
            const current = element.getAttribute(name)!;

            for (const value of valuesOf.get(name) ?? []) {
                if (value !== current) {
                    toggles.push({
                        key: `[${name}="${value}"]`,
                        toggle: 'set',
                        on: element,
                        flip: () =>
                            element.setAttribute(
                                name,
                                element.getAttribute(name) === value ? current : value,
                            ),
                    });
                }
            }
        }
    }

    // Values are compared at rest: with every animation and transition off,
    // so a running entrance or a transition a toggle starts cannot show
    // its start value. The timings are read with them back on.
    const still = document.createElement('style');

    still.textContent =
        '*, *::before, *::after { animation: none !important; transition: none !important; }';
    document.head.append(still);

    // Computed values from the typed OM: unlike getComputedStyle's resolved
    // values, a box's size or grid tracks do not change with its layout, so
    // a toggle that only hides an ancestor changes nothing here.
    const at = (element: Element, properties: TransitionTiming[]) => {
        const style = element.computedStyleMap();

        return properties.map(({ property }) => String(style.get(property)));
    };
    const transitions: Record<string, TransitionEntry[]> = {};

    for (const { key, toggle, on, flip } of toggles) {
        const subtree = [on, ...on.querySelectorAll('*')];

        flip();
        still.disabled = true;

        const timings = subtree.map(transitioned);

        still.disabled = false;

        const after = subtree.map((element, index) => at(element, timings[index]!));

        flip();

        subtree.forEach((element, index) => {
            const before = at(element, timings[index]!);
            const properties = timings[index]!.filter(
                (_, which) => before[which] !== after[index]![which],
            );

            if (properties.length) {
                (transitions[key] ??= []).push({
                    toggle,
                    on: target(on),
                    element: target(element),
                    properties,
                });
            }
        });
    }

    still.remove();

    return { animations, transitions, refused };
};

/** The motion of the fragment loaded in `page` under the stylesheet with
 *  its motion kept, `motionCss`. Throws on a transition it cannot read. */
export const readMotion = async (
    page: Page,
    { motionCss, stateClasses }: { motionCss: string; stateClasses: StateClasses },
): Promise<Motion> => {
    const { animations, transitions, refused } = await page.evaluate(readPage, {
        wrapper: WRAPPER,
        stateClasses,
        attributes: attributeValues(motionCss),
    });

    if (refused.length) {
        throw new Error(`motion: cannot read ${refused.join('; ')}`);
    }

    return {
        keyframes: keyframesOf(motionCss, new Set(animations.map(({ name }) => name))),
        animations,
        transitions,
    };
};
