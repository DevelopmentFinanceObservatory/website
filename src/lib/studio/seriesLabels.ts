/**
 * Legend names for a chart's series (QA-57).
 *
 * WHO and UN indicators arrive with the whole query spelled out in every
 * series name: the same indicator sentence, the same dimension keys, the
 * same country, over and over, with one clause in the middle telling them
 * apart. Rendered as-is, four of those fill a card and leave the plot no
 * room; truncated as-is, four of them read identically.
 *
 * So the text every series shares is dropped and what distinguishes them
 * is kept. Shared text is cut where a clause ends, at the punctuation that
 * joins an indicator name to its dimensions and its place. A space is a cut
 * only inside running sentence-case text ("Outstanding external debt
 * denominated in Euro"): a place or organisation name is a run of
 * capitalised words ("United States of America", "South Sudan", "Asian
 * Development Bank") that shares words with its neighbours, and cutting it
 * at a space would drop them. Display only: the tooltip, the table and the
 * download keep the name the data came with, and the legend carries the
 * full text in its `title`.
 */

// Where a shared head may end: after a dimension list opens, after a
// dimension key, after a colon or semicolon, after a spaced separator
// (" / ", " - ", " — ", " · "), or after a comma inside brackets. A comma
// outside brackets belongs to the name ("Korea, Republic of"), and so does
// an opening parenthesis ("Virgin Islands (British)").
const HEAD_END = /\[|=|[:;]|\s[/·—–-](?=\s)|,/g;

// Where a shared tail may start: before a bracket, a semicolon, a spaced
// separator, or a comma inside brackets.
const TAIL_START = /[[\]()]|;|\s[/·—–-](?=\s)|,/g;

// What may be trimmed off a name's edges once the shared text is gone.
const SEPARATORS = /^[\s,;:/=·—–-]+|[\s,;:/=·—–-]+$/g;

// Short words a capitalised name carries in lower case ("Republic of the
// Congo", "Saint Kitts and Nevis").
const NAME_JOINERS = new Set([
    'a',
    'an',
    'and',
    'at',
    'by',
    'de',
    'for',
    'in',
    'of',
    'on',
    'or',
    'the',
    'to',
]);

// A space may be cut at when the part of the clause dropped with it holds
// this many lower-case words besides the joiners. A place or organisation
// name holds at most one ("European Union institutions"), and an indicator
// sentence holds several ("external debt denominated"). Two would also cut
// the pair "Lower middle income" and "Upper middle income" to one word each.
const SENTENCE_WORDS = 3;

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

/** Brackets opened in `text` and not closed in it. */
const openDepth = (text: string): number => count(text, /[[(]/g) - count(text, /[\])]/g);

/** Whether one pair of brackets holds the whole of `text`, as in "(% of GDP)". */
const isWrapped = (text: string): boolean =>
    /^[[(]/.test(text) &&
    /[\])]$/.test(text) &&
    [...text.slice(0, -1)].every((_, end) => openDepth(text.slice(0, end + 1)) > 0);

/** `text` without separators or enclosing brackets at its edges, or brackets that pair with nothing in it. */
const trimEdges = (text: string): string => {
    let trimmed = text;
    let previous: string;

    do {
        previous = trimmed;
        trimmed = trimmed.replace(SEPARATORS, '').replace(/^[\])]+|[[(]+$/g, '');

        if (/^[[(]/.test(trimmed) && openDepth(trimmed) > 0) {
            trimmed = trimmed.slice(1);
        }

        if (/[\])]$/.test(trimmed) && openDepth(trimmed) < 0) {
            trimmed = trimmed.slice(0, -1);
        }

        if (isWrapped(trimmed)) {
            trimmed = trimmed.slice(1, -1);
        }
    } while (trimmed !== previous);

    return trimmed;
};

// The dropped text must hold a word, so a lone bracket or separator is
// never taken as something the names share.
const holdsWord = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

// A word in lower case: the first and last words of the text dropped at a
// space must be one, since a capitalised word beside the cut belongs to a
// name ("Net bilateral aid flows from DAC donors, United States").
const LOWER_WORD = /^\p{Ll}/u;

const words = (text: string): string[] => text.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);

/** Whether `text` reads as running sentence-case text, not a name. */
const isSentence = (text: string): boolean =>
    words(text).filter((word) => LOWER_WORD.test(word) && !NAME_JOINERS.has(word)).length >=
    SENTENCE_WORDS;

