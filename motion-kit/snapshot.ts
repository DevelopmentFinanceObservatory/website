/**
 * The functions a page capture runs inside the browser, through Playwright's
 * `page.evaluate`. Playwright sends each one as source text, so each is
 * self-contained: no imports, no helpers from this module, only its
 * argument and the page's globals.
 */

import type { PageHook } from './spec.ts';

/** A box in viewport px. */
export type Box = { x: number; y: number; width: number; height: number };

/** A stylesheet's text and the URL its relative `url()`s resolve against.
 *  `media` is the owner's `media` attribute, when it has one. */
export type SheetSource = { key: string; base: string; text: string; media: string };

export type Snapshot = {
    // The state as one `<div class="dfo-ui">` fragment.
    html: string;
    // The computed font size of the page's root element, in px.
    rootFontSize: number;
    // What the sanitiser removed and could not inline, one line each.
    dropped: string[];
    sheets: SheetSource[];
};

/**
 * Stamps each hook's `data-v` on the one element its selector finds, after
 * clearing the stamps of an earlier state, and returns each hook's box, or
 * null when the selector finds nothing in this state. Throws when a
 * selector finds more than one element.
 */
export function stampHooks(hooks: PageHook[]): Record<string, Box | null> {
    for (const element of document.querySelectorAll('[data-v]')) {
        element.removeAttribute('data-v');
    }

    const boxes: Record<string, Box | null> = {};
    const round = (n: number) => Math.round(n * 100) / 100;

    for (const { v, selector } of hooks) {
        const found = document.querySelectorAll(selector);

        if (found.length > 1) {
            throw new Error(`hook "${v}": "${selector}" matches ${found.length} elements`);
        }

        const element = found[0];

        if (!element) {
            boxes[v] = null;
            continue;
        }

        element.setAttribute('data-v', v);

        const rect = element.getBoundingClientRect();

        boxes[v] = {
            x: round(rect.x),
            y: round(rect.y),
            width: round(rect.width),
            height: round(rect.height),
        };
    }

    return boxes;
}

/** For each selector, whether it finds an element in the page now. A
 *  selector the browser cannot parse finds nothing. */
export function matchSelectors(selectors: string[]): boolean[] {
    return selectors.map((selector) => {
        try {
            return document.querySelector(selector) !== null;
        } catch {
            return false;
        }
    });
}

/**
 * The page as it stands, made static for a film:
 *
 * - `document.body` is copied into an inert document (no scripts run, no
 *   custom element upgrades, no loads) inside `<div class="dfo-ui">`, with
 *   `<div data-mk-html>` and `<div data-mk-body>` standing for the root and
 *   the body and carrying their attributes;
 * - scripts, styles, links, frames, media, templates, comments, event
 *   attributes and elements with a shadow root are removed;
 * - a canvas becomes an `<img>` of its pixels, and images, `<image>`s and
 *   inline `url()`s become `data:` URLs; what cannot be fetched is dropped
 *   and reported, as is any other URL that leaves the page;
 * - form controls carry their current value, checked and selected states
 *   as attributes;
 * - hovered, focused and active elements carry `data-mk-hover`,
 *   `data-mk-focus`, `data-mk-focus-visible`, `data-mk-focus-within` and
 *   `data-mk-active`, which the stylesheet's dynamic pseudo-classes become;
 * - a scrolled element's children (the body's, for the window) are
 *   translated by the scroll offset, past any element that holds a fixed
 *   one, so fixed elements stay where they show, and a stuck element is
 *   moved back to where it shows.
 *
 * Also returns the text of every stylesheet in the page.
 */
