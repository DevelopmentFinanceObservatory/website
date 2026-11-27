/**
 * The Library's evergreen rule. An artifact's text says what its data
 * measures and how to read it, and leaves the figures to the data, since the
 * data refreshes after publication and the text does not. Pure, so the
 * publish and edit routes (./evergreen.ts), the fit script
 * (scripts/fit-evergreen.mjs) and the replay test send and read the same
 * questions.
 *
 * Each text field is split into candidate sentences, and the candidates go
 * to TypeSafe in batches of `GROUP_SIZE`. Each request asks, per candidate,
 * a Noul ("could a data refresh make this false?") and a Choice naming the
 * kind of claim. `decide` turns a batch's answers into refusals, each naming
 * its sentence by field pointer and offsets.
 */

import { createHash } from 'node:crypto';

/** The Jev release the thresholds were fitted against. A new release needs
 *  a new fit (scripts/fit-evergreen.mjs) before it replaces this one. */
export const MODEL = 'jev-1.14.0';

/** A candidate whose Noul is at or above this is refused. */
export const T_HIGH = 0.7;

/** A candidate between this and `T_HIGH` passes, with a logged warning. */
export const T_LOW = 0.3;

/** The probability the claim-kind Choice must give its option before the
 *  refusal names that kind. Below it the refusal gives the generic reason. */
export const KIND_MIN = 0.6;

/** Candidates per request. The thresholds were fitted on requests of this
 *  many sentences (scripts/fit-evergreen.mjs), so the routes send the same,
 *  which also keeps a request of the longest text well within Jev's context. */
export const GROUP_SIZE = 10;

/** `items` in runs of `GROUP_SIZE`, in order. */
export const batchesOf = <TItem>(items: readonly TItem[]): TItem[][] => {
    const batches: TItem[][] = [];

    for (let at = 0; at < items.length; at += GROUP_SIZE) {
        batches.push(items.slice(at, at + GROUP_SIZE));
    }

    return batches;
};

/** Requests in flight at once for one text. */
export const BATCH_CONCURRENCY = 8;

/** The most a check waits for all its batches, across retries and rounds.
 *  The batches still running then are cancelled and the check is
 *  unavailable. */
export const CHECK_DEADLINE_MS = 12_000;

/** The most sentences one check takes, before any call. That is two rounds
 *  of `BATCH_CONCURRENCY` requests of `GROUP_SIZE`, so even two rounds of
 *  5 s timeouts end inside `CHECK_DEADLINE_MS`. */
export const MAX_CANDIDATES = 2 * BATCH_CONCURRENCY * GROUP_SIZE;

/** Where text of `candidates` runs past `MAX_CANDIDATES`. That is the field
 *  of the first sentence over the limit, or null within it. */
export const overBudget = (
    candidates: readonly { field: EvergreenField }[],
): { pointer: `/${EvergreenField}` } | null => {
    const over = candidates[MAX_CANDIDATES];

    return over ? { pointer: `/${over.field}` } : null;
};

export const EVERGREEN_FIELDS = ['title', 'description', 'contentTitle', 'content'] as const;

export type EvergreenField = (typeof EVERGREEN_FIELDS)[number];

/** The text fields to check, as the routes store them (`readArtifactText`).
 *  A field left out or null is not checked. */
export type EvergreenText = Partial<Record<EvergreenField, string | null>>;

/** One candidate sentence. `text` is `field`'s value from `start` to `end`. */
export type Candidate = {
    field: EvergreenField;
    start: number;
    end: number;
    text: string;
};

export type ClaimKind = 'figure' | 'ranking' | 'trend' | 'recency' | 'volatile';

/** One refused sentence. `pointer` names the field as `readPublish` names
 *  it, and `quote` is the field's own text from `start` to `end`. */
export type EvergreenRefusal = {
    pointer: `/${EvergreenField}`;
    start: number;
    end: number;
    quote: string;
    kind: ClaimKind;
    reason: string;
};

/** A candidate that passed with a Noul between `T_LOW` and `T_HIGH`. */
export type EvergreenDoubt = {
    pointer: `/${EvergreenField}`;
    start: number;
    end: number;
    noul: number;
};