/** Where in `label` a shared head may end, in order. */
const headCuts = (label: string): number[] => {
    const cuts: number[] = [];
    let clause = 0;

    for (let at = 0; at < label.length; at += 1) {
        HEAD_END.lastIndex = at;
        const mark = HEAD_END.exec(label);

        if (mark?.index === at && (mark[0] !== ',' || openDepth(label.slice(0, at)) > 0)) {
            clause = at + mark[0].length;
            cuts.push(clause);
            at = clause - 1;
        } else if (
            /\s/.test(label[at]!) &&
            isSentence(label.slice(clause, at)) &&
            LOWER_WORD.test(words(label.slice(clause, at)).at(-1) ?? '')
        ) {
            cuts.push(at);
        }
    }

    return cuts;
};

/** Where in `label` a shared tail may start, in order. */
const tailCuts = (label: string): number[] => {
    const cuts: number[] = [];
    let clause = label.length;

    for (let at = label.length - 1; at >= 0; at -= 1) {
        TAIL_START.lastIndex = at;
        const mark = TAIL_START.exec(label);

        if (mark?.index === at && (mark[0] !== ',' || openDepth(label.slice(at)) < 0)) {
            clause = at;
            cuts.unshift(at);
        } else if (
            /\s/.test(label[at]!) &&
            isSentence(label.slice(at, clause)) &&
            LOWER_WORD.test(words(label.slice(at, clause))[0] ?? '')
        ) {
            cuts.unshift(at);
        }
    }

    return cuts;
};

/** How many leading characters every name shares, ending where a cut may be made. */
const commonPrefix = (labels: string[]): number => {
    const [first = '', ...rest] = labels;
    let shared = 0;

    while (shared < first.length && rest.every((label) => label[shared] === first[shared])) {
        shared += 1;
    }

    const length = headCuts(first)
        .filter((cut) => cut <= shared)
        .at(-1);

    return length && holdsWord(first.slice(0, length)) ? length : 0;
};

/** How many trailing characters every name shares, starting where a cut may be made. */
const commonSuffix = (labels: string[], prefix: number): number => {
    const [first = '', ...rest] = labels;
    const room = Math.min(...labels.map((label) => label.length)) - prefix;
    let shared = 0;

    while (
        shared < room &&
        rest.every((label) => label[label.length - 1 - shared] === first[first.length - 1 - shared])
    ) {
        shared += 1;
    }

    const start = tailCuts(first).find((cut) => first.length - cut <= shared);

    return start !== undefined && holdsWord(first.slice(start)) ? first.length - start : 0;
};

/** Labels split into the text they all share and what tells them apart. */
export type SplitLabels = {
    /** The shared head with its edges trimmed, empty when nothing was dropped there. */
    prefix: string;
    /** The shared tail with its edges trimmed, empty when nothing was dropped there. */
    suffix: string;
    /** Each label without the shared text, in input order. */
    names: string[];
};

/**
 * `labels` split into the text they all share and what tells them apart.
 * When nothing can be dropped without losing what tells them apart, the
 * names are the labels unchanged and nothing is shared.
 */
export const splitLabels = (labels: string[]): SplitLabels => {
    const unchanged = { prefix: '', suffix: '', names: labels };

    if (labels.length < 2 || labels.some((label) => !label)) {
        return unchanged;
    }

    const prefix = commonPrefix(labels);
    const suffix = commonSuffix(labels, prefix);

    if (prefix + suffix === 0) {
        return unchanged;
    }

    const cut = labels.map((label) => trimEdges(label.slice(prefix, label.length - suffix)));

    if (cut.some((label) => !label) || new Set(cut).size !== new Set(labels).size) {
        return unchanged;
    }

    const first = labels[0]!;
    const head = first.slice(0, prefix);
    const shared = {
        prefix: trimEdges(head),
        suffix: trimEdges(first.slice(first.length - suffix)),
    };

    // One more pass where it is free: when the names sit inside a dimension
    // list and the leading dimension alone already tells every series apart,
    // the rest is the query repeating itself. A comma outside brackets is
    // part of a name, so only " · " separates clauses there.
    const clause = openDepth(head) > 0 ? /,\s|\s·\s/ : /\s·\s/;
    const heads = cut.map((label) => trimEdges(label.split(clause)[0] ?? ''));

    return {
        ...shared,
        names: heads.every((name) => name) && new Set(heads).size === cut.length ? heads : cut,
    };
};

/**
 * `labels` with the text they all share removed, or the labels unchanged
 * when nothing can be dropped without losing what tells them apart.
 */
export const legendLabels = (labels: string[]): string[] => splitLabels(labels).names;
