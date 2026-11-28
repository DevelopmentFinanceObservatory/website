/**
 * Helpers for the schema.org `Dataset` blocks the site's pages carry: the
 * Library's charts (lib/library/chartData.ts) and the Sources pages
 * (lib/sources/dataset.ts).
 *
 * No `@/` imports, so `node --test` can load it.
 */

// Google reads a Dataset description of 50 to 5,000 characters.
export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 5_000;

/** A schema.org `license`: the licence's URL, or its name. */
export type Licence = string | { '@type': 'CreativeWork'; name: string };

/** `value` as a normalised URL when it parses as an http(s) URL. */
export const httpUrl = (value: string | null | undefined): string | undefined => {
    if (value && URL.canParse(value)) {
        const url = new URL(value);

        if (url.protocol === 'https:' || url.protocol === 'http:') {
            return url.href;
        }
    }
};

/** A stated licence as a URL or a named work. Words that say no licence is
 *  known give none. */
export const licenceOf = (value: string | null | undefined): Licence | undefined => {
    const name = value?.trim();

    if (name && !/not stated|^(unknown|no licence|none|n\/a)$/i.test(name)) {
        return httpUrl(name) ?? { '@type': 'CreativeWork', name };
    }
};

/** At most `max` characters, cut at a word break when one is near. */
export const clip = (text: string, max: number): string => {
    if (text.length <= max) {
        return text;
    }

    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');

    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** `data` as the text of a JSON-LD script element. Each `<` is escaped, so
 *  text in `data` cannot close the element or open a comment. */
export const jsonLdText = (data: object): string => JSON.stringify(data).replace(/</g, '\\u003c');
