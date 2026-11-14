/**
 * Checking a pasted sheet against the graph: sending its rows to the check
 * route in chunks, a plain line per finding with the closest value-list
 * members to a wrong value, where each finding sits in the pasted table, the
 * result sentence, the findings as CSV rows, and an example sheet built from
 * a dataset pattern.
 */
import { plural } from './counts.ts';
import {
    bounded,
    GraphFailure,
    requestGraph,
    type FailureReason,
    type RequestOptions,
    type WaitCause,
} from './load.ts';
import { KIND_WORDS, openLiterals, type Model } from './model.ts';
import { camelCase, findingColumn, sheetRow, type Mapping } from './pasted.ts';
import type { SentencePart } from './sentence.ts';
import {
    CHECK_DEADLINE_MS,
    CHECK_MAX_ROWS,
    isCheckField,
    isFindingCode,
    readCheckResponse,
    type CheckField,
    type FindingCode,
    type FindingValue,
    type SchemaCheckRequest,
    type SchemaCheckResponse,
    type SchemaCheckRow,
    type SchemaFinding,
} from './wire.ts';

/** The route the check posts to. */
export const CHECK_URL = '/api/graph/schema/check';

/**
 * How long one check request may take: the Graph API's deadline, then time
 * for its 503 or 504 to come back through the site's proxy, so the reader
 * sees why it stopped and a 503's `Retry-After` is honoured.
 */
export const CHECK_REQUEST_TIMEOUT_MS = CHECK_DEADLINE_MS + 10_000;

/** How long a whole check may take, waits for a build included. */
export const CHECK_LIMIT_MS = 5 * 60_000;

/**
 * Why a check stopped: a request failure, an answer whose rows checked or
 * findings do not fit the rows sent, or a refusal naming no row that was sent.
 */
export type CheckFailureReason = FailureReason | 'rows_checked' | 'pointer';

/** A check that could not finish. `message` says why, and `reason` says so for code. */
export class CheckError extends GraphFailure<CheckFailureReason> {
    override name = 'CheckError';
}

/** A finding and the index, in the rows given to `checkRows`, of the row it is about. */
export type RowFinding = { readonly index: number; readonly finding: SchemaFinding };

/** A row the route refused, by its index in the rows given to `checkRows`, with the problem's detail. */
export type RefusedRow = { readonly index: number; readonly detail: string };

export type CheckResult = {
    /** The graph generations the answers named, each once, in the order first seen. */
    readonly generations: readonly string[];
    /** The rows the route checked. */
    readonly rowCount: number;
    readonly findings: readonly RowFinding[];
    readonly refused: readonly RefusedRow[];
};

export type CheckProgress = { readonly checked: number; readonly total: number };

export type CheckOptions = {
    readonly signal?: AbortSignal;
    /** Called after each answer and once before the first request. */
    readonly onProgress?: (progress: CheckProgress) => void;
    /** Called before each wait, with what the wait is for. */
    readonly onWait?: (retryInMs: number, cause: WaitCause) => void;
    /** The bound on one request. CHECK_REQUEST_TIMEOUT_MS by default. */
    readonly requestTimeoutMs?: number;
    /** The bound on the whole check. CHECK_LIMIT_MS by default. */
    readonly limitMs?: number;
    readonly fetch?: typeof fetch;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly now?: () => number;
};

type Answer =
    | { readonly kind: 'checked'; readonly body: SchemaCheckResponse }
    | { readonly kind: 'refused'; readonly row: number; readonly detail: string };

/** The row a refusal's pointer names: `/rows/<i>` or a member under it. */
const ROW_POINTER = /^\/rows\/(\d+)(?:\/|$)/;

/**
 * Why `body` does not fit a request of `sent` rows, or null when it does.
 * An answer checking no row would never finish the check, and one checking
 * more rows than sent, or with a finding past the rows checked, names rows
 * that cannot be placed.
 */
