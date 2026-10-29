import postcss, { type AtRule, type Node, type Root, type Rule } from 'postcss';

import { ROOT_FONT_SIZE, type Viewport, WRAPPER } from './spec.ts';

/**
 * The app's compiled CSS made safe for a film: frozen at its final frame,
 * fixed to one viewport and scoped under one wrapper class.
 *
 * - Motion is removed: `@keyframes`, every `animation*` and `transition*`
 *   declaration, and `@font-face` (the film names its faces). With
 *   `keepMotion` the motion stays, so a browser can read it (motion.ts).
 * - Media queries are decided for the viewport: a true one gives up its
 *   rules, a false one is dropped. A media type, feature or condition this
 *   cannot decide is an error.
 * - `rem` becomes px at the 16 px root and viewport units become px at the
 *   viewport, so neither depends on the film's own page.
 * - Every selector is put under `.dfo-ui`; `:root`, `html` and `body` become
 *   the wrapper itself.
 * - The two font variables read the film's `--sans` and `--mono` first.
 */

const ROOT_PX = ROOT_FONT_SIZE;

const FONT_VARIABLES: Record<string, string> = {
    '--font-outfit': 'var(--sans, "Outfit", system-ui, sans-serif)',
    '--font-dm-mono': 'var(--mono, "DM Mono", ui-monospace, monospace)',
};

const MOTION = /^(-webkit-|-moz-)?(animation|transition)(-|$)/;

// --- media queries ------------------------------------------------------------

const length = (value: string): number => {
    const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim());

    if (!match) {
        throw new Error(`css: cannot read the media length "${value}"`);
    }

    return Number(match[1]) * (match[2] === 'rem' || match[2] === 'em' ? ROOT_PX : 1);
};

// One `(feature: value)` test at the viewport, on a screen with a fine
// pointer that hovers, at 1x, with no motion preference stated.
const feature = (test: string, { width, height }: Viewport): boolean => {
    const [rawName, rawValue = ''] = test.split(':').map((part) => part.trim());
    const name = rawName!.replace(/^-webkit-/, '');
    const value = rawValue.toLowerCase();

    switch (name) {
        case 'min-width':
        case 'min-device-width':
            return width >= length(value);
        case 'max-width':
        case 'max-device-width':
            return width <= length(value);
        case 'min-height':
        case 'min-device-height':
            return height >= length(value);
        case 'max-height':
        case 'max-device-height':
            return height <= length(value);
        case 'orientation':
            return value === (width >= height ? 'landscape' : 'portrait');
        case 'hover':
        case 'any-hover':
            return value === 'hover';
        case 'pointer':
        case 'any-pointer':
            return value === 'fine';
        case 'min-device-pixel-ratio':
            return Number(value) <= 1;
        case 'min-resolution':
            return length(value.replace('dpi', '')) <= 96;
        case 'prefers-reduced-motion':
        case 'prefers-contrast':
        case 'forced-colors':
            return value === 'no-preference' || value === 'none';
        case 'prefers-color-scheme':
            return value === 'light';
        default:
            throw new Error(`css: no rule decides the media feature "${test}"`);
    }
};

// `(a) and (b) …`, `(a) or (b) …` or `not (a)`; after a media type only
// `and` may join. Nested conditions are refused.
const condition = (text: string, viewport: Viewport, { or }: { or: boolean }): boolean => {
    const negated = /^not\s+(.*)$/i.exec(text);
    const parts = (negated?.[1] ?? text).split(/\s+(and|or)\s+/i);
    const joins = new Set(parts.filter((_, index) => index % 2).map((join) => join.toLowerCase()));
    const tests = parts
        .filter((_, index) => index % 2 === 0)
        .map((part) => /^\(([^()]+)\)$/.exec(part.trim())?.[1]);

    if (
        tests.includes(undefined) ||
        joins.size > 1 ||
        (negated && parts.length > 1) ||
        (!or && joins.has('or'))
    ) {
        throw new Error(`css: cannot decide the media condition "${text}"`);
    }

    // Every feature is read, so one this cannot decide is an error whatever
    // the others give.
    const results = tests.map((test) => feature(test!, viewport));
    const matched = joins.has('or') ? results.some(Boolean) : results.every(Boolean);

    return negated ? !matched : matched;
};

// The film plays on a screen: `screen` and `all` match, `print` does not,
// and any other type is an error.
const mediaType = (type: string): boolean => {
    switch (type.toLowerCase()) {
        case 'all':
        case 'screen':
            return true;
        case 'print':
            return false;
        default:
            throw new Error(`css: no rule decides the media type "${type}"`);
    }
};

const TYPED_QUERY = /^(?:(only|not)\s+)?([a-z-]+)(?:\s+and\s+(.+))?$/i;