export const REASONS: Record<ClaimKind, string> = {
    figure: 'States a figure that a data update can change.',
    ranking: 'States a ranking that a data update can change.',
    trend: 'States a rise, fall or change that a data update can change.',
    recency: 'Names the latest or current period, which a data update moves on.',
    volatile: 'States what the data shows now, which a data update can change.',
};

/** The fix every refusal points to, sent as the problem's `detail`. */
export const EVERGREEN_FIX =
    'Some text states what the data shows now, which a data update can make false. Say what the chart measures or how to read it, and leave the numbers to the chart.';

// Words a full stop ends without ending the sentence.
const ABBREVIATIONS = new Set([
    'approx',
    'cf',
    'dr',
    'e.g',
    'eg',
    'est',
    'etc',
    'fig',
    'i.e',
    'ie',
    'incl',
    'mr',
    'mrs',
    'ms',
    'no',
    'st',
    'vs',
]);

// Words that open a sentence. A full stop after an initial or a one-letter
// word ends the sentence when one of them follows ("in the U.S. The bars"),
// and otherwise does not ("J. Smith", "U.S. Treasury").
const OPENERS = new Set([
    'a',
    'all',
    'an',
    'and',
    'as',
    'at',
    'but',
    'by',
    'each',
    'every',
    'for',
    'from',
    'here',
    'if',
    'in',
    'it',
    'its',
    'most',
    'on',
    'one',
    'some',
    'that',
    'the',
    'there',
    'these',
    'they',
    'this',
    'those',
    'we',
    'when',
    'where',
    'while',
]);

// A list marker, heading mark or quote mark at the start of a line, which
// the candidate leaves out. A numbered item has at most two digits, so a
// line that opens with a year such as "2024. " keeps it.
const LINE_MARKER = /^(?:[-*+•]\s+|\d{1,2}[.)]\s+|#{1,6}\s+|>\s*)+/;