const misfit = (body: SchemaCheckResponse, sent: number): string | null => {
    const count = body.rows_checked;
    if (count < 1 || count > sent) return `it checked ${count} of ${sent} rows sent`;
    const stray = body.findings.find((finding) => finding.row >= count);
    return stray === undefined ? null : `a finding names row ${stray.row} of ${count} checked`;
};

/**
 * Checks `rows` in order, each request carrying up to CHECK_MAX_ROWS of
 * them through `requestGraph`. A 200 checks the first `rows_checked` rows
 * sent: its findings are kept against the rows they name, and the next
 * request starts at the first row it left. A 200 that checks no row, more
 * rows than sent, or names a finding past the rows checked stops the check.
 * A 400 whose pointer names one row refuses that row with the problem's
 * detail, and the check carries on without it. Any other 400 stops the
 * check. A 503 or 429 with `Retry-After` waits and asks again, for up to a
 * minute per request, unless the problem says `retryable: false`. A request past `requestTimeoutMs`, its
 * 400 body included, or a check past `limitMs`, stops with reason
 * `timeout`. Anything else stops the check with a CheckError. An abort
 * rejects with the signal's reason, and no progress is reported after it.
 */
export async function checkRows(
    rows: readonly SchemaCheckRow[],
    options: CheckOptions = {},
): Promise<CheckResult> {
    const { signal, onProgress } = options;
    const bounds = bounded(signal, {
        limitMs: options.limitMs ?? CHECK_LIMIT_MS,
        requestMs: options.requestTimeoutMs ?? CHECK_REQUEST_TIMEOUT_MS,
    });
    const requestOptions: RequestOptions = {
        ...options,
        bounds,
        words: {
            stopped: 'The check stopped',
            unsent: 'The check could not be sent',
            answered: 'The check answered',
        },
        fail: (message, details) => new CheckError(message, details),
    };

    const send = (chunk: readonly SchemaCheckRow[]): Promise<Answer> =>
        requestGraph<Answer>(
            {
                url: CHECK_URL,
                init: {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', accept: 'application/json' },
                    body: JSON.stringify({ rows: chunk } satisfies SchemaCheckRequest),
                },
                read: (body) => ({ kind: 'checked', body: readCheckResponse(body) }),
                refusal: (status, { text, pointer }) => {
                    const named = status === 400 ? ROW_POINTER.exec(pointer ?? '') : null;
                    if (named === null) return null;
                    return {
                        kind: 'refused',
                        row: Number(named[1]),
                        detail: text ?? 'The Graph API refused the row.',
                    };
                },
            },
            requestOptions,
        );

    const findings: RowFinding[] = [];
    const refused: RefusedRow[] = [];
    const skipped = new Set<number>();
    const generations = new Set<string>();
    let rowCount = 0;
    // Every row before `start` is checked or refused.
    let start = 0;

    onProgress?.({ checked: 0, total: rows.length });
    while (start < rows.length) {
        // The indices of the rows this request sends: the next unrefused ones.
        const sent: number[] = [];
        for (let at = start; at < rows.length && sent.length < CHECK_MAX_ROWS; at += 1) {
            if (!skipped.has(at)) sent.push(at);
        }
        if (sent.length === 0) break;
        const answer = await send(sent.map((at) => rows[at]!));
        if (signal?.aborted) throw signal.reason;

        if (answer.kind === 'refused') {
            const index = sent[answer.row];
            if (index === undefined) {
                throw new CheckError(
                    `The check stopped: the Graph API refused row ${answer.row} of ${sent.length} sent.`,
                    { reason: 'pointer', status: 400, detail: answer.detail },
                );
            }
            refused.push({ index, detail: answer.detail });
            skipped.add(index);
        } else {
            const { body } = answer;
            const why = misfit(body, sent.length);
            if (why !== null) {
                throw new CheckError(`The check stopped: the Graph API answered, but ${why}.`, {
                    reason: 'rows_checked',
                    detail: why,
                });
            }
            for (const finding of body.findings) {
                findings.push({ index: sent[finding.row]!, finding });
            }
            if (body.generation !== null) generations.add(body.generation);
            rowCount += body.rows_checked;
            start = sent[body.rows_checked - 1]! + 1;
        }
        while (skipped.has(start)) start += 1;
        onProgress?.({ checked: rowCount + refused.length, total: rows.length });
    }
    return { generations: [...generations], rowCount, findings, refused };
}

