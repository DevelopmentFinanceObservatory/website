/**
 * Checking a pasted sheet against the graph: sending its rows to the check
 * route in chunks, a plain line per finding with the closest value-list
 * members to a wrong value, where each finding sits in the pasted table, the
 * result sentence, the findings as CSV rows, and an example sheet built from
 * a dataset pattern.
 */
import {
    bounded,
    GraphFailure,
    REQUEST_TIMEOUT_MS,
    requestGraph,
    type FailureReason,
    type RequestOptions,
    type WaitCause,
} from './load.ts';
import { KIND_WORDS, type Model } from './model.ts';
import { locateFinding, sheetRow, type Mapping } from './pasted.ts';
import type { SentencePart } from './sentence.ts';
import {
    CHECK_MAX_ROWS,
    findingProperty,
    isFindingCode,
    readCheckResponse,
    type FindingCode,
    type OntologyCheckRow,
    type OntologyFinding,
} from './wire.ts';

/** The route the check posts to. */
export const CHECK_URL = '/api/graph/ontology/check';

/**
 * The rows the first request carries, and the most any request carries. A
 * chunk the route refuses is halved until the refused row stands alone, and
 * the smaller size carries on to the chunks that follow; each new chunk the
 * route answers doubles the size again, up to this one. The halves of a
 * split chunk leave the size alone when answered, so a paste the route can
 * take only in small chunks does not climb back to a refused size after
 * every pair of halves.
 */
export const CHECK_CHUNK_ROWS = 500;

/** How long a whole check may take, waits for a build included. */
export const CHECK_LIMIT_MS = 5 * 60_000;

/** Why a check stopped: a request failure, or an answer covering other rows than were sent. */
export type CheckFailureReason = FailureReason | 'row_count';

/** A check that could not finish; `message` says why, `reason` says so for code. */
export class CheckError extends GraphFailure<CheckFailureReason> {
    override name = 'CheckError';
}

/** A single row the route refused, with the problem's detail. */
export type RefusedRow = { readonly ref: string | null; readonly detail: string };

export type CheckResult = {
    /** The graph generations the answers named, each once, in the order first seen. */
    readonly generations: readonly string[];
    /** The rows the route checked. */
    readonly rowCount: number;
    readonly findings: readonly OntologyFinding[];
    readonly refused: readonly RefusedRow[];
};

export type CheckProgress = { readonly checked: number; readonly total: number };

export type CheckOptions = {
    readonly signal?: AbortSignal;
    /** Called after each answered chunk and once before the first request. */
    readonly onProgress?: (progress: CheckProgress) => void;
    /** Called before each wait, with what the wait is for. */
    readonly onWait?: (retryInMs: number, cause: WaitCause) => void;
    readonly chunkRows?: number;
    /** The bound on one request; REQUEST_TIMEOUT_MS by default. */
    readonly requestTimeoutMs?: number;
    /** The bound on the whole check; CHECK_LIMIT_MS by default. */
    readonly limitMs?: number;
    readonly fetch?: typeof fetch;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly now?: () => number;
};

type Answer =
    | { readonly kind: 'checked'; readonly body: ReturnType<typeof readCheckResponse> }
    | { readonly kind: 'refused'; readonly detail: string };

/**
 * Checks `rows` in chunks, each sent through `requestGraph`. A 200 adds its
 * findings, and on a new chunk (one that is not the half of a split)
 * doubles the chunk size, up to `chunkRows`; one whose `row_count` is not
 * the rows sent stops the check. A 400 on a chunk of more than one row
 * splits it in two halves, checked in turn, and the half's size becomes the
 * chunk size for the rows after them; a 400 on one row refuses that row
 * with the problem's detail. A 503 or 429 with `Retry-After` waits and asks
 * again, for up to a minute per chunk. A request past `requestTimeoutMs`,
 * its 400 body included, or a check past `limitMs`, stops with reason
 * `timeout`. Anything else stops the check with a CheckError. An abort
 * rejects with the signal's reason, and no progress is reported after it.
 */
