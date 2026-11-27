/**
 * The Library's evergreen rule: an artifact's text says what its data
 * measures and how to read it, and leaves the figures to the data, since the
 * data refreshes after publication and the text does not. Pure, so the
 * publish and edit routes (./evergreen.ts), the fit script
 * (scripts/fit-evergreen.mjs) and the replay test send and read the same
 * questions.
 *
 * Each text field is split into candidate sentences. One TypeSafe request
 * asks, per candidate, a Noul ("could a data refresh make this false?") and
 * a Choice naming the kind of claim. `decide` turns the answers into
 * refusals, each naming its sentence by field pointer and offsets.
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

export const EVERGREEN_FIELDS = ['title', 'description', 'contentTitle', 'content'] as const;

export type EvergreenField = (typeof EVERGREEN_FIELDS)[number];

/** The text fields to check, as the routes store them (`readArtifactText`).
 *  A field left out or null is not checked. */
export type EvergreenText = Partial<Record<EvergreenField, string | null>>;

/** One candidate sentence: `text` is `field`'s value from `start` to `end`. */
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

// A list marker, heading mark or quote mark at the start of a line, which
// the candidate leaves out.
const LINE_MARKER = /^(?:[-*+•]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)+/;

// Sentence-ending punctuation, any closing quotes or brackets after it, and
// the space before the next sentence.
const SENTENCE_END = /[.!?]+["'”’)\]]*\s+/g;

// What the next sentence starts with: a capital, a digit, or an opening
// quote or bracket.
const SENTENCE_START = /^["'“‘([]?[\p{Lu}\p{Nd}]/u;

const HAS_LETTER = /\p{L}/u;

const isAbbreviation = (before: string): boolean => {
    const word = (before.split(/\s/).at(-1) ?? '').replace(/^[("'“‘[]+/, '').toLowerCase();

    // U.S., U.K. and an initial such as "J."
    return ABBREVIATIONS.has(word) || /^(?:\p{L}\.)*\p{L}$/u.test(word);
};

/**
 * The sentences of `text` as offsets into it, in order. Each line is split
 * apart, with its list or heading marker left out, then split after a full
 * stop, `!` or `?` that a space and a capital or digit follow. A full stop
 * after an abbreviation or an initial does not end a sentence, nor does a
 * decimal point. A piece with no letter in it is no sentence.
 */
export const sentenceSpans = (text: string): { start: number; end: number }[] => {
    const spans: { start: number; end: number }[] = [];
    const push = (start: number, end: number) => {
        const piece = text.slice(start, end);
        const lead = piece.length - piece.trimStart().length;
        const trimmed = piece.trim();

        if (HAS_LETTER.test(trimmed)) {
            spans.push({ start: start + lead, end: start + lead + trimmed.length });
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

            if (fullStop && isAbbreviation(body.slice(start, end.index))) {
                continue;
            }

            push(from + start, from + stop);
            start = end.index + end[0].length;
        }

        push(from + start, from + body.length);
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

// The kind a refusal names: the Choice's option when it is one of the named
// kinds and holds at least `KIND_MIN`, else `volatile`. Null when the
// answer is not a Choice.
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
 * The refusals the answers to `evergreenRequest(candidates)` call for: every
 * candidate whose Noul is at least `T_HIGH`, with the kind its Choice names.
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