/** A message part: text, a term the model holds, or a value shown as typed. */
export type MessagePart = SentencePart | { readonly kind: 'value'; readonly text: string };

/** How each row field is named in a message. */
const FIELD_NAMES: Readonly<Record<CheckField, string>> = {
    dcid: 'dcid',
    population_type: 'population type',
    measured_property: 'measured property',
    stat_type: 'stat type',
    measurement_qualifier: 'measurement qualifier',
    measurement_denominator: 'measurement denominator',
    constraint_properties: 'constraint properties',
    observation_properties: 'observation properties',
};

/** How a finding's field is named in a message: a field this page does not know reads as sent. */
const fieldWords = (field: string): string => (isCheckField(field) ? FIELD_NAMES[field] : field);

/** A finding's severity as the page shows it. A severity this page does not know reads as a warning. */
export const severityOf = (finding: SchemaFinding): 'error' | 'warning' =>
    finding.severity === 'error' ? 'error' : 'warning';

/** A finding's value as typed in the sheet. A list joins with commas. */
export const valueText = (value: FindingValue): string => {
    if (Array.isArray(value)) return value.join(', ');
    return value === null ? '' : String(value);
};

type MessageContext = {
    readonly model: Model;
    readonly finding: SchemaFinding;
    readonly value: string;
    readonly text: (text: string) => MessagePart;
    /** A term link when the model holds the id, else the id as typed. */
    readonly term: (id: string) => MessagePart;
    /** The range classes whose lists the finding's property takes values from. Empty when none. */
    readonly valueLists: readonly string[];
};

const shown = (text: string): MessagePart => ({ kind: 'value', text });

/** "(it is a value list)" when the model knows what the id is. */
const kindAside = ({ model, value, text }: MessageContext): MessagePart[] => {
    const kind = model.kind(value);
    return kind === undefined ? [] : [text(` (it is a ${KIND_WORDS[kind].toLowerCase()})`)];
};

/** Term links to `ids` joined as "A, B or C", with `last` before the final one. */
const termList = (
    { text, term }: MessageContext,
    ids: readonly string[],
    last: string,
): MessagePart[] =>
    ids.flatMap((id, at) => [
        ...(at === 0 ? [] : [text(at === ids.length - 1 ? ` ${last} ` : ', ')]),
        term(id),
    ]);

const chooseFrom = (context: MessageContext, fallback: string): MessagePart[] =>
    context.valueLists.length === 0
        ? [context.text(fallback)]
        : [
              context.text('Choose a value from '),
              ...termList(context, context.valueLists, 'or'),
              context.text('.'),
          ];

const fieldName = ({ finding }: MessageContext): string =>
    finding.property ?? fieldWords(finding.field);

