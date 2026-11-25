/**
 * Links in a card's note. A note is plain text that keeps its line breaks,
 * and a link is written into it as Markdown, `[words](https://…)`, so a
 * saved note stays a string everywhere it is stored and shared. Only http
 * and https targets are links. Any other bracketed text stays text. A
 * link's words hold no brackets and no line break, and its target's
 * parentheses are percent-encoded, so neither can end the link early.
 */

export type NotePart = { text: string; href?: string };

const LINK = /\[([^[\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

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
export const linkable = (words: string): boolean => words.trim() !== '' && !/[[\]\n]/.test(words);

/** A typed link target as an http(s) URL, or null when it is not one. A
 *  target typed without a scheme takes https, and then needs a dot in its
 *  host, so a lone word is not read as a site. */
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

        return web && (schemed || url.hostname.includes('.')) ? url.href : null;
    } catch {
        return null;
    }
};
