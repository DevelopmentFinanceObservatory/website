import type { LanguageFn } from 'highlight.js';

/**
 * A CSV grammar for highlight.js, which ships none (QA-11) — the corpus
 * uses `csv` fences to show node definition files.
 *
 * Deliberately thin: the header row is the key line, a quoted field is the
 * one place a comma does NOT end a column, and the separators themselves
 * want to recede so the columns read as columns. Everything else is data
 * and keeps the base colour.
 */
export const csvLanguage: LanguageFn = () => ({
    name: 'CSV',
    contains: [
        {
            // The header, which is a matter of position rather than shape:
            // `^` is every line under hljs's multiline compile, so the mode
            // opens only when the match really is at the start of the
            // sample and waves the others through.
            scope: 'attr',
            begin: /^[^\n]+/,
            'on:begin': (match, response) => {
                if (match.index !== 0) {
                    response.ignoreMatch();
                }
            },
            relevance: 0,
        },
        {
            scope: 'string',
            begin: /"/,
            end: /"/,
            contains: [{ begin: /""/ }],
            relevance: 0,
        },
        { scope: 'punctuation', match: /,/, relevance: 0 },
        { scope: 'number', match: /\b\d+(?:\.\d+)?\b/, relevance: 0 },
    ],
});