/** One line per code, saying what is wrong and then what to do. */
const MESSAGES: Readonly<Record<FindingCode, (context: MessageContext) => MessagePart[]>> = {
    node_not_held: (context) => {
        const { finding, value, text } = context;
        if (finding.subject === 'property') {
            return [
                text('The graph has no property '),
                shown(value),
                text('. Check the spelling, or set the column to Ignored.'),
            ];
        }
        if (finding.property !== null) {
            return [
                text('The graph has no value '),
                shown(value),
                text('. Check the spelling. '),
                ...chooseFrom(context, ''),
            ];
        }
        return [
            text('The graph has no node '),
            shown(value),
            text(`. Check the spelling of the ${fieldName(context)}.`),
        ];
    },
    node_untyped: (context) => [
        context.term(context.value),
        context.text(' is on the graph with no type, so nothing says what kind of value it is. '),
        ...chooseFrom(context, 'Choose a value the model declares.'),
    ],
    node_provisional: (context) => [
        context.term(context.value),
        context.text(' is only a provisional node on the graph. '),
        ...chooseFrom(context, 'Choose a value the model declares.'),
    ],
    value_missing: ({ finding, term, text }) =>
        finding.property === null
            ? [
                  text(
                      `This row has no ${fieldWords(finding.field)}, and every row needs one. Fill the cell, or add a ${camelCase(finding.field)} column if the sheet has none.`,
                  ),
              ]
            : [
                  term(finding.property),
                  text(' has no value. Fill the cell, or set the column to Ignored.'),
              ],
    not_a_property: (context) => [
        context.term(context.value),
        context.text(' is not a property'),
        ...kindAside(context),
        context.text('. Use a property in this column, or set the column to Ignored.'),
    ],
    not_a_class: (context) => [
        context.term(context.value),
        context.text(' is not a kind of thing'),
        ...kindAside(context),
        context.text('. The population type must be a kind of thing.'),
    ],
    value_outside_range: (context) => {
        const { finding, value, valueLists, text, term } = context;
        if (valueLists.length > 0) {
            return [
                shown(value),
                text(
                    valueLists.length === 1
                        ? ' is not in the value list '
                        : ' is not in the value lists ',
                ),
                ...termList(context, valueLists, 'and'),
                text('.'),
            ];
        }
        return finding.property === null
            ? [shown(value), text(` is not a value the ${fieldName(context)} allows.`)]
            : [shown(value), text(' is not a value '), term(finding.property), text(' allows.')];
    },
    property_outside_domain: (context) => [
        context.term(context.finding.property ?? context.value),
        context.text(
            ' is declared for other kinds of thing than the row’s population type. Check the population type, or use a property declared for it.',
        ),
    ],
    definition_differs: (context) => [
        context.text(
            `The graph holds a StatVar with this dcid and a different ${fieldName(context)}: `,
        ),
        shown(valueText(context.finding.served) || 'none'),
        context.text('. Match the graph’s definition, or give the row a new dcid.'),
    ],
    not_a_node: (context) => [
        shown(context.value),
        context.text(
            ` is not an id, and the ${fieldName(context)} takes a node on the graph by its dcid. Write the dcid in place of the text or number.`,
        ),
    ],
    origin_not_served: (context) => [
        shown(context.value),
        context.text(
            ' comes from a source this deployment of the graph does not serve. Use a term from a source it serves.',
        ),
    ],
};

/** The message for a finding whose code this page has no message for. It names the value and the code as sent. */
const unknownMessage = ({ finding, value, text }: MessageContext): MessagePart[] => [
    ...(value === ''
        ? [text('The check flagged this cell')]
        : [text('The check flagged '), shown(value)]),
    text(' with the code '),
    shown(finding.code),
    text(', which this page has no message for.'),
];

/** What a finding says is wrong and what to do, as parts a screen can link. */
export function findingMessage(model: Model, finding: SchemaFinding): MessagePart[] {
    const held = (id: string) => model.node(id) !== undefined || model.dataset(id) !== undefined;
    const context: MessageContext = {
        model,
        finding,
        value: valueText(finding.value),
        text: (text) => ({ kind: 'text', text }),
        term: (id) =>
            held(id) ? { kind: 'term', id, label: model.label(id) } : { kind: 'value', text: id },
        valueLists:
            (finding.property === null ? undefined : model.valueListOfProperty(finding.property))
                ?.lists ?? [],
    };
    const message = isFindingCode(finding.code) ? MESSAGES[finding.code] : unknownMessage;
    return message(context).filter((part) => part.kind !== 'text' || part.text);
}

/** Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
    return editDistanceWithin(a, b, Math.max(a.length, b.length));
}

/** Two rows of the distance table, reused by every count and grown when a string is longer. */
let scratch = { previous: new Int32Array(64), row: new Int32Array(64) };