export async function snapshotPage({
    viewport,
    state,
}: {
    viewport: { width: number; height: number };
    state: string;
}): Promise<Snapshot> {
    const dropped: string[] = [];
    const drop = (what: string) => {
        if (!dropped.includes(what)) {
            dropped.push(what);
        }
    };
    const inside = (url: string) => url.startsWith('data:') || url.startsWith('#');
    const absolute = (url: string) => new URL(url, document.baseURI).href;
    const cache = new Map<string, Promise<string | null>>();
    const dataUrl = (url: string): Promise<string | null> => {
        const href = absolute(url);

        if (!cache.has(href)) {
            cache.set(
                href,
                (async () => {
                    try {
                        const response = await fetch(href);

                        if (!response.ok) {
                            return null;
                        }

                        const blob = await response.blob();

                        return await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();

                            reader.onload = () => resolve(String(reader.result));
                            reader.onerror = () => reject(reader.error);
                            reader.readAsDataURL(blob);
                        });
                    } catch {
                        return null;
                    }
                })(),
            );
        }

        return cache.get(href)!;
    };
    const inlineCssUrls = async (text: string, what: string): Promise<string> => {
        let out = text;

        for (const match of text.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
            const url = match[2]!;

            if (inside(url)) {
                continue;
            }

            const data = await dataUrl(url);

            if (!data) {
                drop(`${what}: url(${url})`);
            }

            out = out.replace(match[0], data ? `url("${data}")` : 'none');
        }

        return out;
    };

    // --- measurements on the live page, before anything changes -------------

    const scroller = document.scrollingElement ?? document.documentElement;
    const live = [document.body, ...document.body.querySelectorAll('*')];
    const computed = live.map((element) => getComputedStyle(element));
    const sticky = live.filter((_, index) => computed[index]!.position === 'sticky');
    const stuckAt = sticky.map((element) => element.getBoundingClientRect());

    // Where each sticky element would sit unstuck: static takes the same
    // room in the flow, so switching them all at once moves nothing else.
    const inlinePosition = sticky.map((element) => (element as HTMLElement).style.position);

    for (const element of sticky) {
        (element as HTMLElement).style.position = 'static';
    }

    const unstuckAt = sticky.map((element) => element.getBoundingClientRect());

    sticky.forEach((element, index) => {
        (element as HTMLElement).style.position = inlinePosition[index]!;
    });

    // --- the copy -------------------------------------------------------------

    const inert = document.implementation.createHTMLDocument('');
    const copies = (() => {
        const body = inert.importNode(document.body, true);

        return [body, ...body.querySelectorAll('*')];
    })();
    const shift = new Map<Element, { x: number; y: number }>();
    const addShift = (element: Element, x: number, y: number) => {
        const current = shift.get(element) ?? { x: 0, y: 0 };

        shift.set(element, { x: current.x + x, y: current.y + y });
    };
    const scrollOf = (element: Element) =>
        element === document.body
            ? { x: scroller.scrollLeft, y: scroller.scrollTop }
            : { x: element.scrollLeft, y: element.scrollTop };
    // A translated ancestor would become a fixed element's containing block
    // and carry it away from where it shows, so the scroll moves an element
    // that holds a fixed one by moving its other children instead.
    const fixed = live.filter((_, index) => computed[index]!.position === 'fixed');
    const scrollWith = (element: Element, x: number, y: number) => {
        const index = live.indexOf(element);

        if (computed[index]!.position === 'fixed') {
            return;
        }

        if (!fixed.some((other) => element.contains(other))) {
            addShift(element, x, y);

            return;
        }

        if (
            [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim())
        ) {
            drop(
                `${copies[index]!.localName}: text beside a scrolled element's moved children stays unscrolled`,
            );
        }

        for (const child of element.children) {
            scrollWith(child, x, y);
        }
    };

    live.forEach((element, index) => {
        const { x, y } = scrollOf(element);

        if (!x && !y) {
            return;
        }

        if (
            [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim())
        ) {
            drop(
                `${copies[index]!.localName}: text beside the children of a scrolled element stays unscrolled`,
            );
        }

        for (const child of element.children) {
            scrollWith(child, -x, -y);
        }
    });

    sticky.forEach((element, index) => {
        const dx = stuckAt[index]!.x - unstuckAt[index]!.x;
        const dy = stuckAt[index]!.y - unstuckAt[index]!.y;

        if (dx || dy) {
            addShift(element, dx, dy);
        }
    });

    const remove = new Set<Element>();
    const pending: Promise<void>[] = [];
    const MEDIA = new Set(['video', 'audio', 'object', 'embed', 'iframe', 'frame', 'portal']);
    const GONE = new Set(['script', 'noscript', 'template', 'style', 'link', 'meta', 'base']);
    const URL_ATTRIBUTES = [
        'src',
        'srcset',
        'action',
        'formaction',
        'poster',
        'ping',
        'background',
    ];

    live.forEach((element, index) => {
        const copy = copies[index]!;
        const name = element.localName;
        const style = computed[index]!;

        if (GONE.has(name) || element.shadowRoot) {
            if (element.shadowRoot) {
                drop(`<${name}> with a shadow root`);
            }

            remove.add(copy);

            return;
        }

        if (MEDIA.has(name)) {
            // A box of the same size keeps the layout.
            const box = inert.createElement('div');
            const rect = element.getBoundingClientRect();

            for (const key of ['class', 'data-v']) {
                const value = element.getAttribute(key);

                if (value !== null) {
                    box.setAttribute(key, value);
                }
            }

            box.setAttribute(
                'style',
                `display:${style.display === 'inline' ? 'inline-block' : style.display};width:${rect.width}px;height:${rect.height}px`,
            );
            copy.replaceWith(box);
            drop(
                `<${name}${element.getAttribute('src') ? ` src="${element.getAttribute('src')}"` : ''}> (left as an empty box)`,
            );

            return;
        }

        // Attributes: event handlers go; URLs that leave the page go.
        for (const attribute of [...copy.attributes]) {
            const key = attribute.name.toLowerCase();
            const value = attribute.value;

            if (key.startsWith('on')) {
                copy.removeAttribute(attribute.name);
            } else if ((key === 'href' || key === 'xlink:href') && !inside(value)) {
                if (name === 'a' || name === 'area') {
                    // `#` keeps the link a link for `:link` and `[href]`.
                    copy.setAttribute(attribute.name, '#');
                } else {
                    drop(`<${name}> ${key}="${value}"`);
                    copy.removeAttribute(attribute.name);
                }
            } else if (URL_ATTRIBUTES.includes(key) && !(name === 'img' && key === 'src')) {
                if (!inside(value)) {
                    copy.removeAttribute(attribute.name);
                }
            } else if (key === 'style' && /url\(/.test(value)) {
                pending.push(
                    inlineCssUrls(value, `<${name}> style`).then((text) => {
                        // The scroll shift below may have set a translate
                        // already; it outlives the rewrite.
                        const { translate } = (copy as HTMLElement).style;

                        copy.setAttribute('style', text);

                        if (translate) {
                            (copy as HTMLElement).style.translate = translate;
                        }
                    }),
                );
            }
        }

        copy.removeAttribute('autofocus');

        if (name === 'img') {
            const image = element as HTMLImageElement;
            const source = image.currentSrc || image.src;

            copy.removeAttribute('srcset');
            copy.removeAttribute('sizes');

            if (source && !source.startsWith('data:')) {
                pending.push(
                    dataUrl(source).then((data) => {
                        if (data) {
                            copy.setAttribute('src', data);
                        } else {
                            copy.removeAttribute('src');
                            drop(`<img src="${source}">`);
                        }
                    }),
                );
            }
        } else if (name === 'source') {
            remove.add(copy);
        } else if (name === 'image' && element.namespaceURI === 'http://www.w3.org/2000/svg') {
            const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');

            if (href && !inside(href)) {
                pending.push(
                    dataUrl(href).then((data) => {
                        if (data) {
                            copy.setAttribute('href', data);
                        } else {
                            drop(`<image href="${href}">`);
                        }
                    }),
                );
            }
        } else if (name === 'canvas') {
            const canvas = element as HTMLCanvasElement;
            const image = inert.createElement('img');

            for (const attribute of copy.attributes) {
                image.setAttribute(attribute.name, attribute.value);
            }

            try {
                image.setAttribute('src', canvas.toDataURL('image/png'));
            } catch {
                drop('<canvas> whose pixels cannot be read (left blank)');
            }

            image.setAttribute('width', String(canvas.width));
            image.setAttribute('height', String(canvas.height));

            // The canvas's laid-out size, so the pixel buffer (device px)
            // does not set it.
            const rect = element.getBoundingClientRect();

            image.style.width = `${rect.width}px`;
            image.style.height = `${rect.height}px`;
            copy.replaceWith(image);
            copies[index] = image;
        } else if (name === 'input') {
            const input = element as HTMLInputElement;

            if (input.type === 'checkbox' || input.type === 'radio') {
                copy.toggleAttribute('checked', input.checked);
            } else if (input.type !== 'file') {
                copy.setAttribute('value', input.value);
            }
        } else if (name === 'textarea') {
            copy.textContent = (element as HTMLTextAreaElement).value;
        } else if (name === 'option') {
            copy.toggleAttribute('selected', (element as HTMLOptionElement).selected);
        }

        // The interaction states the film cannot have, as attributes.
        for (const [pseudo, mark] of [
            [':hover', 'data-mk-hover'],
            [':active', 'data-mk-active'],
            [':focus', 'data-mk-focus'],
            [':focus-visible', 'data-mk-focus-visible'],
            [':focus-within', 'data-mk-focus-within'],
        ] as const) {
            if (element.matches(pseudo)) {
                copies[index]!.setAttribute(mark, '');
            }
        }

        const moved = shift.get(element);

        if (moved) {
            // The individual `translate` property composes with any
            // `transform` the element has; an existing one is added to.
            const [tx = '0px', ty = '0px', tz] =
                style.translate === 'none' ? [] : style.translate.split(' ');
            const add = (length: string, px: number) =>
                length.endsWith('px') && !length.includes('(')
                    ? `${parseFloat(length) + px}px`
                    : `calc(${length} + ${px}px)`;

            (copies[index] as HTMLElement).style.translate = [
                add(tx, moved.x),
                add(ty, moved.y),
                ...(tz ? [tz] : []),
            ].join(' ');
        }
    });

    await Promise.all(pending);

    for (const copy of remove) {
        copy.remove();
    }

    const comments = inert.createTreeWalker(copies[0]!, NodeFilter.SHOW_COMMENT);
    const commentNodes: Node[] = [];

    while (comments.nextNode()) {
        commentNodes.push(comments.currentNode);
    }

    for (const comment of commentNodes) {
        comment.parentNode?.removeChild(comment);
    }

    // --- the fragment ---------------------------------------------------------

    const stand = (tag: 'html' | 'body', source: Element): HTMLElement => {
        const element = inert.createElement('div');

        for (const attribute of source.attributes) {
            if (!attribute.name.toLowerCase().startsWith('on')) {
                element.setAttribute(attribute.name, attribute.value);
            }
        }

        element.setAttribute(`data-mk-${tag}`, '');

        return element;
    };
    const wrapper = inert.createElement('div');
    const html = stand('html', document.documentElement);
    const body = stand('body', copies[0]!);

    body.append(...copies[0]!.childNodes);
    html.append(body);
    wrapper.append(html);
    wrapper.setAttribute('class', 'dfo-ui');
    wrapper.setAttribute('data-viewport', `${viewport.width}x${viewport.height}`);
    wrapper.setAttribute('data-state', state);

    // The root's background (or the body's, when the root has none) paints
    // the whole viewport in a browser; the wrapper stands for the viewport.
    const rootStyle = getComputedStyle(document.documentElement);
    const canvasStyle =
        rootStyle.backgroundColor === 'rgba(0, 0, 0, 0)' && rootStyle.backgroundImage === 'none'
            ? computed[0]!
            : rootStyle;

    if (canvasStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        wrapper.style.backgroundColor = canvasStyle.backgroundColor;
    }

    // --- the stylesheets ------------------------------------------------------

    const sheets: SheetSource[] = [];

    for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
        if (sheet.disabled) {
            continue;
        }

        const media = sheet.media.mediaText;

        if (sheet.href) {
            const response = await fetch(sheet.href).catch(() => null);

            if (!response) {
                drop(`stylesheet ${sheet.href}`);
                continue;
            }

            // A sheet the server no longer has (a rebuild since the page
            // loaded) would leave its rules out of the film unnoticed.
            if (!response.ok) {
                throw new Error(
                    `motion-kit: stylesheet ${sheet.href} answered ${response.status} when re-read`,
                );
            }

            sheets.push({ key: sheet.href, base: sheet.href, text: await response.text(), media });
        } else {
            const text =
                sheet.ownerNode?.textContent ??
                [...sheet.cssRules].map((rule) => rule.cssText).join('\n');

            sheets.push({ key: `inline:${text}`, base: document.baseURI, text, media });
        }
    }

    return {
        html: wrapper.outerHTML,
        rootFontSize: parseFloat(rootStyle.fontSize),
        dropped,
        sheets,
    };
}
