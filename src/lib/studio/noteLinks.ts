/**
 * Links in a card's note. A note is plain text that keeps its line breaks,
 * and a link is written into it as Markdown, `[words](https://…)`, so a
 * saved note stays a string everywhere it is stored and shared. Only http
 * and https targets are links. Any other bracketed text stays text. A
 * link's words hold no brackets and no line break, and its target's
 * parentheses are percent-encoded, so neither can end the link early. The
 * words and the target are bounded in length, which keeps the read of a
 * long run of unclosed links linear.
 */

export type NotePart = { text: string; href?: string };

// The longest target `linkTarget` lets a new link have, counted with its
// parentheses encoded and its scheme included.
const MAX_TARGET = 2048;

// Reading allows up to MAX_TARGET characters after the scheme, a few more
// than `linkTarget` allows, so a link saved under that wider bound still
// reads as a link.
const LINK = new RegExp(
    `\\[([^[\\]\\n]{1,500})\\]\\((https?:\\/\\/[^\\s)]{1,${MAX_TARGET}})\\)`,
    'g',
);

/** The note as runs of text, each with its link target when it has one. */
export const noteParts = (note: string): NotePart[] => {
    const parts: NotePart[] = [];
    let at = 0;

    for (const match of note.matchAll(LINK)) {
        if (match.index > at) {
            parts.push({ text: note.slice(at, match.index) });
        }

        parts.push({ text: match[1]!, href: match[2]! });
        at = match.index + match[0].length;
    }

    if (at < note.length) {
        parts.push({ text: note.slice(at) });
    }

    return parts;
};

// Parentheses in a target, percent-encoded, which a browser reads as the
// same address.
const encodeParens = (href: string): string => href.replace(/\(/g, '%28').replace(/\)/g, '%29');

/** The note written back from its runs. */
export const noteText = (parts: NotePart[]): string =>
    parts
        .map((part) => (part.href ? `[${part.text}](${encodeParens(part.href)})` : part.text))
        .join('');

/** Whether words can be one link: some text, with no bracket or line break. */
export const linkable = (words: string): boolean =>
    words.trim() !== '' && words.length <= 500 && !/[[\]\n\r]/.test(words);

/** A typed link target as an http(s) URL, or null when it is not one. A
 *  target typed without a scheme takes https, and then needs a host whose
 *  last label starts with a letter, so a lone word or a number such as `1.2`
 *  is not read as a site. An address with a user or password part, which an
 *  email typed here would become, is refused, and so is one whose encoded
 *  form is past the length a note keeps. */
export const linkTarget = (typed: string): string | null => {
    const trimmed = typed.trim();
    // A colon followed by digits is a port (`imf.org:443`), not a scheme.
    const schemed = /^[a-z][a-z\d+.-]*:(?!\d)/i.test(trimmed);

    if (!trimmed) {
        return null;
    }

    try {
        const url = new URL(schemed ? trimmed : `https://${trimmed}`);
        const web = url.protocol === 'https:' || url.protocol === 'http:';

        const named = /\.[a-z][^.]*$/i.test(url.hostname);

        const keepable =
            !url.username && !url.password && encodeParens(url.href).length <= MAX_TARGET;

        return web && (schemed || named) && keepable ? url.href : null;
    } catch {
        return null;
    }
};