export async function checkRows(
    rows: readonly OntologyCheckRow[],
    options: CheckOptions = {},
): Promise<CheckResult> {
    const { signal, onProgress } = options;
    const largest = Math.max(1, Math.min(options.chunkRows ?? CHECK_CHUNK_ROWS, CHECK_MAX_ROWS));
    let size = largest;
    const bounds = bounded(signal, {
        limitMs: options.limitMs ?? CHECK_LIMIT_MS,
        requestMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
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

    const send = (chunk: readonly OntologyCheckRow[]): Promise<Answer> =>
        requestGraph<Answer>(
            {
                url: CHECK_URL,
                init: {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', accept: 'application/json' },
                    body: JSON.stringify({ rows: chunk }),
                },
                read: (body) => ({ kind: 'checked', body: readCheckResponse(body) }),
                refusal: (status, problem) =>
                    status === 400
                        ? { kind: 'refused', detail: problem ?? 'The Graph API refused the row.' }
                        : null,
            },
            requestOptions,
        );

    const findings: OntologyFinding[] = [];
    const refused: RefusedRow[] = [];
    const generations = new Set<string>();
    let rowCount = 0;
    let checked = 0;
    let next = 0;
    const halves: (readonly OntologyCheckRow[])[] = [];

    onProgress?.({ checked, total: rows.length });
    while (halves.length > 0 || next < rows.length) {
        const half = halves.shift();
        const chunk = half ?? rows.slice(next, (next += size));
        const answer = await send(chunk);
        if (signal?.aborted) throw signal.reason;
        if (answer.kind === 'refused' && chunk.length > 1) {
            const split = Math.ceil(chunk.length / 2);
            halves.unshift(chunk.slice(0, split), chunk.slice(split));
            size = Math.min(size, split);
            continue;
        }
        if (answer.kind === 'refused') {
            refused.push({ ref: chunk[0]?.ref ?? null, detail: answer.detail });
        } else {
            const { body } = answer;
            if (body.row_count !== chunk.length) {
                throw new CheckError(
                    `The check stopped: the Graph API answered for ${body.row_count} of ${chunk.length} rows sent.`,
                    { reason: 'row_count', detail: `${body.row_count} of ${chunk.length}` },
                );
            }
            findings.push(...body.findings);
            if (body.generation !== null) generations.add(body.generation);
            rowCount += body.row_count;
            if (half === undefined) size = Math.min(largest, size * 2);
        }
        checked += chunk.length;
        onProgress?.({ checked, total: rows.length });
    }
    return { generations: [...generations], rowCount, findings, refused };
}

/** A message part: text, a term the model holds, or a value shown as typed. */
export type MessagePart = SentencePart | { readonly kind: 'value'; readonly text: string };

/** How a definition field is named in a message. */
const FIELD_NAMES: Readonly<Record<string, string>> = {
    dcid: 'dcid',
    population_type: 'population type',
    measured_property: 'measured property',
    stat_type: 'stat type',
    measurement_qualifier: 'measurement qualifier',
    measurement_denominator: 'measurement denominator',
    observation_properties: 'observation properties',
};

/** The finding's value as typed in the sheet; a list joins with commas. */
export const valueText = (value: OntologyFinding['value']): string => {
    if (Array.isArray(value)) return value.join(', ');
    return value === null ? '' : String(value);
};

type MessageContext = {
    readonly model: Model;
    readonly finding: OntologyFinding;
    /** The constraint property, or null on a definition field. */
    readonly property: string | null;
    readonly value: string;
    readonly text: (text: string) => MessagePart;
    /** A term link when the model holds the id, else the id as typed. */
    readonly term: (id: string) => MessagePart;
    /** The value list behind the constraint property, when it has one. */
    readonly valueList: string | undefined;
};

const shown = (text: string): MessagePart => ({ kind: 'value', text });

/** "(it is a value list)" when the model knows what the id is. */
const kindAside = ({ model, value, text }: MessageContext): MessagePart[] => {
    const kind = model.kind(value);
    return kind === undefined ? [] : [text(` (it is a ${KIND_WORDS[kind].toLowerCase()})`)];
};

const chooseFrom = ({ valueList, text, term }: MessageContext, fallback: string): MessagePart[] =>
    valueList === undefined
        ? [text(fallback)]
        : [text('Choose a value from '), term(valueList), text('.')];

const fieldName = ({ finding, property }: MessageContext): string =>
    property ?? FIELD_NAMES[finding.field] ?? finding.field;

/** One line per code: what is wrong, then what to do. */
const MESSAGES: Readonly<Record<FindingCode, (context: MessageContext) => MessagePart[]>> = {
    node_not_held: (context) => {
        const { finding, property, value, text } = context;
        if (
            finding.field === 'observation_properties' ||
            (property !== null && value === property)
        ) {
            return [
                text('The graph has no property '),
                shown(value),
                text('. Check the spelling, or set the column to Ignored.'),
            ];
        }
        if (property !== null) {
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
    value_missing: (context) => [
        context.term(context.property ?? context.finding.field),
        context.text(' has no value. Fill the cell, or set the column to Ignored.'),
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
        const { property, value, valueList, text, term } = context;
        return valueList === undefined
            ? [
                  shown(value),
                  text(' is not a value '),
                  term(property ?? context.finding.field),
                  text(' allows.'),
              ]
            : [shown(value), text(' is not in the value list '), term(valueList), text('.')];
    },
    property_outside_domain: (context) => [
        context.term(context.property ?? context.value),
        context.text(
            ' is declared for other kinds of thing than the row’s population type. Check the population type, or use a property declared for it.',
        ),
    ],
    definition_differs: (context) => [
        context.text(
            `The graph holds a StatVar with this dcid and a different ${fieldName(context)}: `,
        ),
        shown(context.value || 'none'),
        context.text('. Match the graph’s definition, or give the row a new dcid.'),
    ],
};

/** A finding whose code this page has no message for: the value and the code as sent. */
const unknownMessage = ({ finding, value, text }: MessageContext): MessagePart[] => [
    ...(value === ''
        ? [text('The check flagged this cell')]
        : [text('The check flagged '), shown(value)]),
    text(' with the code '),
    shown(finding.code),
    text(', which this page has no message for.'),
];

/** What a finding says is wrong and what to do, as parts a screen can link. */
export function findingMessage(model: Model, finding: OntologyFinding): MessagePart[] {
    const property = findingProperty(finding);
    const held = (id: string) => model.node(id) !== undefined || model.dataset(id) !== undefined;
    const context: MessageContext = {
        model,
        finding,
        property,
        value: valueText(finding.value),
        text: (text) => ({ kind: 'text', text }),
        term: (id) =>
            held(id) ? { kind: 'term', id, label: model.label(id) } : { kind: 'value', text: id },
        valueList: property === null ? undefined : model.valueListOfProperty(property),
    };
    const message = isFindingCode(finding.code) ? MESSAGES[finding.code] : unknownMessage;
    return message(context).filter((part) => part.kind !== 'text' || part.text);
}

/** Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
        let diagonal = row[0] ?? 0;
        row[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const above = row[j] ?? 0;
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            row[j] = Math.min(above + 1, (row[j - 1] ?? 0) + 1, diagonal + cost);
            diagonal = above;
        }
    }
    return row[b.length] ?? 0;
}

/** The codes whose value a closer member of the property's value list may replace. */
const SUGGESTED: ReadonlySet<string> = new Set<FindingCode>([
    'node_not_held',
    'value_outside_range',
]);

/**
 * Up to `limit` members of the constraint property's value list closest to
 * the finding's value by edit distance to the member's label, dcid or code,
 * ignoring case; a tie keeps the list's order. Empty for other findings.
 */
export function closestMembers(model: Model, finding: OntologyFinding, limit = 3): string[] {
    const property = findingProperty(finding);
    if (!SUGGESTED.has(finding.code) || property === null) return [];
    if (typeof finding.value !== 'string' || finding.value === property) return [];
    const list = model.valueListOfProperty(property);
    if (list === undefined) return [];

    const typed = finding.value.toLowerCase();
    const distance = (id: string): number => {
        const names = [id, model.label(id), ...(model.node(id)?.classification_code ?? [])];
        return Math.min(...names.map((name) => editDistance(typed, name.toLowerCase())));
    };
    return model
        .members(list)
        .filter((id) => id !== finding.value)
        .map((id, order) => ({ id, order, score: distance(id) }))
        .sort((a, b) => a.score - b.score || a.order - b.order)
        .slice(0, limit)
        .map(({ id }) => id);
}

/** Where a finding sits in the pasted table. */
export type FindingPlace = {
    /** The sheet row, or null when the finding's `ref` is no row number. */
    readonly row: number | null;
    /** The column index, or null when the finding's field maps to no column. */
    readonly column: number | null;
    /** The column's header, else the finding's field. */
    readonly columnLabel: string;
};

/** The row and column a finding belongs to, read through the mapping it was checked with. */
export function findingPlace(mapping: Mapping, finding: OntologyFinding): FindingPlace {
    const at = locateFinding(mapping, finding);
    const column = at?.column ?? null;
    return {
        row: at?.row ?? null,
        column,
        columnLabel: (column === null ? undefined : mapping[column]?.header) ?? finding.field,
    };
}

/** One finding as the result shows it: its place, its message and the closest values. */
export type FindingLine = FindingPlace & {
    readonly finding: OntologyFinding;
    readonly parts: readonly MessagePart[];
    readonly closest: readonly string[];
};

/**
 * Each finding's place, message and closest values, worked out once. The
 * closest values are worked out once per field and value, which a sheet of
 * repeated source codes shares across many findings.
 */
export function findingLines(
    model: Model,
    mapping: Mapping,
    findings: readonly OntologyFinding[],
): FindingLine[] {
    const closest = new Map<string, string[]>();
    const closestTo = (finding: OntologyFinding): string[] => {
        if (!SUGGESTED.has(finding.code)) return [];
        const key = JSON.stringify([finding.field, finding.value]);
        let members = closest.get(key);
        if (members === undefined) {
            members = closestMembers(model, finding);
            closest.set(key, members);
        }
        return members;
    };
    return findings.map((finding) => ({
        ...findingPlace(mapping, finding),
        finding,
        parts: findingMessage(model, finding),
        closest: closestTo(finding),
    }));
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
): SheetMarks {
    const cells = new Map<string, 'error' | 'warning'>();
    const flaggedRows = new Set<number>();
    for (const { finding, row, column } of lines) {
        if (row === null) continue;
        flaggedRows.add(row);
        if (column === null) continue;
        const key = cellKey(row, column);
        if (cells.get(key) !== 'error') cells.set(key, finding.severity);
    }
    for (const { ref } of refused) {
        const row = Number(ref);
        if (ref !== null && Number.isInteger(row)) flaggedRows.add(row);
    }
    return { cells, flaggedRows };
}

/** How many rows without a finding each "show more" adds to the result table. */
export const QUIET_ROWS_STEP = 100;

/**
 * How many flagged rows the result table shows at first, and each "show
 * more" adds; the findings list steps by the same count.
 */
export const FLAGGED_ROWS_STEP = 300;

/** One row of the result table: its place in the pasted rows and its sheet row number. */
export type ShownRow = { readonly dataIndex: number; readonly row: number };

/** How many flagged rows, and how many rows without a finding, the table shows. */
export type ShownCounts = { readonly flagged: number; readonly quiet: number };

/**
 * The rows the result table shows, in sheet order: the first `shown.flagged`
 * flagged rows and the first `shown.quiet` rows without a finding.
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
 * How many flagged rows the table must show for `row` to be among them: a
 * whole number of FLAGGED_ROWS_STEP steps, never fewer than `shown`.
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

/** The counts a result sentence reads: a refused row counts as an error. */
export const resultCounts = (
    result: Pick<CheckResult, 'findings' | 'refused'>,
): { readonly errors: number; readonly warnings: number } => ({
    errors:
        result.findings.filter((finding) => finding.severity === 'error').length +
        result.refused.length,
    warnings: result.findings.filter((finding) => finding.severity === 'warning').length,
});

const counted = (n: number, one: string): string =>
    `${n.toLocaleString('en-GB')} ${n === 1 ? one : `${one}s`}`;

const listed = (items: readonly string[]): string =>
    items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * "3 errors and 1 warning in 6 rows, checked against the graph at
 * generation X." Without a generation the sentence ends at the rows; with
 * several it names each and says the graph changed during the check.
 */
export function resultSentence(result: CheckResult, rows: number): string {
    const { errors, warnings } = resultCounts(result);
    const { generations } = result;
    const against =
        generations.length === 0
            ? ''
            : generations.length === 1
              ? `, checked against the graph at generation ${generations[0]}`
              : `, checked against graph generations ${listed(generations)}: the graph changed during the check`;
    const problems = [
        ...(errors > 0 ? [counted(errors, 'error')] : []),
        ...(warnings > 0 ? [counted(warnings, 'warning')] : []),
    ];
    const lead = problems.length === 0 ? 'No problems' : problems.join(' and ');
    return `${lead} in ${counted(rows, 'row')}${against}.`;
}

/** A message as one line of text; terms appear as their dcids. */
export const messageText = (parts: readonly MessagePart[]): string =>
    parts
        .map((part) => (part.kind === 'term' ? part.id : part.text))
        .join('')
        .trim();

/** The findings as CSV rows under a header: row, column, value, code, message. */
export function findingsCsvRows(
    lines: readonly FindingLine[],
    refused: readonly RefusedRow[],
): string[][] {
    return [
        ['row', 'column', 'value', 'code', 'message'],
        ...lines.map(({ finding, columnLabel, parts }) => [
            finding.ref ?? '',
            columnLabel,
            valueText(finding.value),
            finding.code,
            messageText(parts),
        ]),
        ...refused.map((row) => [row.ref ?? '', '', '', 'request_invalid', row.detail]),
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
 * all have values in use: the definition fields as the pattern names them,
 * and each property cycling through the values the dataset uses. One row
 * carries a misspelt value on a property with a value list. Null when no
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
                dataset: dataset.dcid,
                misspelt: typo.id,
            };
        }
    }
    return null;
}