// Sentence-ending punctuation, any closing quotes, brackets or emphasis
// marks after it, and the space before the next sentence.
const SENTENCE_END = /[.!?]+["'”’)\]*_]*\s+/g;

// What the next sentence starts with. That is a capital or a digit, after
// at most an emphasis mark and an opening quote or bracket.
const SENTENCE_START = /^(?:\*{1,2}|_{1,2})?["'“‘([]?[\p{Lu}\p{Nd}]/u;

const HAS_LETTER = /\p{L}/u;

const HAS_DIGIT = /\p{Nd}/u;

// U.S., U.K., an initial such as "J." or a one-letter word.
const INITIALS = /^(?:\p{L}\.)*\p{L}$/u;

// Whether a full stop after `before` leaves the sentence going on into
// `next`.
const continuesAfter = (before: string, next: string): boolean => {
    const word = (before.split(/\s/).at(-1) ?? '').replace(/^[("'“‘[*_]+/, '').toLowerCase();

    if (ABBREVIATIONS.has(word)) {
        return true;
    }

    const following = /^[*_"'“‘([]*(\p{L}+)/u.exec(next)?.[1].toLowerCase() ?? '';

    return INITIALS.test(word) && !OPENERS.has(following);
};

/**
 * The sentences of `text` as offsets into it, in order. Each line is split
 * apart, with its list or heading marker left out, then split after a full
 * stop, `!` or `?` that a space and a capital, a digit or an emphasis mark
 * follow. A full stop after an abbreviation does not end a sentence, nor
 * does a decimal point. One after an initial ends it only before a word that
 * opens a sentence (`OPENERS`). A piece with no letter but a digit, such as
 * a year or a figure, stays with a sentence beside it. One that opens a
 * sentence joins the sentence after it, and one that ends a line or fills
 * one joins the sentence before it. A piece with neither is no sentence.
 */
export const sentenceSpans = (text: string): { start: number; end: number }[] => {
    // Each piece, and whether it has a letter. A piece with neither a letter
    // nor a digit is left out.
    const pieces: { start: number; end: number; lettered: boolean }[] = [];
    const push = (start: number, end: number, lineStart: number) => {
        const piece = text.slice(start, end);
        const lead = piece.length - piece.trimStart().length;
        const trimmed = piece.trim();
        const span = { start: start + lead, end: start + lead + trimmed.length };
        const last = pieces.at(-1);

        if (HAS_LETTER.test(trimmed)) {
            pieces.push({ ...span, lettered: true });
        } else if (!HAS_DIGIT.test(trimmed)) {
            return;
        } else if (last && last.start >= lineStart) {
            // A figure that ends a line, as in "It rose. 25%.", goes with the
            // sentence before it.
            last.end = span.end;
        } else {
            pieces.push({ ...span, lettered: false });
        }
    };

    for (const line of text.matchAll(/[^\n]+/g)) {
        const marker = LINE_MARKER.exec(line[0].trimStart());
        const indent = line[0].length - line[0].trimStart().length;
        const from = line.index + indent + (marker ? marker[0].length : 0);
        const body = text.slice(from, line.index + line[0].length);
        let start = 0;

        for (const end of body.matchAll(SENTENCE_END)) {
            const stop = end.index + end[0].trimEnd().length;
            const next = body.slice(end.index + end[0].length);
            const fullStop = end[0].startsWith('.') && !/[!?]/.test(end[0]);

            if (!SENTENCE_START.test(next)) {
                continue;
            }

            if (fullStop && continuesAfter(body.slice(start, end.index), next)) {
                continue;
            }

            // A piece with no letter, such as a year, runs on into the next.
            if (!HAS_LETTER.test(body.slice(start, stop))) {
                continue;
            }

            push(from + start, from + stop, line.index);
            start = end.index + end[0].length;
        }

        push(from + start, from + body.length, line.index);
    }

    // A line holding only a figure, as in a list of values, goes with the
    // sentence before it, or the one after it when it comes first. Alone, it
    // is a sentence of its own.
    const spans: { start: number; end: number }[] = [];
    let pending: number | null = null;

    for (const piece of pieces) {
        const last = spans.at(-1);

        if (!piece.lettered && last) {
            last.end = piece.end;
        } else if (!piece.lettered) {
            pending ??= piece.start;
        } else {
            spans.push({ start: pending ?? piece.start, end: piece.end });
            pending = null;
        }
    }

    const lone = pieces.find((piece) => !piece.lettered);

    if (spans.length === 0 && lone) {
        spans.push({ start: lone.start, end: pieces.at(-1)?.end ?? lone.end });
    }

    return spans;
};

/** Every candidate sentence of `text`, field by field in `EVERGREEN_FIELDS`
 *  order. */
export const candidatesOf = (text: EvergreenText): Candidate[] =>
    EVERGREEN_FIELDS.flatMap((field) => {
        const value = text[field];

        return value
            ? sentenceSpans(value).map(({ start, end }) => ({
                  field,
                  start,
                  end,
                  text: value.slice(start, end),
              }))
            : [];
    });

const FIELD_NAMES: Record<EvergreenField, string> = {
    title: 'title',
    description: 'description',
    contentTitle: 'section heading',
    content: 'section text',
};

const PREMISE =
    'Each sentence is part of the text published beside a chart, table or key number. The data behind it is refreshed from its source after publication, and the text is not updated when the data is.';

type NoulQuestion = {
    type: 'noul';
    instructions: string;
    criteria: { true: string; false: string };
};

type ChoiceQuestion = {
    type: 'choice';
    instructions: string;
    criteria: Record<Exclude<ClaimKind, 'volatile'> | 'other', string>;
};

/** The body of the TypeSafe request for `candidates`, less its model. */
export type EvergreenRequest = {
    state: { premise: string; sentences: { part: string; text: string }[] };
    questions: Record<string, NoulQuestion | ChoiceQuestion>;
};

export const volatileId = (index: number): string => `volatile_${index}`;
export const kindId = (index: number): string => `kind_${index}`;

const volatileQuestion = (index: number): NoulQuestion => ({
    type: 'noul',
    instructions: `When the data is refreshed, could \`sentences[${index}].text\` become false or out of date?`,
    criteria: {
        true: 'It reports what the data shows at one time: a value, share or amount, a rank, a "most" or "largest", a count of countries, a rise or fall, a record, the latest or current year, or a forecast.',
        false: 'It explains what is measured, how to read the display, a method, definition, unit or source, or a fixed policy target, all of which stay true when the data changes.',
    },
});

const kindQuestion = (index: number): ChoiceQuestion => ({
    type: 'choice',
    instructions: `What kind of claim does \`sentences[${index}].text\` make?`,
    criteria: {
        figure: 'A specific value, amount or share',
        ranking: 'A rank, a "most" or "largest", or a count of countries that meet a condition',
        trend: 'A rise, fall, record or change over time, or a forecast',
        recency: 'The latest, current or a named recent period, or "now"',
        other: 'None of these',
    },
});

/** The request that asks both questions of every candidate. */
export const evergreenRequest = (candidates: readonly Candidate[]): EvergreenRequest => ({
    state: {
        premise: PREMISE,
        sentences: candidates.map((candidate) => ({
            part: FIELD_NAMES[candidate.field],
            text: candidate.text,
        })),
    },
    questions: Object.fromEntries(
        candidates.flatMap((_, index) => [
            [volatileId(index), volatileQuestion(index)],
            [kindId(index), kindQuestion(index)],
        ]),
    ),
});

/** A digest of `request`, which a recorded fit stores so that a change to
 *  the questions' wording invalidates the recording. */
export const requestDigest = (request: EvergreenRequest): string =>
    createHash('sha256').update(JSON.stringify(request)).digest('hex');

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const probability = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

/** The Noul of a recorded or returned answer, or null when it is not one. */
export const noulOf = (answer: unknown): number | null =>
    isRecord(answer) && answer.type === 'noul' ? probability(answer.noul) : null;

const KINDS: ReadonlySet<string> = new Set(['figure', 'ranking', 'trend', 'recency']);

// The kind a refusal names. That is the Choice's option when it is one of
// the named kinds and holds at least `KIND_MIN`, and `volatile` otherwise.
// Null when the answer is not a Choice.
const kindOf = (answer: unknown): ClaimKind | null => {
    if (!isRecord(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string') {
        return null;
    }

    const held = isRecord(answer.probabilities)
        ? probability(answer.probabilities[answer.choice])
        : null;

    return KINDS.has(answer.choice) && held !== null && held >= KIND_MIN
        ? (answer.choice as ClaimKind)
        : 'volatile';
};

export type EvergreenDecision =
    | { answered: true; refusals: EvergreenRefusal[]; doubts: EvergreenDoubt[] }
    | { answered: false };

/**
 * The refusals the answers to `evergreenRequest(candidates)` call for. Each
 * candidate whose Noul is at least `T_HIGH` is refused, with the kind its
 * Choice names.
 * Candidates between `T_LOW` and `T_HIGH` pass and are listed in `doubts`.
 * When any question has no answer of its type, the decision is unanswered,
 * and the caller treats the check as unavailable.
 */
export const decide = (
    candidates: readonly Candidate[],
    answers: Record<string, unknown>,
    tHigh: number = T_HIGH,
): EvergreenDecision => {
    const refusals: EvergreenRefusal[] = [];
    const doubts: EvergreenDoubt[] = [];

    for (const [index, candidate] of candidates.entries()) {
        const noul = noulOf(answers[volatileId(index)]);
        const kind = kindOf(answers[kindId(index)]);

        if (noul === null || kind === null) {
            return { answered: false };
        }

        const at = {
            pointer: `/${candidate.field}` as const,
            start: candidate.start,
            end: candidate.end,
        };

        if (noul >= tHigh) {
            refusals.push({ ...at, quote: candidate.text, kind, reason: REASONS[kind] });
        } else if (noul >= T_LOW) {
            doubts.push({ ...at, noul });
        }
    }

    return { answered: true, refusals, doubts };
};

/** The fields of `next` whose text differs from `stored`'s, which an edit
 *  checks. A field cleared to null has nothing to check and is left out. */
export const changedText = (stored: EvergreenText, next: EvergreenText): EvergreenText =>
    Object.fromEntries(
        EVERGREEN_FIELDS.flatMap((field) =>
            next[field] && next[field] !== stored[field] ? [[field, next[field]]] : [],
        ),
    );