/**
 * Levenshtein distance between two strings when it is at most `bound`, else
 * `bound + 1`. Only the cells within `bound` of the diagonal are worked out,
 * and a row whose every cell passes `bound` ends the count.
 */
export function editDistanceWithin(a: string, b: string, bound: number): number {
    const over = bound + 1;
    if (Math.abs(a.length - b.length) > bound) return over;
    if (scratch.row.length <= b.length) {
        scratch = { previous: new Int32Array(b.length + 1), row: new Int32Array(b.length + 1) };
    }
    let { previous, row } = scratch;
    for (let j = 0; j <= b.length; j += 1) previous[j] = j < over ? j : over;
    for (let i = 1; i <= a.length; i += 1) {
        const from = Math.max(1, i - bound);
        const to = Math.min(b.length, i + bound);
        // The cells either side of the band read as past the bound.
        row[from - 1] = from === 1 ? (i < over ? i : over) : over;
        if (to < b.length) row[to + 1] = over;
        let least = row[from - 1]!;
        const char = a.charCodeAt(i - 1);
        for (let j = from; j <= to; j += 1) {
            let cell = previous[j - 1]! + (char === b.charCodeAt(j - 1) ? 0 : 1);
            if (previous[j]! + 1 < cell) cell = previous[j]! + 1;
            if (row[j - 1]! + 1 < cell) cell = row[j - 1]! + 1;
            if (cell > over) cell = over;
            row[j] = cell;
            if (cell < least) least = cell;
        }
        if (least > bound) return over;
        [previous, row] = [row, previous];
    }
    return previous[b.length]! < over ? previous[b.length]! : over;
}

/** The codes whose value a closer member of the property's value list may replace. */
const SUGGESTED: ReadonlySet<string> = new Set<FindingCode>([
    'node_not_held',
    'value_outside_range',
]);

/** Each property's value-list members with their names in lower case, worked out once per model. */
const memberNames = new WeakMap<
    Model,
    Map<string, readonly (readonly [string, readonly string[]])[]>
>();

const namesOf = (
    model: Model,
    property: string,
    members: readonly string[],
): readonly (readonly [string, readonly string[]])[] => {
    let properties = memberNames.get(model);
    if (properties === undefined) {
        properties = new Map();
        memberNames.set(model, properties);
    }
    let named = properties.get(property);
    if (named === undefined) {
        named = members.map((id) => {
            const node = model.node(id);
            const names = [
                id,
                model.label(id),
                ...(node?.classification_code ?? []),
                ...openLiterals(node),
            ];
            return [id, names.map((name) => name.toLowerCase())] as const;
        });
        properties.set(property, named);
    }
    return named;
};

/**
 * Up to `limit` members of the constraint property's value list closest to
 * the finding's value by edit distance to the member's label, dcid, code or
 * open property literal, ignoring case. A tie keeps the list's order. Empty
 * for other findings.
 */
export function closestMembers(model: Model, finding: SchemaFinding, limit = 3): string[] {
    const { property } = finding;
    if (!SUGGESTED.has(finding.code) || property === null || finding.subject !== 'value') return [];
    if (typeof finding.value !== 'string') return [];
    const values = model.valueListOfProperty(property);
    if (values === undefined) return [];

    // The closest `limit` so far, in list order among ties. A member is measured only as far as
    // it could still beat the farthest of them, so most members stop after a few cells.
    const typed = finding.value.toLowerCase();
    const best: { id: string; score: number }[] = [];
    for (const [id, names] of namesOf(model, property, values.members)) {
        if (id === finding.value) continue;
        const full = best.length >= limit;
        let bound = full ? (best.at(-1)?.score ?? 0) - 1 : Infinity;
        if (bound < 0) break;
        let score = Infinity;
        for (const lower of names) {
            const cap = Math.min(bound, Math.max(typed.length, lower.length));
            const distance = editDistanceWithin(typed, lower, cap);
            if (distance <= cap) {
                score = Math.min(score, distance);
                bound = Math.min(bound, distance - 1);
            }
        }
        if (score === Infinity) continue;
        const at = best.findIndex((entry) => entry.score > score);
        best.splice(at === -1 ? best.length : at, 0, { id, score });
        if (best.length > limit) best.pop();
    }
    return best.map(({ id }) => id);
}

