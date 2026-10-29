import postcss, {
    type AtRule,
    type ChildNode,
    type Container,
    type Node,
    type Root,
    type Rule,
} from 'postcss';

import type { SheetSource } from './snapshot.ts';

/**
 * A captured page's stylesheets cut down to the rules its states use, with
 * their URLs inlined and their root and interaction selectors pointed at
 * what the fragment holds instead. `filmCss` does the rest.
 */

// Pseudo-elements never match an element; a rule that styles one is used
// when its element is.
const PSEUDO_ELEMENT =
    /::?(?:before|after|first-line|first-letter)(?![\w-])|::[\w-]+(?:\([^()]*\))?/g;

// The states a static page cannot be in, as `snapshotPage` marks them.
const INTERACTION = /:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g;

const HAS_INTERACTION = new RegExp(INTERACTION.source);

const NOT = /:not\(([^()]*)\)/g;

/**
 * The selector the browser tests to decide whether a rule is used: the
 * selector without pseudo-elements, with interaction states counted as
 * met, since any state of an element a film shows may be animated to.
 */
export const usageSelector = (selector: string): string => {
    const met = selector
        .replace(NOT, (whole, inner: string) => (HAS_INTERACTION.test(inner) ? ':where(*)' : whole))
        .replace(INTERACTION, ':where(*)')
        .replace(PSEUDO_ELEMENT, '')
        .trim();

    // `::selection` alone styles every element.
    return met === '' || /[>+~]$/.test(met) ? `${met}*` : met;
};

/**
 * The selector as it applies to the fragment: `html` and `:root` become
 * `[data-mk-html]`, `body` becomes `[data-mk-body]`, and each interaction
 * state the mark `snapshotPage` sets.
 */
export const fragmentSelector = (selector: string): string =>
    selector
        .replace(/(?<![\w.#:[-]):root(?![\w-])/g, '[data-mk-html]')
        .replace(/(?<![\w.#:[="'-])html(?![\w-])/g, '[data-mk-html]')
        .replace(/(?<![\w.#:[="'-])body(?![\w-])/g, '[data-mk-body]')
        .replace(INTERACTION, (_whole, state: string) => `[data-mk-${state}]`);

const insideKeyframes = (node: ChildNode): boolean => {
    for (let parent: Node | undefined = node.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) {
            return true;
        }
    }

    return false;
};

const styleRules = (root: Root): Rule[] => {
    const rules: Rule[] = [];

    root.walkRules((rule) => {
        if (!insideKeyframes(rule)) {
            rules.push(rule);
        }
    });

    return rules;
};

export type ParsedSheet = { source: SheetSource; root: Root };

/** The sheet parsed, inside `@media` when its owner names a media list. */
export const parseSheet = (source: SheetSource): ParsedSheet => {
    const root = postcss.parse(source.text, { from: undefined });

    if (source.media && source.media !== 'all') {
        const media = postcss.atRule({ name: 'media', params: source.media });

        media.append(root.nodes);
        root.append(media);
    }

    return { source, root };
};

/** Every usage selector the sheets' style rules test. */
export const usageSelectors = (sheets: ParsedSheet[]): string[] => [
    ...new Set(
        sheets.flatMap(({ root }) =>
            styleRules(root).flatMap((rule) => rule.selectors.map(usageSelector)),
        ),
    ),
];

const removeEmpty = (container: Container) => {
    for (const node of [...(container.nodes ?? [])]) {
        if (node.type === 'atrule' || node.type === 'rule') {
            if (node.nodes) {
                removeEmpty(node);

                // A block at-rule with nothing left in it does nothing.
                if (!node.nodes.length) {
                    node.remove();
                }
            }
        }
    }
};

/**
 * The sheets' rules that `used` says a state uses, as one stylesheet with
 * fragment selectors. `@font-face` and `@import` go (the film names its own
 * faces and fetches nothing), and an `@import` is reported in `dropped`.
 * Every other `url()` is passed to `inline`, which returns a `data:` URL or
 * null to drop the declaration (also reported).
 */
export const pageCss = async ({
    sheets,
    used,
    inline,
    dropped,
}: {
    sheets: ParsedSheet[];
    used: Set<string>;
    inline: (url: string) => Promise<string | null>;
    dropped: string[];
}): Promise<string> => {
    const texts: string[] = [];

    for (const { source, root: parsed } of sheets) {
        const root = parsed.clone();

        root.walkAtRules((atRule) => {
            const name = atRule.name.toLowerCase();

            if (name === 'font-face') {
                atRule.remove();
            } else if (name === 'import') {
                dropped.push(`@import ${atRule.params} in ${source.base}`);
                atRule.remove();
            }
        });

        for (const rule of styleRules(root)) {
            const kept = rule.selectors.filter((selector) => used.has(usageSelector(selector)));

            if (kept.length) {
                rule.selectors = kept.map(fragmentSelector);
            } else {
                rule.remove();
            }
        }

        removeEmpty(root);

        const declarations: { value: string; set: (value: string | null) => void }[] = [];

        root.walkDecls((decl) => {
            if (/url\(/i.test(decl.value)) {
                declarations.push({
                    value: decl.value,
                    set: (value) => (value === null ? decl.remove() : (decl.value = value)),
                });
            }
        });

        for (const { value, set } of declarations) {
            let out: string | null = value;

            for (const match of value.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
                const url = match[2]!;

                if (url.startsWith('data:') || url.startsWith('#')) {
                    continue;
                }

                const href = new URL(url, source.base).href;
                const data = await inline(href);

                if (!data) {
                    dropped.push(`url(${href})`);
                    out = null;
                    break;
                }

                out = out.replace(match[0], `url("${data}")`);
            }

            set(out);
        }

        removeEmpty(root);
        texts.push(root.toResult().css);
    }

    return texts.join('\n');
};
