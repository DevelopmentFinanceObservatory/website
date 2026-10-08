/**
 * Finds the component revision a stored Studio card draws, for a card saved
 * without `ref`. A card's `id` is its Presentation component id, so the
 * candidates are that component's revisions, read through `ReadComponent`.
 *
 * A revision reproduces a card when both of these hold:
 *
 * - the card's title is one the revision gives it: the title of the
 *   revision drawn by `widgetFromComponent`, from its resolved payload or
 *   from its fact summary, or the payload's own title;
 * - the card's values are the ones the revision draws, from its resolved
 *   payload or from its fact summary, line for line (see `valueLines`).
 *
 * Exactly one reproducing revision is a match. None, or more than one,
 * leaves the card unmatched, and so does a component whose revisions cannot
 * all be read, because a match is only made over every revision.
 *
 * The chart type is left out of the comparison because a card keeps the
 * chart type it was created with when a later revision changes it.
 */

import type { CardData, CardRef, FrameRef, Widget } from '../chat/widgets';
import { payloadFrameRef, payloadTitle } from './payload.ts';
import { widgetFromComponent } from './widgets.ts';
import type { ComponentCreated, ComponentType, FactSummary, Provenance } from './wire';

/** The body of `GET /api/presentation/components/{id}`, for the head
 *  revision or the one `?revision=N` names. */
export type ComponentRead = {
    component_id: string;
    revision: number;
    catalog_version: string;
    stored_intent: Record<string, unknown>;
    fact_summary: FactSummary;
    resolved_payload: Record<string, unknown>;
};

/** Reads one revision of a component, or its head revision when `revision`
 *  is left out. Resolves null when the component or revision does not
 *  exist, and rejects on any other failure. */
export type ReadComponent = (
    componentId: string,
    revision?: number,
) => Promise<ComponentRead | null>;

type DataWidget = Exclude<Widget, { kind: 'text' }>;

/** A data card as stored in `conversation.data` or `share.data`. A card
 *  saved before `ref` holds its values as `csv`, the text Download Data
 *  served, and has no `data`. */