/** Where a finding sits in the pasted table. */
export type FindingPlace = {
    /** The sheet row, or null when the finding's row is not among `sheetRows`. */
    readonly row: number | null;
    /** The column index, or null when the finding's field maps to no column. */
    readonly column: number | null;
    /** The column's header, else the finding's property or field. */
    readonly columnLabel: string;
};

/**
 * The row and column a finding belongs to, read through the mapping it was
 * checked with. `sheetRows` holds the sheet row of each checked row.
 */
export function findingPlace(
    mapping: Mapping,
    sheetRows: readonly number[],
    { index, finding }: RowFinding,
): FindingPlace {
    const column = findingColumn(mapping, finding);
    return {
        row: sheetRows[index] ?? null,
        column,
        columnLabel:
            (column === null ? undefined : mapping[column]?.header) ??
            finding.property ??
            finding.field,
    };
}

/** One finding as the result shows it: its place and its message. */
export type FindingLine = FindingPlace & {
    readonly finding: SchemaFinding;
    readonly parts: readonly MessagePart[];
};

/** Each finding's place and message, worked out once. */
export function findingLines(
    model: Model,
    mapping: Mapping,
    sheetRows: readonly number[],
    findings: readonly RowFinding[],
): FindingLine[] {
    return findings.map((found) => ({
        ...findingPlace(mapping, sheetRows, found),
        finding: found.finding,
        parts: findingMessage(model, found.finding),
    }));
}

/**
 * closestMembers with a memory: each property and value pair is worked out
 * once, and a sheet of repeated source codes shares it across findings.
 * The result asks only for the lines on screen, so a step's cost follows the
 * step and the value list, whatever the sheet's size.
 */
export function closestLookup(model: Model): (finding: SchemaFinding) => readonly string[] {
    const closest = new Map<string, readonly string[]>();
    return (finding) => {
        if (!SUGGESTED.has(finding.code)) return [];
        const key = JSON.stringify([finding.property, finding.subject, finding.value]);
        let members = closest.get(key);
        if (members === undefined) {
            members = closestMembers(model, finding);
            closest.set(key, members);
        }
        return members;
    };
}

/** The key of one cell of the pasted table. */
export const cellKey = (row: number, column: number): string => `${row}:${column}`;

export type SheetMarks = {
    /** By cell key: `error` when any finding on the cell is an error, else `warning`. */
    readonly cells: ReadonlyMap<string, 'error' | 'warning'>;
    /** The sheet rows with a finding or a refusal. */
    readonly flaggedRows: ReadonlySet<number>;
};

/** The marks on the pasted table: each flagged cell and each flagged row. */
export function sheetMarks(
    lines: readonly FindingLine[],
    refused: readonly RefusedRow[],
    sheetRows: readonly number[],
): SheetMarks {
    const cells = new Map<string, 'error' | 'warning'>();
    const flaggedRows = new Set<number>();
    for (const { finding, row, column } of lines) {
        if (row === null) continue;
        flaggedRows.add(row);
        if (column === null) continue;
        const key = cellKey(row, column);
        if (cells.get(key) !== 'error') cells.set(key, severityOf(finding));
    }
    for (const { index } of refused) {
        const row = sheetRows[index];
        if (row !== undefined) flaggedRows.add(row);
    }
    return { cells, flaggedRows };
}

/** How many rows without a finding each "show more" adds to the result table. */
export const QUIET_ROWS_STEP = 100;

/**
 * How many flagged rows the result table shows at first, and each "show
 * more" adds. The findings list steps by the same count.
 */
export const FLAGGED_ROWS_STEP = 300;

