/**
 * Checking a pasted sheet against the graph: sending its rows to the check
 * route in chunks, a plain line per finding with the closest value-list
 * members to a wrong value, the result sentence, the findings as CSV rows,
 * and an example sheet built from a dataset pattern.
 */
import { abortable, problemText, retryDelay } from './load.ts';
import type { Model } from './model.ts';
import { locateFinding, type Mapping } from './pasted.ts';
import type { SentencePart } from './sentence.ts';
import {
    CHECK_MAX_ROWS,
    readCheckResponse,
    WireShapeError,
    type FindingCode,
    type OntologyCheckRow,
    type OntologyFinding,
} from './wire.ts';

/** The route the check posts to. */
export const CHECK_URL = '/api/graph/ontology/check';

/**
 * The rows the first request carries. A chunk the route refuses is halved,
 * and later chunks keep the smaller size.
 */
export const CHECK_CHUNK_ROWS = 500;

/** A check that could not finish; `message` says why. */
export class CheckError extends Error {
    override name = 'CheckError';
}

/** A single row the route refused, with the problem's detail. */
export type RefusedRow = { readonly ref: string | null; readonly detail: string };

export type CheckResult = {
    /** The graph generation of the last answer; null when the route named none. */
    readonly generation: string | null;
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
    /** Called before each wait while the graph's model is being built. */
    readonly onWait?: (retryInMs: number) => void;
    readonly chunkRows?: number;
    readonly fetch?: typeof fetch;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly now?: () => number;
};

type Answer =
    | { readonly kind: 'checked'; readonly body: ReturnType<typeof readCheckResponse> }
    | { readonly kind: 'refused'; readonly detail: string };

/**
 * Checks `rows` in chunks. A 200 adds its findings. A 400 on a chunk of more
 * than one row splits it in two halves, checked in turn; a 400 on one row
 * refuses that row with the problem's detail. A 503 with `Retry-After` waits
 * and asks again, for up to a minute per chunk. Anything else stops the
 * check with a CheckError. An abort rejects with the signal's reason.
 */
export async function checkRows(
    rows: readonly OntologyCheckRow[],
    options: CheckOptions = {},
): Promise<CheckResult> {
    const {
        signal,
        onProgress,
        onWait,
        fetch: post = fetch,
        sleep = abortable,
        now = Date.now,
    } = options;
    let size = Math.max(1, Math.min(options.chunkRows ?? CHECK_CHUNK_ROWS, CHECK_MAX_ROWS));

    const send = async (chunk: readonly OntologyCheckRow[]): Promise<Answer> => {
        let firstWait: number | null = null;
        for (;;) {
            let response: Response;
            try {
                response = await post(CHECK_URL, {
                    method: 'POST',
                    signal,
                    headers: { 'content-type': 'application/json', accept: 'application/json' },
                    body: JSON.stringify({ rows: chunk }),
                });
            } catch (error) {
                if (signal?.aborted) throw error;
                throw new CheckError('The check could not be sent: the Graph API did not answer.', {
                    cause: error,
                });
            }

            if (response.ok) {
                try {
                    return { kind: 'checked', body: readCheckResponse(await response.json()) };
                } catch (error) {
                    if (signal?.aborted) throw error;
                    const why =
                        error instanceof WireShapeError
                            ? `a shape this page does not read: ${error.message}`
                            : 'a body that is not JSON';
                    throw new CheckError(`The check answered with ${why}.`, { cause: error });
                }
            }

            if (response.status === 400) {
                const detail = await problemText(response);
                return { kind: 'refused', detail: detail ?? 'The Graph API refused the row.' };
            }

            const at = now();
            firstWait ??= at;
            const delay = retryDelay({
                status: response.status,
                retryAfter: response.headers.get('retry-after'),
                waitedMs: at - firstWait,
                nowMs: at,
            });
            if (delay !== null) {
                onWait?.(delay);
                await sleep(delay, signal);
                continue;
            }

            const problem = await problemText(response);
            const building = response.status === 503 && response.headers.has('retry-after');
            const reason = building
                ? 'the graph was still being read after a minute'
                : `the Graph API answered ${response.status}${problem ? ` (${problem})` : ''}`;
            throw new CheckError(`The check stopped: ${reason}.`);
        }
    };

    const findings: OntologyFinding[] = [];
    const refused: RefusedRow[] = [];
    let generation: string | null = null;
    let rowCount = 0;
    let checked = 0;
    let next = 0;
    const halves: (readonly OntologyCheckRow[])[] = [];

    onProgress?.({ checked, total: rows.length });
    while (halves.length > 0 || next < rows.length) {
        const chunk = halves.shift() ?? rows.slice(next, (next += size));
        const answer = await send(chunk);
        if (answer.kind === 'refused' && chunk.length > 1) {
            const half = Math.ceil(chunk.length / 2);
            halves.unshift(chunk.slice(0, half), chunk.slice(half));
            size = Math.min(size, half);
            continue;
        }
        if (answer.kind === 'refused') {
            refused.push({ ref: chunk[0]?.ref ?? null, detail: answer.detail });
        } else {
            findings.push(...answer.body.findings);
            generation = answer.body.generation;
            rowCount += answer.body.row_count;
        }
        checked += chunk.length;
        onProgress?.({ checked, total: rows.length });
    }
    return { generation, rowCount, findings, refused };
}