export type StoredCard = DataWidget & { csv?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const DATA_KINDS = new Set(['key_number', 'chart', 'table']);

export const isStoredCard = (value: unknown): value is StoredCard =>
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['kind'] === 'string' &&
    DATA_KINDS.has(value['kind']);

// Whether a record names a component revision, as a `ref` and a read both do.
const namesRevision = (record: Record<string, unknown>): boolean =>
    typeof record['component_id'] === 'string' && Number.isInteger(record['revision']);

const isCardRef = (value: unknown): value is CardRef => isRecord(value) && namesRevision(value);

/** A read response body as a `ComponentRead`. Undefined when it is not one. */
export const asComponentRead = (body: unknown): ComponentRead | undefined =>
    isRecord(body) &&
    namesRevision(body) &&
    typeof body['catalog_version'] === 'string' &&
    isRecord(body['stored_intent']) &&
    isRecord(body['fact_summary']) &&
    isRecord(body['resolved_payload'])
        ? (body as ComponentRead)
        : undefined;

// --- Values -----------------------------------------------------------------

// A statistics upgrade replaced a stat card's `csv` with the first, latest,
// minimum and maximum of its whole series. Those come from the datasets
// statistics artifact, which no component revision holds.
const STATISTICS_HEADER = 'metric,period,value';

// One cell as `csv` held it, quoted when it contains a comma and with no
// escaping of the quote itself.
const csvCell = (text: string): string => (text.includes(',') ? `"${text}"` : text);

// A header line and its row lines in the form two cards are compared in.
// The header is lower-cased, because `csv` names a chart's columns
// `series,period,value` and `data` labels them `Series`, `Period`, `Value`.
// A chart's rows are sorted, because `csv` lists each series' points by
// period and `data` lists them in payload order. A table's and a key
// number's rows keep their order.
const comparable = (kind: StoredCard['kind'], header: string, rows: string[]): string =>
    [header.toLowerCase(), ...(kind === 'chart' ? [...rows].sort() : rows)].join('\n');

const dataLines = (kind: StoredCard['kind'], data: CardData): string | undefined => {
    if (!Array.isArray(data.columns) || !Array.isArray(data.rows) || data.rows.length === 0) {
        return undefined;
    }

    // `data` ends with each row's unit, which `csv` never held.
    const width = data.columns.at(-1)?.key === 'unit' ? data.columns.length - 1 : undefined;

    return comparable(
        kind,
        data.columns
            .slice(0, width)
            .map(({ label }) => csvCell(label))
            .join(','),
        data.rows.map((row) =>
            row
                .slice(0, width)
                .map((cell) => (cell == null ? '' : csvCell(String(cell))))
                .join(','),
        ),
    );
};

/**
 * The values a card shows, as the text two cards are compared by. It is a
 * header line of column labels, then one line per value, cells joined by
 * commas.
 * A card with `data` gives its columns and rows without the trailing unit;
 * a card with `csv` gives the `csv` itself. A number is written as
 * JavaScript prints it, the shortest text that reads back as the same
 * double, which is how `csv` held it. Nothing is rounded and no tolerance
 * applies, so two values compare equal only when they are the same number.
 *
 * Undefined for a card that holds no values.
 */
export const valueLines = (card: StoredCard): string | undefined => {
    if (isRecord(card.data)) {
        return dataLines(card.kind, card.data);
    }

    if (typeof card.csv !== 'string' || !card.csv.includes('\n')) {
        return undefined;
    }

    const [header = '', ...rows] = card.csv.split('\n');

    return comparable(card.kind, header, rows);
};

const titleOf = (card: DataWidget): string =>
    card.kind === 'key_number' ? card.label : card.title;

// --- Revisions --------------------------------------------------------------

// A read carries no frame-level provenance. Only a card's More Info reads
// it, which the match does not compare.
const NO_PROVENANCE: Provenance = {
    inputs: [],
    sources: [],
    freshness: { data_through: '', last_refreshed: '', partial_period: false },
    warnings: [],
    generated_at: '',
    citation: '',
};

const createdFrame = (read: ComponentRead, payload: Record<string, unknown>): ComponentCreated => ({
    event: 'component.created',
    seq: 0,
    component_id: read.component_id,
    revision: read.revision,
    // An intent type the canvas does not draw yields no widget.
    type: read.stored_intent['type'] as ComponentType,
    catalog_version: read.catalog_version,
    min_catalog_version: read.catalog_version,
    payload,
    fact_summary: read.fact_summary,
    provenance: NO_PROVENANCE,
});

// The stored intent in the payload shape `payload.ts` reads a title and a
// frame from, and which resolves no component, so the card it draws is the
// fact-summary sketch.
const intentPayload = (read: ComponentRead): Record<string, unknown> => ({
    stored_intent: read.stored_intent,
});

// The cards a revision draws, from its resolved payload and as the sketch
// from its fact summary, which a card shows when its payload resolved no
// component of its kind.
const drawings = (read: ComponentRead): DataWidget[] =>
    [read.resolved_payload, intentPayload(read)]
        .map((payload) => widgetFromComponent(createdFrame(read, payload)))
        .filter((widget): widget is DataWidget => widget !== null && widget.kind !== 'text');

const reproduces = (read: ComponentRead, card: StoredCard, shown: string): boolean => {
    const drawn = drawings(read).filter((widget) => widget.kind === card.kind);
    const titles = new Set([...drawn.map(titleOf), payloadTitle(read.resolved_payload)]);

    return titles.has(titleOf(card)) && drawn.some((widget) => valueLines(widget) === shown);
};

/** The frame a revision draws from, as `widgetFromComponent` derives it:
 *  the resolved payload's first provenance input, else the stored intent's
 *  `frame_ref`. */
export const frameOfRead = (read: ComponentRead): FrameRef | undefined =>
    payloadFrameRef(read.resolved_payload) ?? payloadFrameRef(intentPayload(read));

// --- Match ------------------------------------------------------------------

export type UnmatchedReason =
    // The card holds neither `data` nor a `csv` with a value row.
    | 'no_values'
    // The card's `csv` is the statistics upgrade's.
    | 'statistics_csv'
    | 'component_not_found'
    // A revision could not be read, or the read was of another revision.
    | 'read_failed'
    | 'no_revision_reproduces'
    | 'several_revisions_reproduce'
    // The one reproducing revision names no frame.
    | 'no_frame';

export type MatchOutcome =
    | { status: 'matched'; ref: CardRef; frame: FrameRef }
    | { status: 'unmatched'; reason: UnmatchedReason };

const unmatched = (reason: UnmatchedReason): MatchOutcome => ({ status: 'unmatched', reason });

// Every revision of a component, head first. Undefined when the component
// does not exist. Rejects when a revision cannot be read.
const readRevisions = async (
    componentId: string,
    read: ReadComponent,
): Promise<ComponentRead[] | undefined> => {
    const head = await read(componentId);

    if (!head) {
        return undefined;
    }

    const reads = [head];

    // One at a time, so a backfill over every stored card does not burst the
    // Presentation API.
    for (let revision = head.revision - 1; revision >= 1; revision -= 1) {
        const earlier = await read(componentId, revision);

        if (earlier?.revision !== revision || earlier.component_id !== componentId) {
            throw new Error(`revision ${revision} of ${componentId} could not be read`);
        }

        reads.push(earlier);
    }

    return reads;
};

/** The revision `card` draws and the frame it draws from, or why none was
 *  chosen. `card.ref` and `card.frame` are not consulted. */
export const matchCardRef = async (
    card: StoredCard,
    read: ReadComponent,
): Promise<MatchOutcome> => {
    const shown = valueLines(card);

    if (shown === undefined) {
        return unmatched('no_values');
    }

    if (shown.startsWith(`${STATISTICS_HEADER}\n`)) {
        return unmatched('statistics_csv');
    }

    let reads: ComponentRead[] | undefined;

    try {
        reads = await readRevisions(card.id, read);
    } catch {
        // The reader reports its own failures. The card is left unmatched.
        return unmatched('read_failed');
    }

    if (!reads) {
        return unmatched('component_not_found');
    }

    const matches = reads.filter((one) => reproduces(one, card, shown));
    const [match] = matches;

    if (!match) {
        return unmatched('no_revision_reproduces');
    }

    if (matches.length > 1) {
        return unmatched('several_revisions_reproduce');
    }

    const frame = frameOfRead(match);

    return frame
        ? {
              status: 'matched',
              ref: { component_id: match.component_id, revision: match.revision },
              frame,
          }
        : unmatched('no_frame');
};

// --- Stored rows ------------------------------------------------------------

const cardsOf = (widgets: unknown): { index: number; card: StoredCard }[] =>
    Array.isArray(widgets)
        ? widgets.flatMap((card, index) => (isStoredCard(card) ? [{ index, card }] : []))
        : [];

/** The data cards of a stored `widgets` array that have no `ref` member,
 *  each with its index in the array. */
export const cardsWithoutRef = (widgets: unknown): { index: number; card: StoredCard }[] =>
    cardsOf(widgets).filter(({ card }) => !('ref' in card));

/**
 * The data cards of a stored `widgets` array that were saved with their
 * revision: they have `ref` and `data`. A card the backfill gave its `ref`
 * has `csv` and no `data`, so it cannot be validated against itself.
 */
export const cardsWithRef = (widgets: unknown): (StoredCard & { ref: CardRef })[] =>
    cardsOf(widgets).flatMap(({ card }) =>
        isCardRef(card.ref) && isRecord(card.data) ? [{ ...card, ref: card.ref }] : [],
    );

// --- Validation -------------------------------------------------------------

export type Verdict = 'correct' | 'wrong' | 'unmatched';

export type Validated = {
    card: StoredCard & { ref: CardRef };
    outcome: MatchOutcome;
    verdict: Verdict;
};

const sameFrame = (a: FrameRef, b: FrameRef): boolean =>
    a.spec_id === b.spec_id && a.content_version === b.content_version;

/**
 * Runs the match on a card whose revision is known, with `ref` and `frame`
 * taken off it. `correct` when the match names the card's own revision and,
 * where the card has one, its own frame. `wrong` when it names another.
 */
export const validateCard = async (
    card: StoredCard & { ref: CardRef },
    read: ReadComponent,
): Promise<Validated> => {
    const { ref, frame, ...stripped } = card;
    const outcome = await matchCardRef(stripped as StoredCard, read);

    if (outcome.status === 'unmatched') {
        return { card, outcome, verdict: 'unmatched' };
    }

    const correct =
        outcome.ref.component_id === ref.component_id &&
        outcome.ref.revision === ref.revision &&
        (!frame || sameFrame(outcome.frame, frame));

    return { card, outcome, verdict: correct ? 'correct' : 'wrong' };
};

export type ValidationSummary = Record<Verdict, number> & { validated: number };

export const summarise = (results: Validated[]): ValidationSummary => ({
    validated: results.length,
    correct: results.filter(({ verdict }) => verdict === 'correct').length,
    wrong: results.filter(({ verdict }) => verdict === 'wrong').length,
    unmatched: results.filter(({ verdict }) => verdict === 'unmatched').length,
});

/**
 * The fewest validated cards a write needs. With no wrong match among 300
 * cards, the wrong-match rate is below 1% at 95% confidence (3 / n).
 */
export const MIN_VALIDATED = 300;

/**
 * Whether a validation run allows writing: no wrong match, over at least
 * `MIN_VALIDATED` cards. A wrong match makes a live share redraw a card
 * from a revision its author never saved, and nothing on the card shows
 * it. An unmatched card only stays a snapshot. So one wrong match refuses
 * the write, and an unmatched card does not.
 */
export const validationAllowsWrite = (summary: ValidationSummary): boolean =>
    summary.wrong === 0 && summary.validated >= MIN_VALIDATED;