/** One row of the result table: its place in the pasted rows and its sheet row number. */
export type ShownRow = { readonly dataIndex: number; readonly row: number };

/** How many flagged rows, and how many rows without a finding, the table shows. */
export type ShownCounts = { readonly flagged: number; readonly quiet: number };

/**
 * The rows the result table shows, in sheet order. They are the first
 * `shown.flagged` flagged rows and the first `shown.quiet` rows without a
 * finding.
 * `hiddenFlagged` and `hiddenQuiet` count the rows of each kind left out.
 */
export function shownRows(
    dataRows: number,
    flaggedRows: ReadonlySet<number>,
    shown: ShownCounts,
): {
    readonly rows: readonly ShownRow[];
    readonly hiddenFlagged: number;
    readonly hiddenQuiet: number;
} {
    const rows: ShownRow[] = [];
    let flagged = 0;
    let quiet = 0;
    for (let dataIndex = 0; dataIndex < dataRows; dataIndex += 1) {
        const row = sheetRow(dataIndex);
        const take = flaggedRows.has(row) ? flagged++ < shown.flagged : quiet++ < shown.quiet;
        if (take) rows.push({ dataIndex, row });
    }
    return {
        rows,
        hiddenFlagged: Math.max(0, flagged - shown.flagged),
        hiddenQuiet: Math.max(0, quiet - shown.quiet),
    };
}

/**
 * How many flagged rows the table must show for `row` to be among them. It
 * is a whole number of FLAGGED_ROWS_STEP steps and at least `shown`.
 */
export function flaggedShownFor(
    flaggedRows: ReadonlySet<number>,
    row: number,
    shown: number,
): number {
    let rank = 0;
    for (const flagged of flaggedRows) if (flagged < row) rank += 1;
    return Math.max(shown, Math.ceil((rank + 1) / FLAGGED_ROWS_STEP) * FLAGGED_ROWS_STEP);
}

/** The counts a result sentence reads. A refused row counts as an error. */
export const resultCounts = (
    result: Pick<CheckResult, 'findings' | 'refused'>,
): { readonly errors: number; readonly warnings: number } => ({
    errors:
        result.findings.filter(({ finding }) => severityOf(finding) === 'error').length +
        result.refused.length,
    warnings: result.findings.filter(({ finding }) => severityOf(finding) === 'warning').length,
});

const listed = (items: readonly string[]): string =>
    items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** How many of the checked rows carry a finding or were refused. */
export const flaggedRowCount = (result: Pick<CheckResult, 'findings' | 'refused'>): number =>
    new Set([...result.findings, ...result.refused].map(({ index }) => index)).size;

/**
 * "3 errors and 1 warning in 2 of 6 rows, checked against the graph at
 * generation X." The rows are those with a finding, out of `rows`: "in all
 * 6 rows" when every row has one, "in 1 row" for a sheet of one row, and
 * "No problems in 6 rows." for a clean check. Without a generation the
 * sentence ends at the rows. With several it names each and says the graph
 * changed during the check.
 */
export function resultSentence(result: CheckResult, rows: number): string {
    const { errors, warnings } = resultCounts(result);
    const flagged = flaggedRowCount(result);
    const { generations } = result;
    const against =
        generations.length === 0
            ? ''
            : generations.length === 1
              ? `, checked against the graph at generation ${generations[0]}`
              : `, checked against graph generations ${listed(generations)}. The graph changed during the check`;
    const problems = [
        ...(errors > 0 ? [plural(errors, 'error')] : []),
        ...(warnings > 0 ? [plural(warnings, 'warning')] : []),
    ];
    const where =
        problems.length === 0 || rows === 1
            ? plural(rows, 'row')
            : flagged >= rows
              ? `all ${plural(rows, 'row')}`
              : `${flagged.toLocaleString('en-GB')} of ${plural(rows, 'row')}`;
    const lead = problems.length === 0 ? 'No problems' : problems.join(' and ');
    return `${lead} in ${where}${against}.`;
}