/** A message part: text, a term the model holds, or a value shown as typed. */
export type MessagePart = SentencePart | { readonly kind: 'value'; readonly text: string };

const CONSTRAINT_PREFIX = 'constraint_properties.';

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

/** The constraint property a finding's field names, or null for a definition field. */
export const findingProperty = (finding: OntologyFinding): string | null =>
    finding.field.startsWith(CONSTRAINT_PREFIX)
        ? finding.field.slice(CONSTRAINT_PREFIX.length)
        : null;

/** The finding's value as typed in the sheet; a list joins with commas. */
export const valueText = (value: OntologyFinding['value']): string => {
    if (Array.isArray(value)) return value.join(', ');
    return value === null ? '' : String(value);
};

const KIND_WORDS = {
    class: 'a kind of thing',
    valueList: 'a value list',
    property: 'a property',
    value: 'a value',
} as const;

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

/** "(it is a value list)" when the model knows what the id is. */
const kindAside = ({ model, value, text }: MessageContext): MessagePart[] => {
    const kind = model.kind(value);
    return kind === undefined ? [] : [text(` (it is ${KIND_WORDS[kind]})`)];
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
        const shown = { kind: 'value', text: value } as const;
        if (
            finding.field === 'observation_properties' ||
            (property !== null && value === property)
        ) {
            return [
                shown,
                text(
                    ' is no property on the graph. Check the spelling, or set the column to Ignored.',
                ),
            ];
        }
        if (property !== null) {
            return [
                shown,
                text(' is no value on the graph. Check the spelling. '),
                ...chooseFrom(context, ''),
            ];
        }
        return [
            shown,
            text(` is no node on the graph. Check the spelling of the ${fieldName(context)}.`),
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
        context.text(' is no property'),
        ...kindAside(context),
        context.text('. Use a property in this column, or set the column to Ignored.'),
    ],
    not_a_class: (context) => [
        context.term(context.value),
        context.text(' is no kind of thing'),
        ...kindAside(context),
        context.text('. The population type must be a kind of thing.'),
    ],
    value_outside_range: (context) => {
        const { property, value, text, term } = context;
        return [
            { kind: 'value', text: value },
            text(' is outside the values '),
            term(property ?? context.finding.field),
            text(' takes. '),
            ...chooseFrom(context, 'Choose a value the property allows.'),
        ];
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
        { kind: 'value', text: context.value || 'none' },
        context.text('. Match the graph’s definition, or give the row a new dcid.'),
    ],
};

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
    return MESSAGES[finding.code](context).filter((part) => part.kind !== 'text' || part.text);
}

/** A message as one line of text; terms appear as their dcids. */
export const messageText = (parts: readonly MessagePart[]): string =>
    parts
        .map((part) => (part.kind === 'term' ? part.id : part.text))
        .join('')
        .trim();

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
const SUGGESTED: ReadonlySet<FindingCode> = new Set(['node_not_held', 'value_outside_range']);

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

const counted = (n: number, one: string): string =>
    `${n.toLocaleString('en-GB')} ${n === 1 ? one : `${one}s`}`;

/**
 * "3 errors and 1 warning in 6 rows, checked against the graph at
 * generation X." or "No problems in 6 rows." when the route names no
 * generation. A refused row counts as an error.
 */
export function resultSentence(result: CheckResult, rows: number): string {
    const errors =
        result.findings.filter((finding) => finding.severity === 'error').length +
        result.refused.length;
    const warnings = result.findings.filter((finding) => finding.severity === 'warning').length;
    const against =
        result.generation === null
            ? ''
            : `, checked against the graph at generation ${result.generation}`;
    const problems = [
        ...(errors > 0 ? [counted(errors, 'error')] : []),
        ...(warnings > 0 ? [counted(warnings, 'warning')] : []),
    ];
    const lead = problems.length === 0 ? 'No problems' : problems.join(' and ');
    return `${lead} in ${counted(rows, 'row')}${against}.`;
}

/** The column header a finding belongs to, else its field. */
const columnOf = (mapping: Mapping, finding: OntologyFinding): string => {
    const at = locateFinding(mapping, finding)?.column;
    return (at === null || at === undefined ? undefined : mapping[at]?.header) ?? finding.field;
};

/** The findings as CSV rows under a header: row, column, value, code, message. */
export function findingsCsvRows(
    model: Model,
    mapping: Mapping,
    result: Pick<CheckResult, 'findings' | 'refused'>,
): string[][] {
    return [
        ['row', 'column', 'value', 'code', 'message'],
        ...result.findings.map((finding) => [
            finding.ref ?? '',
            columnOf(mapping, finding),
            valueText(finding.value),
            finding.code,
            messageText(findingMessage(model, finding)),
        ]),
        ...result.refused.map((row) => [row.ref ?? '', '', '', 'request_invalid', row.detail]),
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
