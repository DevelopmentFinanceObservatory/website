/**
 * A reader for the markup `renderToStaticMarkup` writes, enough to find
 * elements and add attributes to them. React writes every attribute value
 * double-quoted with `<`, `>` and `"` escaped, and no comments or raw text
 * elements in this tree, so a tag is always `<name …>`, `<name …/>` or
 * `</name>`. Also the leak check every film fragment, rendered or
 * captured, must pass.
 */

export type Element = {
    name: string;
    classes: string[];
    attrs: Record<string, string>;
    // Where the opening tag starts and where its `>` (or `/>`) begins.
    start: number;
    insertAt: number;
    parent: Element | null;
    children: Element[];
};

const VOID = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
]);

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
const ATTR = /([^\s=]+)(?:="([^"]*)")?/g;

export const parseMarkup = (html: string): Element[] => {
    const roots: Element[] = [];
    const open: Element[] = [];

    for (const match of html.matchAll(TAG)) {
        const [whole, closing, name, attrText = '', selfClosing] = match;
        const tag = name!.toLowerCase();

        if (closing) {
            const top = open.pop();

            if (top?.name !== tag) {
                throw new Error(`markup: </${tag}> closes <${top?.name ?? 'nothing'}>`);
            }

            continue;
        }

        const attrs: Record<string, string> = {};

        for (const [, key, value] of attrText.matchAll(ATTR)) {
            attrs[key!] = value ?? '';
        }

        const parent = open.at(-1) ?? null;
        const element: Element = {
            name: tag,
            classes: (attrs.class ?? '').split(/\s+/).filter(Boolean),
            attrs,
            start: match.index,
            insertAt: match.index + whole.length - (selfClosing ? 2 : 1),
            parent,
            children: [],
        };

        (parent ? parent.children : roots).push(element);

        if (!selfClosing && !VOID.has(tag)) {
            open.push(element);
        }
    }

    if (open.length) {
        throw new Error(`markup: <${open.at(-1)!.name}> is never closed`);
    }

    return roots;
};

/** Every element under `roots`, depth first, in document order. */
export const walk = (roots: Element[]): Element[] =>
    roots.flatMap((element) => [element, ...walk(element.children)]);

export const hasClass = (element: Element, className: string): boolean =>
    element.classes.includes(className);

/** Writes `name="value"` into each element's opening tag. */
export const addAttributes = (
    html: string,
    additions: { element: Element; name: string; value: string }[],
): string => {
    const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    let out = html;

    for (const { element, name, value } of additions.toSorted(
        (a, b) => b.element.insertAt - a.element.insertAt,
    )) {
        out = `${out.slice(0, element.insertAt)} ${name}="${escape(value)}"${out.slice(element.insertAt)}`;
    }

    return out;
};

/** Markup a film cannot hold: what the sanitiser exists to remove. One line
 *  per kind found; empty when the fragment is clean. */
export const htmlLeaks = (html: string): string[] => {
    const leaks = new Set<string>();

    for (const [, tag] of html.matchAll(
        /<(script|noscript|iframe|canvas|object|embed|link|style)[\s>]/gi,
    )) {
        leaks.add(`<${tag!.toLowerCase()}>`);
    }

    for (const [, name] of html.matchAll(/\s(on[a-z]+)=/gi)) {
        leaks.add(`${name} attribute`);
    }

    for (const [, name, value] of html.matchAll(
        /\s((?:xlink:)?href|src|srcset|poster|action|formaction)="([^"]*)"/gi,
    )) {
        if (!value!.startsWith('data:') && !value!.startsWith('#')) {
            leaks.add(`${name}="${value}"`);
        }
    }

    for (const [, url] of html.matchAll(/url\(\s*(?:&quot;|['"])?([^'")&]*)/gi)) {
        if (!url!.startsWith('data:') && !url!.startsWith('#')) {
            leaks.add(`url(${url})`);
        }
    }

    return [...leaks];
};