/** A message as one line of text. Terms appear as their dcids. */
export const messageText = (parts: readonly MessagePart[]): string =>
    parts
        .map((part) => (part.kind === 'term' ? part.id : part.text))
        .join('')
        .trim();

/** The findings as CSV rows under a header: row, column, value, code, message. */
export function findingsCsvRows(
    lines: readonly FindingLine[],
    refused: readonly RefusedRow[],
    sheetRows: readonly number[],
): string[][] {
    return [
        ['row', 'column', 'value', 'code', 'message'],
        ...lines.map(({ finding, row, columnLabel, parts }) => [
            String(row ?? ''),
            columnLabel,
            valueText(finding.value),
            finding.code,
            messageText(parts),
        ]),
        ...refused.map(({ index, detail }) => [
            String(sheetRows[index] ?? ''),
            '',
            '',
            'request_invalid',
            detail,
        ]),
    ];
}

/** Swaps the first pair of differing adjacent lower-case letters past the middle. */
const misspell = (value: string): string | null => {
    for (let i = Math.floor(value.length / 2); i < value.length - 1; i += 1) {
        const [a, b] = [value.charAt(i), value.charAt(i + 1)];
        if (a !== b && /[a-z]/.test(a) && /[a-z]/.test(b)) {
            return value.slice(0, i) + b + a + value.slice(i + 2);
        }
    }
    return null;
};

/** What the example sheet is and where it came from. */
export type ExampleSheet = {
    /** The range as tab-separated text, header first, as a spreadsheet copies it. */
    readonly text: string;
    /** The dataset whose pattern the rows follow. */
    readonly dataset: string;
    /** The column whose value is misspelt on one row. */
    readonly misspelt: string;
};

/**
 * A small sheet from the first dataset pattern whose constraint properties
 * all have values in use. It holds the definition fields as the pattern
 * names them, and each property cycles through the values the dataset uses.
 * One row carries a misspelt value on a property with a value list. Null when no
 * pattern qualifies.
 */
export function exampleSheet(model: Model, count = 5): ExampleSheet | null {
    for (const dataset of model.datasets) {
        const used = new Map(
            dataset.constraint_values.map((entry) => [
                entry.property,
                entry.values.map(({ value }) => value),
            ]),
        );
        for (const pattern of dataset.patterns) {
            const properties = pattern.constraint_properties;
            if (properties.length === 0) continue;
            if (!properties.every((id) => (used.get(id)?.length ?? 0) > 0)) continue;

            const definition = [
                ['populationType', pattern.population_type],
                ['measuredProperty', pattern.measured_property],
                ['statType', pattern.stat_type],
                ['measurementQualifier', pattern.measurement_qualifier],
            ].filter((entry): entry is [string, string] => entry[1] !== null);
            const rows = Array.from({ length: count }, (_, row) => [
                `EX-${row + 1}`,
                `Example row ${row + 1}`,
                ...definition.map(([, value]) => value),
                ...properties.map((id) => {
                    const values = used.get(id) ?? [];
                    return values[row % values.length] ?? '';
                }),
            ]);

            const typoCells = rows[Math.min(2, count - 1)] ?? [];
            const firstProperty = 2 + definition.length;
            const typo = properties
                .map((id, at) => ({
                    id,
                    column: firstProperty + at,
                    spelt: misspell(typoCells[firstProperty + at] ?? ''),
                }))
                .find(
                    ({ id, spelt }) =>
                        spelt !== null &&
                        model.valueListOfProperty(id) !== undefined &&
                        model.node(spelt) === undefined,
                );
            if (typo === undefined || typo.spelt === null) continue;
            typoCells[typo.column] = typo.spelt;

            const header = [
                'source_code',
                'source_label',
                ...definition.map(([field]) => field),
                ...properties,
            ];
            return {
                text: [header, ...rows].map((cells) => cells.join('\t')).join('\n'),
                dataset: dataset.ref,
                misspelt: typo.id,
            };
        }
    }
    return null;
}
