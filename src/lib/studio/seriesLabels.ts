/**
 * Legend names for a chart's series (QA-57).
 *
 * WHO and UN indicators arrive with the whole query spelled out in every
 * series name — the same indicator sentence, the same dimension keys, the
 * same country, over and over, with one clause in the middle telling them
 * apart. Rendered as-is, four of those fill a card and leave the plot no
 * room; truncated as-is, four of them read identically.
 *
 * So what every series shares is dropped and what distinguishes them is
 * kept. Display only: the tooltip, the table and the download keep the
 * name the data came with, and the legend carries the full text in its
 * `title`.
 */

// What a name may be cut at: the punctuation these labels hang their
// clauses off, plus whitespace.
const BOUNDARY = /[\s,;:/[\]()=·—–-]/;

const trimEdges = (text: string): string =>
    text.replace(/^[\s,;:/[\]()=·—–-]+|[\s,;:/[\]()=·—–-]+$/g, '');

/** How many leading characters every name shares. */
const commonPrefix = (labels: string[]): number => {
    const [first = '', ...rest] = labels;
    let length = 0;

    while (length < first.length && rest.every((label) => label[length] === first[length])) {
        length += 1;
    }

    // Back off to the last boundary, so a name is never cut mid-word.
    while (length > 0 && !BOUNDARY.test(first[length - 1]!)) {
        length -= 1;
    }

    return length;
};

/** How many trailing characters every name shares. */
const commonSuffix = (labels: string[], prefix: number): number => {
    const [first = '', ...rest] = labels;
    const room = Math.min(...labels.map((label) => label.length)) - prefix;
    let length = 0;

    while (
        length < room &&
        rest.every((label) => label[label.length - 1 - length] === first[first.length - 1 - length])
    ) {
        length += 1;
    }

    while (length > 0 && !BOUNDARY.test(first[first.length - length]!)) {
        length -= 1;
    }

    return length;
};

/**
 * `labels` with the text they all share removed, or the labels unchanged
 * when nothing can be dropped without losing what tells them apart.
 */
export const legendLabels = (labels: string[]): string[] => {
    if (labels.length < 2 || labels.some((label) => !label)) {
        return labels;
    }

    const prefix = commonPrefix(labels);
    const suffix = commonSuffix(labels, prefix);

    if (prefix + suffix === 0) {
        return labels;
    }

    const cut = labels.map((label) => trimEdges(label.slice(prefix, label.length - suffix)));

    if (cut.some((label) => !label) || new Set(cut).size !== new Set(labels).size) {
        return labels;
    }

    // One more pass where it is free: when the leading clause alone already
    // tells every series apart, the rest is the query repeating itself.
    // (ponytail: a clause-level heuristic, not a parse of the dimension
    // syntax — the full name is a hover away either way.)
    const heads = cut.map((label) => trimEdges(label.split(/,\s|\s·\s/)[0] ?? ''));

    return heads.every((head) => head) && new Set(heads).size === cut.length ? heads : cut;
};
