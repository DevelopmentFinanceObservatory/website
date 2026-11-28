/**
 * The Library's evergreen rule. An artifact's text says what its data
 * measures and how to read it, and leaves the figures to the data, since the
 * data refreshes after publication and the text does not. Pure, so the
 * publish and edit routes (./evergreen.ts), the fit script
 * (scripts/fit-evergreen.mjs) and the replay tests send and read the same
 * questions.
 *
 * Each text field is split into candidate sentences, and each candidate goes
 * to TypeSafe in a request of its own, whose state holds that sentence and
 * its part alone. One Noul asks whether a data refresh could make the
 * sentence false, and decides. Four more ask whether it states a value, a
 * ranking, a change or a period, and the highest of them names the kind of
 * claim a refusal or a warning reports. `decide` reads one request's
 * answers.
 */

import { createHash } from 'node:crypto';

/** The Jev release the threshold was fitted against. A new release needs a
 *  new fit (scripts/fit-evergreen.mjs) before it replaces this one. */
export const MODEL = 'jev-1.14.0';

/** A sentence whose refresh Noul is at or above this is refused. */
export const T_HIGH = 0.8;

/** A sentence between this and `T_HIGH` passes with a warning. */
export const T_LOW = 0.3;

// The highest kind Noul a refusal also needs. A refresh Noul of at least
// T_HIGH with no kind Noul this high passes with a warning, since the
// sentence then names no claim the author could take out.
export const T_KIND = 0.5;

/** Requests in flight at once for one text. */
export const REQUEST_CONCURRENCY = 8;

/** The most a check waits for all its requests, across retries. The
 *  requests still running then are cancelled and the check is
 *  unavailable. */
export const CHECK_DEADLINE_MS = 12_000;

/** The most sentences one check takes, before any call. At
 *  `REQUEST_CONCURRENCY` in flight that is 20 rounds, which at the 0.29 s
 *  95th-percentile request time recorded by the fit take about 6 s, half of
 *  `CHECK_DEADLINE_MS`. */
export const MAX_CANDIDATES = 20 * REQUEST_CONCURRENCY;

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

export type ClaimKind = 'figure' | 'ranking' | 'trend' | 'recency';

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

/** A sentence that passed with a refresh Noul between `T_LOW` and
 *  `T_HIGH`. The routes return it without `noul`, so the author can look at
 *  it, and log it without `quote`. */
export type EvergreenWarning = Omit<EvergreenRefusal, 'reason'> & { noul: number };

export const REASONS: Record<ClaimKind, string> = {
    figure: 'States a figure that a data update can change.',
    ranking: 'States a ranking that a data update can change.',
    trend: 'States a rise, fall or change that a data update can change.',
    recency: 'Ties what the data shows to a period, which a data update moves on.',
};

/** The reason for a title or section heading that names a year range
 *  (`namesYearRange`). */
export const YEAR_RANGE_REASON =
    'Names a year range, which the chart outgrows when new data arrive.';

/** The reason for a title or section heading that names the year the data
 *  covers (`namesDataYear`). */
export const DATA_YEAR_REASON = 'Names the year the data covers, which a data update moves past.';

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