export const mediaMatches = (params: string, viewport: Viewport): boolean =>
    params.split(',').some((raw) => {
        const query = raw.trim();

        if (/^(not\s+)?\(/i.test(query)) {
            return condition(query, viewport, { or: true });
        }

        const [, modifier, type, rest] = TYPED_QUERY.exec(query) ?? [];

        if (!type) {
            throw new Error(`css: cannot read the media query "${query}"`);
        }

        const typeMatches = mediaType(type);
        const conditionMatches = rest === undefined || condition(rest, viewport, { or: false });
        const matched = typeMatches && conditionMatches;

        return modifier?.toLowerCase() === 'not' ? !matched : matched;
    });

// --- units and selectors ------------------------------------------------------

export const toPx = (value: string, viewport: Viewport, rootPx: number): string =>
    value.replace(
        /(-?\d*\.?\d+)(rem|vw|vh|dvh|svh|lvh|dvw|svw|lvw|vmin|vmax)\b/g,
        (_whole, number: string, unit: string) => {
            const n = Number(number);
            const per = {
                rem: rootPx,
                vmin: Math.min(viewport.width, viewport.height) / 100,
                vmax: Math.max(viewport.width, viewport.height) / 100,
            }[unit];
            const axis = unit.endsWith('w') ? viewport.width / 100 : viewport.height / 100;
            const px = n * (per ?? axis);

            return `${Math.round(px * 1000) / 1000}px`;
        },
    );

const ROOT_SELECTOR = /^(?::root|html|body)(?![\w-])/;

export const scopeSelector = (selector: string): string => {
    const trimmed = selector.trim();

    if (ROOT_SELECTOR.test(trimmed)) {
        // `html body`, `:root body`: the wrapper stands for both.
        const rest = trimmed.replace(ROOT_SELECTOR, '').replace(/^\s+(?:body)(?![\w-])/, '');

        return `.${WRAPPER}${rest}`;
    }

    return `.${WRAPPER} ${trimmed}`;
};

const insideKeyframes = (rule: Rule): boolean => {
    for (let parent: Node | undefined = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) {
            return true;
        }
    }

    return false;
};

/** The stylesheet without the font size `html` rules set on the root. */
export const dropRootFontSize = (css: string): string => {
    const root = postcss.parse(css);

    root.walkRules((rule) => {
        if (rule.selector.trim() === 'html') {
            rule.walkDecls('font-size', (decl) => {
                decl.remove();
            });
        }
    });

    return root.toResult().css;
};

/** The stylesheet frozen, decided for `viewport` and scoped. `rem` is
 *  converted at `rootFontSize`, the page's root size (16 px when absent);
 *  media queries keep the browser's 16 px `em`. `keepMotion` leaves the
 *  keyframes, animations and transitions in place. */
export const filmCss = (
    css: string,
    viewport: Viewport,
    {
        rootFontSize = ROOT_PX,
        keepMotion = false,
    }: { rootFontSize?: number; keepMotion?: boolean } = {},
): string => {
    const root: Root = postcss.parse(css);

    // Collected first, so a rule moved out of a matching query is still
    // decided where it lands.
    const atRules: AtRule[] = [];

    root.walkAtRules((atRule) => {
        atRules.push(atRule);
    });

    for (const atRule of atRules) {
        const name = atRule.name.toLowerCase();

        if ((!keepMotion && /keyframes$/.test(name)) || name === 'font-face') {
            atRule.remove();
        } else if (name === 'media') {
            if (mediaMatches(atRule.params, viewport)) {
                atRule.replaceWith(atRule.nodes ?? []);
            } else {
                atRule.remove();
            }
        }
    }

    root.walkDecls((decl) => {
        if (!keepMotion && MOTION.test(decl.prop)) {
            decl.remove();

            return;
        }

        decl.value = FONT_VARIABLES[decl.prop] ?? toPx(decl.value, viewport, rootFontSize);
    });

    root.walkRules((rule) => {
        if (!insideKeyframes(rule)) {
            rule.selectors = rule.selectors.map(scopeSelector);
        }
    });

    // Rules left empty by the removals.
    root.walkRules((rule) => {
        if (!rule.nodes.length) {
            rule.remove();
        }
    });

    root.append(
        postcss.rule({
            selector: `.${WRAPPER}`,
            nodes: [
                postcss.decl({ prop: 'position', value: 'relative' }),
                postcss.decl({ prop: 'width', value: `${viewport.width}px` }),
                postcss.decl({ prop: 'height', value: `${viewport.height}px` }),
                postcss.decl({ prop: 'overflow', value: 'hidden' }),
                // The containing block of the app's fixed bars and panels.
                postcss.decl({ prop: 'contain', value: 'strict' }),
                postcss.decl({ prop: 'font-size', value: `${ROOT_PX}px` }),
            ],
        }),
    );

    return root.toResult().css;
};

/** URLs in the stylesheet that would leave the film: anything not `data:`,
 *  in a `url()` or a quoted `@import`. */
export const externalUrls = (css: string): string[] =>
    [
        ...css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g),
        ...css.matchAll(/@import\s+(['"])([^'"]*)\1/gi),
    ]
        .map((match) => match[2]!)
        .filter((url) => !url.startsWith('data:') && !url.startsWith('#'));

/**
 * The stylesheet in pieces of at most `limit`, cut between top-level rules
 * so each piece parses alone. One piece when it fits. `size` measures a
 * piece, its UTF-8 bytes when absent; it must add up over concatenation,
 * as a JSON-escaped length does.
 */
export const splitCss = (
    css: string,
    limit: number,
    size: (text: string) => number = Buffer.byteLength,
): string[] => {
    const pieces: string[] = [];
    let piece = '';
    let pieceSize = 0;

    for (const node of postcss.parse(css).nodes) {
        const text = `${node.toString()}\n`;
        const textSize = size(text);

        if (textSize > limit) {
            throw new Error(`css: one rule is larger than ${limit} bytes`);
        }

        if (pieceSize + textSize > limit) {
            pieces.push(piece);
            piece = '';
            pieceSize = 0;
        }

        piece += text;
        pieceSize += textSize;
    }

    return piece ? [...pieces, piece] : pieces;
};