// A list item's marker, and sentence-ending punctuation in its text.
const LIST_ITEM = /^\s*(?:[-*+•]|\d{1,2}[.)])\s+/;
const ENDS_SENTENCE = /[.!?]["'”’)\]*_]*(?:\s|$)/;

// How many of `lines` from `from` on are list items with no sentence-ending
// punctuation, one after another.
const listRun = (lines: readonly RegExpExecArray[], from: number): number => {
    let count = 0;

    for (const line of lines.slice(from)) {
        const marker = LIST_ITEM.exec(line[0]);

        if (!marker || ENDS_SENTENCE.test(line[0].slice(marker[0].length))) {
            break;
        }

        count += 1;
    }

    return count;
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
 * one joins the sentence before it. A piece with neither is no sentence. A
 * line ending in a colon runs on through the list items after it whose text
 * has no full stop, `!` or `?` (`listRun`).
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

    const lines = [...text.matchAll(/[^\n]+/g)];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
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

        // A line ending in a colon and the list items after it that are no
        // sentence of their own make one sentence, since each item says
        // nothing without the line that introduces it.
        const items = line[0].trimEnd().endsWith(':') ? listRun(lines, index + 1) : 0;
        const last = pieces.at(-1);

        if (items > 0 && last && last.start >= line.index) {
            const end = lines[index + items];
            last.end = end.index + end[0].trimEnd().length;
            last.lettered ||= HAS_LETTER.test(text.slice(last.start, last.end));
            index += items;
        }
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

// The fields the year rules apply to.
const HEADING_FIELDS: ReadonlySet<EvergreenField> = new Set(['title', 'contentTitle']);

// Two years from 1900 to 2099 joined by "to", "through", a hyphen or a dash,
// or by "between" and "and".
const YEAR_RANGE =
    /\b(?:19|20)\d{2}\s*(?:-|–|—|to|through)\s*(?:19|20)\d{2}\b|\bbetween\s+(?:19|20)\d{2}\s+and\s+(?:19|20)\d{2}\b/iu;

/** Whether `candidate` is a title or section heading that names a year
 *  range, which `decide` refuses whatever the answers. A range in a
 *  description or section text is left to the questions. */
export const namesYearRange = (candidate: Candidate): boolean =>
    HEADING_FIELDS.has(candidate.field) && YEAR_RANGE.test(candidate.text);

// A year from 1900 to 2099 as the object of "in", "for", "during", "as of" or
// "at end", or ending the text after a comma, a colon or a dash. A year followed by
// "prices" or "dollars" is a price base.
const DATA_YEAR =
    /\b(?:in|for|during|as of|at (?:the )?end(?: of)?)\s+(?:19|20)\d{2}\b(?!\s+(?:constant\s+)?(?:prices|(?:US\s+)?dollars))|[,:\-–—]\s*(?:19|20)\d{2}\s*$/giu;

// Words before a year that make it a base year, a start, a method date or a
// goal's date, which a data update leaves true.
const NOT_DATA_YEAR =
    /\b(?:since|from|compared with|relative to|before|after|base year|prices|constant\b.*\bprices|(?:target|goal|agenda|deadline)(?:\s+(?:for|of))?)\s*$/iu;

/** Whether `candidate` is a title or section heading that names the year the
 *  data covers, as in "Total ODA in 2023" or "Giving by donor, 2023", which
 *  `decide` refuses whatever the answers. A year after "since", "from",
 *  "compared with", "relative to", "before", "after", "base year",
 *  "constant ... prices" or "prices", or after "target", "goal", "agenda"
 *  or "deadline" and an optional "for" or "of", or before "prices" or
 *  "dollars", does not count. */
export const namesDataYear = (candidate: Candidate): boolean =>
    HEADING_FIELDS.has(candidate.field) &&
    [...candidate.text.matchAll(DATA_YEAR)].some(
        (match) => !NOT_DATA_YEAR.test(candidate.text.slice(0, match.index)),
    );

const PARTS: Record<EvergreenField, string> = {
    title: 'title',
    description: 'description',
    contentTitle: 'section heading',
    content: 'section text',
};

/** The questions each request asks. `stale` decides; the other four name
 *  the kind of claim. */
export const QUESTION_NAMES = ['value', 'ranking', 'change', 'period', 'stale'] as const;

export type QuestionName = (typeof QUESTION_NAMES)[number];

const KIND_OF: Record<Exclude<QuestionName, 'stale'>, ClaimKind> = {
    value: 'figure',
    ranking: 'ranking',
    change: 'trend',
    period: 'recency',
};

type Criterion = { what?: string; not_for?: string; examples: string[] };

/** The body of one TypeSafe request, less its model. */
export type EvergreenRequest = {
    state: { part: string; sentence: string };
    questions: Record<
        QuestionName,
        {
            type: 'noul';
            instructions: string;
            criteria: { true: string | Criterion; false: string | Criterion };
        }
    >;
};

// Each example is a sentence of labelled.json, which the fit leaves out of
// scoring (`EXAMPLE_SENTENCES`), or one written for the criteria that no
// scored set holds.
const QUESTIONS: EvergreenRequest['questions'] = {
    value: {
        type: 'noul',
        instructions: 'Does `sentence` state a value, amount, share or count that the data shows?',
        criteria: {
            true: {
                what: 'Reports a number read from the data',
                examples: [
                    'Total ODA reached USD 223 billion in 2023.',
                    'In-donor refugee costs make up 14% of the total.',
                ],
            },
            false: {
                what: 'Gives a fixed target, unit, threshold or definition, or no number',
                not_for: 'A policy target or the unit of the chart',
                examples: [
                    'The 0.15-0.20% target is the share of gross national income donors agreed to give to least developed countries.',
                    'Use the filter above the chart to switch between commitments and disbursements.',
                ],
            },
        },
    },
    ranking: {
        type: 'noul',
        instructions:
            'Does `sentence` rank or compare countries or groups by the data, such as the largest, the most, or who is above a line?',
        criteria: {
            true: {
                what: 'Places countries or groups in an order the data sets',
                examples: ['Germany is now the second-largest donor, behind the United States.'],
            },
            false: {
                what: 'Says how to compare, or names groups without placing them',
                not_for: 'A label that names a top list or a ranking without placing anyone in it',
                examples: [
                    'Select a country to compare it with its income group.',
                    'The table lists the ten largest recipients for the year you pick.',
                ],
            },
        },
    },
    change: {
        type: 'noul',
        instructions:
            'Does `sentence` say the data rose, fell, turned, doubled, hit a record, or will change?',
        criteria: {
            true: {
                what: 'Reports a movement in the data, past or expected',
                examples: ['Climate finance has doubled over the past decade.'],
            },
            false: {
                what: 'Reports no movement in the data',
                not_for: 'A method or definition that mentions change',
                examples: [
                    'Values are in constant US dollars, adjusted to a base year, so changes over time reflect volumes rather than price rises.',
                ],
            },
        },
    },
    period: {
        type: 'noul',
        instructions:
            'Does `sentence` tie what the data shows to a specific year, a range of years, or the latest or current period?',
        criteria: {
            true: {
                what: 'Dates a result of the data',
                examples: ['The latest data, for 2023, show climate finance at USD 115 billion.'],
            },
            false: {
                what: 'Names no period for a result',
                not_for:
                    'A year that dates a method or a break in the series, or a label that names the latest period without saying what the data shows then',
                examples: [
                    'Figures before 2018 use the cash-flow method, so the line has a break at that year.',
                    'The map opens on the most recent year in the dataset, and the menu picks any other.',
                ],
            },
        },
    },
    stale: {
        type: 'noul',
        instructions: 'When the data is refreshed, could `sentence` become false or out of date?',
        criteria: {
            true: 'It reports what the data shows at one time: a value, share or amount, a rank, a "most" or "largest", a count of countries, a rise or fall, a record, the latest or current year, or a forecast.',
            false: {
                what: 'It explains what is measured, how to read the display, a method, definition, unit or source, or a fixed policy target, all of which stay true when the data changes.',
                not_for:
                    'Text that names the kind of view, such as the latest year, the top recipients or a trend, without stating the result',
                examples: ['Trend in bilateral aid to basic education'],
            },
        },
    },
};

/** The sentences the questions' criteria quote, which no scored set holds. */
export const EXAMPLE_SENTENCES: ReadonlySet<string> = new Set(
    QUESTION_NAMES.flatMap((name) =>
        [QUESTIONS[name].criteria.true, QUESTIONS[name].criteria.false].flatMap((criterion) =>
            typeof criterion === 'string' ? [] : criterion.examples,
        ),
    ),
);

/** The request for one candidate: its sentence and part as the state, and
 *  every question about `sentence`. */
export const evergreenRequest = (candidate: Candidate): EvergreenRequest => ({
    state: { part: PARTS[candidate.field], sentence: candidate.text },
    questions: QUESTIONS,
});

/** A digest of `request`, which a recording stores so that a change to the
 *  questions or the request's shape invalidates it. */
export const requestDigest = (request: EvergreenRequest): string =>
    createHash('sha256').update(JSON.stringify(request)).digest('hex');

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const probability = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

/** The Noul of a recorded or returned answer, or null when it is not one. */
export const noulOf = (answer: unknown): number | null =>
    isRecord(answer) && answer.type === 'noul' ? probability(answer.noul) : null;

const KIND_QUESTIONS = ['value', 'ranking', 'change', 'period'] as const satisfies readonly Exclude<
    QuestionName,
    'stale'
>[];

/** A request's answers: every Noul by question, the refresh Noul, and the
 *  highest kind Noul with the kind it names. Null when any question has no
 *  Noul answer. */
export type Score = {
    nouls: Record<QuestionName, number>;
    stale: number;
    kind: ClaimKind;
    kindNoul: number;
};

export const scoreOf = (answers: Record<string, unknown>): Score | null => {
    const [value, ranking, change, period, stale] = QUESTION_NAMES.map((name) =>
        noulOf(answers[name]),
    );

    if (value == null || ranking == null || change == null || period == null || stale == null) {
        return null;
    }

    const nouls = { value, ranking, change, period, stale };
    const best = KIND_QUESTIONS.reduce((top, name) => (nouls[name] > nouls[top] ? name : top));

    return { nouls, stale, kind: KIND_OF[best], kindNoul: nouls[best] };
};

export type EvergreenDecision =
    | { outcome: 'refused'; refusal: EvergreenRefusal; score: Score; rule: RefusalRule }
    | { outcome: 'warned'; warning: EvergreenWarning; score: Score }
    | { outcome: 'passed' }
    | { outcome: 'unanswered' };

/** What refused a sentence: `namesYearRange`, `namesDataYear`, or the
 *  Nouls. */
export type RefusalRule = 'year_range' | 'data_year' | 'nouls';

/** The thresholds `decide` applies, which the fit sweeps. */
export type Thresholds = { stale: number; kind: number };

/** What else `decide` knows of the artifact. `fixedPeriods` says every data
 *  card it shows draws periods that a data update leaves as they are. */
export type DecideContext = { fixedPeriods?: boolean };

/** Whether `candidate` trips a year rule (`namesYearRange`, `namesDataYear`),
 *  the one case where `decide` reads `DecideContext.fixedPeriods`. */
export const namesYear = (candidate: Candidate): boolean =>
    namesYearRange(candidate) || namesDataYear(candidate);

/**
 * What the answers to `evergreenRequest(candidate)` call for. A title or
 * section heading that names a year range (`namesYearRange`) or the year the
 * data covers (`namesDataYear`) is refused, unless `context.fixedPeriods`
 * holds, when the answers decide it as they decide any sentence. Any
 * other sentence is refused when its refresh Noul is at least
 * `thresholds.stale` and its highest kind Noul at least `thresholds.kind`.
 * It passes with a warning when the refresh Noul is that high but no kind
 * Noul is, or when the refresh Noul is between `T_LOW` and
 * `thresholds.stale`. When any question has no Noul answer, the decision is
 * unanswered, and the caller treats the check as unavailable.
 */
export const decide = (
    candidate: Candidate,
    answers: Record<string, unknown>,
    thresholds: Thresholds = { stale: T_HIGH, kind: T_KIND },
    context: DecideContext = {},
): EvergreenDecision => {
    const score = scoreOf(answers);

    if (!score) {
        return { outcome: 'unanswered' };
    }

    const at = {
        pointer: `/${candidate.field}` as const,
        start: candidate.start,
        end: candidate.end,
        quote: candidate.text,
    };

    const yearRules = !context.fixedPeriods;

    if (yearRules && namesYearRange(candidate)) {
        return {
            outcome: 'refused',
            refusal: { ...at, kind: 'recency', reason: YEAR_RANGE_REASON },
            score,
            rule: 'year_range',
        };
    }

    if (yearRules && namesDataYear(candidate)) {
        return {
            outcome: 'refused',
            refusal: { ...at, kind: 'recency', reason: DATA_YEAR_REASON },
            score,
            rule: 'data_year',
        };
    }

    if (score.stale >= thresholds.stale && score.kindNoul >= thresholds.kind) {
        return {
            outcome: 'refused',
            refusal: { ...at, kind: score.kind, reason: REASONS[score.kind] },
            score,
            rule: 'nouls',
        };
    }

    return score.stale >= T_LOW
        ? { outcome: 'warned', warning: { ...at, kind: score.kind, noul: score.stale }, score }
        : { outcome: 'passed' };
};

/** The fields of `next` whose text differs from `stored`'s, which an edit
 *  checks. A field cleared to null has nothing to check and is left out. */
export const changedText = (stored: EvergreenText, next: EvergreenText): EvergreenText =>
    Object.fromEntries(
        EVERGREEN_FIELDS.flatMap((field) =>
            next[field] && next[field] !== stored[field] ? [[field, next[field]]] : [],
        ),
    );
