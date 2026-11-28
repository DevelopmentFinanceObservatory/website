/**
 * The values each chart or table card of a Library artifact draws, for the
 * artifact page's own HTML (a table and a schema.org `Dataset` block per
 * card) and its CSV route (`/library/<slug>/data.csv`).
 *
 * Three cache entries hold what dfo-apis serves, all under the share's tag
 * (`libraryShareTag`), which a take-down revalidates:
 *
 * - the share's cards (`cachedShareCards`), per share, for
 *   `REVALIDATE_SECONDS`;
 * - each card's current read (`cachedCurrentSlot`), per share and card, for
 *   `REVALIDATE_SECONDS`, which names the frame the slot serves;
 * - each card's chart on one frame (`frameChart`), per share, card and frame,
 *   for `REVALIDATE_SECONDS`. A frame's values stay fixed, but dfo-apis
 *   words a named frame (labels, measure, sources) under its current
 *   vocabulary and catalogue release, so the entry follows them.
 *
 * The page draws each table from its card's current read, and links to the
 * CSV pinned to the frame that read names. The CSV route serves the file
 * dfo-apis' slot data route exports on that same frame, so the file holds
 * the page's values from any server, whatever the slot serves by then. Each
 * card is read on its own, so a card that fails, or is slow, leaves the
 * others' tables standing. The page waits `PAGE_DEADLINE_MS` for the reads
 * and renders without the tables still missing, while those reads run on for
 * up to `FILL_DEADLINE_MS` to fill the cache for the next request.
 *
 * Server-only, without a `server-only` import so `node --test` can load it.
 */

import { unstable_cache } from 'next/cache.js';

import {
    type CardView,
    resolveCardView,
    widgetTitle,
} from '../../components/organisms/Studio/canvas/layout.ts';
import { asRecord } from '../asRecord.ts';
import {
    bodyBytes,
    readShare,
    readSlotCard,
    readSlotFile,
    SharesError,
    type ShareRecord,
    type SharesBackend,
} from '../chat/apisShares.ts';
import type { CardData, FrameRef, Widget } from '../chat/widgets.ts';
import { cardDataDates } from '../studio/dataThrough.ts';
import { gateOf } from '../studio/gate.ts';
import { cardDescription } from '../studio/infoPanel.ts';
import { BackendError } from '../studio/liveBackend.ts';
import { formatPeriod } from '../studio/period.ts';
import { problem, type ProblemStatus } from '../proxy/problem.ts';
import { drawSlotCard, REQUEST_REFUSALS, shownPageCards } from '../studio/slotCards.ts';
import { DFO_ORGANIZATION, SITE_NAME, SITE_ORIGIN } from '../site.ts';
import { artifactPath, type LibraryArtifact } from './artifact.ts';

const REVALIDATE_SECONDS = 300;

// The share read, then its slots in waves of `READ_CONCURRENCY` reads, so a
// canvas of nine data cards takes the share read and three waves. A slot
// read can start dfo-apis' check of a live slot for newer data, its slow
// path. The page gives the reads 1.5 s and renders without the tables still
// missing after that.
const PAGE_DEADLINE_MS = 1_500;

// How long a read that missed the page's deadline may run on to fill the
// cache.
const FILL_DEADLINE_MS = 10_000;

// Google reads a Dataset description of 50 to 5,000 characters.
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 5_000;

// dfo-apis statuses that say the share or its slot is gone or cannot be
// drawn. A refusal under one of them is permanent unless dfo-apis marks it
// `retryable`, as it marks a frame that is pending.
const PERMANENT_STATUSES = new Set([404, 410, 422]);

// How many slot reads one artifact has in flight at once, as a share page.
const READ_CONCURRENCY = 4;

// Five minutes, as the page's link-preview image and its rows.
const OPEN_CACHE = 'public, max-age=300, must-revalidate';

// Names a built description lists before it counts the rest.
const NAMES_LISTED = 8;

const CARD_VIEWS: readonly CardView[] = ['chart-bar', 'chart-line', 'chart-table'];

type ChartArtifact = Pick<
    LibraryArtifact,
    'slug' | 'shareId' | 'title' | 'description' | 'sources'
>;

type Row = { series: string; period: string; value: number; unit: string | null };

type Licence = string | { '@type': 'CreativeWork'; name: string };
type Source = { '@type': 'Dataset'; name: string; url?: string; license?: Licence };

type Dataset = {
    '@context': 'https://schema.org';
    '@type': 'Dataset';
    name: string;
    description: string;
    url: string;
    temporalCoverage: string;
    variableMeasured: string;
    creator: typeof DFO_ORGANIZATION;
    publisher: typeof DFO_ORGANIZATION;
    isAccessibleForFree: true;
    dateModified?: string;
    includedInDataCatalog: { '@type': 'DataCatalog'; name: string; url: string };
    isBasedOn?: Source[];
    license?: Licence;
    distribution: { '@type': 'DataDownload'; encodingFormat: 'text/csv'; contentUrl: string };
};

/**
 * A card of a share's page that draws from a slot, as the share's entry
 * keeps it: its payload id, its place among the cards the page shows (from
 * 1), its slot, the card the page holds until the slot fills it, and the
 * view and title the share saved for it. Plain JSON, so the cache can hold
 * it.
 */
export type ShareCard = {
    id: string;
    position: number;
    slot: number;
    held: Widget;
    view: CardView | null;
    title: string | null;
};

/** A refusal of the share (`card` null) or of one card's slot that a later
 *  read will not change. */
export type SlotRefusal = { card: string | null; status: number | undefined; code: string };

/**
 * The cards a card or canvas share's page shows that draw from a slot, in
 * page order, the share's refusal when a later read will not change it,
 * whether the share is a card share (`single`), whose one chart stands for
 * the whole artifact, and, for a snapshot, whose slots keep their frames,
 * the time it was made. Plain JSON, so the cache can hold it.
 */
export type ShareCards = {
    cards: ShareCard[];
    refused: SlotRefusal | null;
    single: boolean;
    snapshotAt: string | null;
};

/**
 * What one card of a share draws on one frame, as dfo-apis serves its slot:
 * the card's payload id, its place on the page, the slot, the frame, the
 * plotted rows and what the card says about them. Plain JSON, so the cache
 * can hold it.
 */
export type SlotChart = {
    id: string;
    position: number;
    slot: number;
    frame: FrameRef;
    title: string;
    measure: string | null;
    // When the card's data last changed by the card's own account, as an ISO
    // 8601 date or time, or null when it says nothing.
    dataDate: string | null;
    rows: Row[];
    seriesHeading: 'Country' | 'Series';
    sources: { name: string; url: string | null; licence: string | null }[];
};

/** A card's current read: the chart it draws on the frame its slot serves,
 *  null when it draws none, or the refusal a later read will not change. */
export type SlotRead = { chart: SlotChart | null; refusal: SlotRefusal | null };

/** A chart as the page shows it: `dateModified` falls back to a snapshot's
 *  making when the card names no date. */
export type ShownChart = SlotChart & { dateModified: string | null };

export type LibraryChartData = {
    id: string;
    // The chart's name, which the page shows beside its table when it shows
    // more than one; null otherwise.
    label: string | null;
    // The rows the page's table shows, within `ROWS_PER_CARD` and the
    // page's `ROWS_PER_PAGE` (`withRowBudget`), and how many rows the frame
    // holds, all of which the CSV and the Dataset block cover.
    rows: Row[];
    totalRows: number;
    // The periods `rows` span, null when the table shows none.
    shownWindow: { start: string; end: string } | null;
    seriesHeading: SlotChart['seriesHeading'];
    periodHeading: 'Year' | 'Period';
    window: { start: string; end: string };
    // The download link of the page and of the Dataset block, pinned to the
    // frame the rows are drawn on.
    csvHref: string;
    dataset: Dataset;
};

const httpUrl = (value: string | null | undefined): string | undefined => {
    if (value && URL.canParse(value)) {
        const url = new URL(value);

        if (url.protocol === 'https:' || url.protocol === 'http:') {
            return url.href;
        }
    }
};

const licenceOf = (value: string | null | undefined): Licence | undefined => {
    const name = value?.trim();

    if (name && !/not stated|^(unknown|no licence|none|n\/a)$/i.test(name)) {
        return httpUrl(name) ?? { '@type': 'CreativeWork', name };
    }
};

// Compare the ends independently so an interval can overlap shorter periods.
const windowOf = (first: Row, rest: readonly Row[]): LibraryChartData['window'] => {
    let [start, end = start] = first.period.split('/');

    for (const { period } of rest) {
        const [from, to = from] = period.split('/');

        start = from < start ? from : start;
        end = to > end ? to : end;
    }

    return { start, end };
};

const periodHeadingOf = (rows: readonly Row[]): LibraryChartData['periodHeading'] =>
    rows.every(({ period }) => /^\d{4}$/.test(period)) ? 'Year' : 'Period';

// The rows one card's table shows, and the rows the page's tables show in
// all, so a canvas of many large cards renders at most 1,500 rows of HTML.
const ROWS_PER_CARD = 250;
const ROWS_PER_PAGE = 1_500;

/**
 * The rows of `rows` a table of at most `limit` rows shows: the most recent
 * periods that fit whole, newest first by their end and then their start, in
 * `rows`' own order. When the newest period alone holds more than `limit`,
 * its first `limit` rows.
 */
export const recentRows = (rows: readonly Row[], limit: number): Row[] => {
    if (rows.length <= limit) {
        return [...rows];
    }

    const counts = new Map<string, number>();

    for (const { period } of rows) {
        counts.set(period, (counts.get(period) ?? 0) + 1);
    }

    const bounds = (period: string) => {
        const [from, to = from] = period.split('/');

        return { from, to };
    };
    const newestFirst = [...counts.keys()].toSorted((a, b) => {
        const [x, y] = [bounds(a), bounds(b)];

        return x.to === y.to ? y.from.localeCompare(x.from) : y.to.localeCompare(x.to);
    });
    const kept = new Set<string>();
    let taken = 0;

    for (const period of newestFirst) {
        const count = counts.get(period) ?? 0;

        if (taken + count > limit) {
            break;
        }

        kept.add(period);
        taken += count;
    }

    if (kept.size === 0) {
        const [newest] = newestFirst;

        return rows.filter(({ period }) => period === newest).slice(0, limit);
    }

    return rows.filter(({ period }) => kept.has(period));
};

/**
 * `charts` with each table cut to the rows `recentRows` keeps within
 * `perCard` rows and what is left of `perPage`, which the cards spend in page
 * order. A card the page has no rows left for shows none.
 */
export const withRowBudget = (
    charts: readonly LibraryChartData[],
    {
        perCard = ROWS_PER_CARD,
        perPage = ROWS_PER_PAGE,
    }: { perCard?: number; perPage?: number } = {},
): LibraryChartData[] => {
    let left = perPage;

    return charts.map((chart) => {
        const rows = recentRows(chart.rows, Math.min(perCard, left));
        const [first, ...rest] = rows;

        left -= rows.length;

        return { ...chart, rows, shownWindow: first ? windowOf(first, rest) : null };
    });
};

// Quarter and half-year labels become ISO 8601 month bounds in the metadata.
const monthBound = (period: string, end: boolean): string => {
    const match = /^(\d{4})-(Q[1-4]|H[12])$/.exec(period);

    if (!match) {
        return period;
    }

    const [, year, grain] = match;
    const months = grain.startsWith('Q') ? 3 : 6;
    const month = Number(grain[1]) * months - (end ? 0 : months - 1);

    return `${year}-${String(month).padStart(2, '0')}`;
};

// The view the share's payload saved for card `id`, which the embed draws.
const savedView = (payload: unknown, id: string): CardView | undefined => {
    const view = asRecord(asRecord(payload)?.['views'])?.[id];

    return CARD_VIEWS.find((known) => known === view);
};

// The title the card was renamed to in the share, which the embed shows.
const savedTitle = (payload: unknown, id: string): string | undefined => {
    const title = asRecord(asRecord(payload)?.['titles'])?.[id];

    return typeof title === 'string' && title.trim() ? title : undefined;
};

const VALUE_KEYS = new Set(['value', 'unit', 'period']);

/**
 * One row per valued cell, read by column key, so a chart's columns (series,
 * period, value, unit) and a table's (its dimensions, then those) read alike.
 * A row's series joins the label columns that vary across the rows, as a
 * table drawn as a chart names its bars (`chartFromTable`), or every label
 * column when none varies.
 */
const rowsOf = ({ columns, rows }: CardData): Row[] => {
    const keys = columns.map(({ key }) => key);
    const valueAt = keys.indexOf('value');
    const periodAt = keys.indexOf('period');
    const unitAt = keys.indexOf('unit');

    if (valueAt < 0 || periodAt < 0) {
        return [];
    }

    const labels = keys.flatMap((key, index) => (VALUE_KEYS.has(key) ? [] : [index]));
    const varying = labels.filter((index) => new Set(rows.map((row) => row[index])).size > 1);
    const named = varying.length ? varying : labels;

    return rows.flatMap((row) => {
        const series = named
            .flatMap((index) => (row[index] == null ? [] : [String(row[index])]))
            .join(' · ');
        const period = row[periodAt];
        const value = row[valueAt];
        const unit = unitAt < 0 ? null : row[unitAt];

        return series &&
            typeof period === 'string' &&
            typeof value === 'number' &&
            Number.isFinite(value)
            ? [{ series, period, value, unit: typeof unit === 'string' ? unit : null }]
            : [];
    });
};

/** Whether `error` is a failed dfo-apis read, which `code` names. */
export const isReadFailure = (error: unknown): error is SharesError | BackendError =>
    error instanceof SharesError || error instanceof BackendError;

// The refusal `error` is when a later read will not change it, else null.
const permanentRefusal = (error: unknown, card: string | null): SlotRefusal | null =>
    isReadFailure(error) &&
    !error.retryable &&
    (error.code === 'backend_invalid' ||
        (error.status !== undefined && PERMANENT_STATUSES.has(error.status)))
        ? { card, status: error.status, code: error.code }
        : null;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/;

const isoDate = (date: unknown): date is string => typeof date === 'string' && ISO_DATE.test(date);

// When a card's data last changed: a legacy card's `last_refreshed`, else
// the date its description says its version was prepared or computed.
const dataDateOf = (
    info: Parameters<typeof cardDataDates>[0],
    description: ReturnType<typeof cardDescription> | undefined,
): string | null =>
    [
        cardDataDates(info).lastRefreshed,
        description?.freshness.prepared,
        description?.freshness.computed,
    ].find(isoDate) ?? null;

// A card's date, else, for a snapshot, whose slots keep their frames, the
// day the share was made. A live slot's own date would take a read of the
// share's history, which the page does not make.
const shownChart = (chart: SlotChart, share: ShareCards): ShownChart => ({
    ...chart,
    dateModified: chart.dataDate ?? (isoDate(share.snapshotAt) ? share.snapshotAt : null),
});

// The rows `card` draws from `body`, a slot card read, or null when the view
// the embed shows (`resolveCardView` with the view the share saved) draws
// none, as a key number's does not, or the card holds no value.
const chartOf = (
    card: ShareCard,
    body: Record<string, unknown>,
): Omit<SlotChart, 'frame'> | null => {
    const widget = drawSlotCard(card.held, body);

    if (!widget || widget.kind === 'text' || !widget.data) {
        return null;
    }

    const { view } = resolveCardView(widget, card.view ?? undefined);

    // A key number has no view and draws no rows. A table whose values
    // cannot chart has none either, and draws itself.
    if (view === null && widget.kind !== 'table') {
        return null;
    }

    const rows = rowsOf(widget.data);

    if (!rows.length) {
        return null;
    }

    const description = widget.info && cardDescription(widget.info);
    const countries = new Set(
        (description?.about.drawn?.dimensions ?? [])
            .flatMap(({ values }) => values ?? [])
            .filter(({ ref }) => /^(?:dcid:)?country\//.test(ref))
            .map(({ label }) => label.toLowerCase()),
    );

    return {
        id: card.id,
        position: card.position,
        slot: card.slot,
        title: card.title ?? widgetTitle(widget),
        measure: description?.about.measure?.label ?? null,
        dataDate: dataDateOf(widget.info, description),
        rows,
        seriesHeading: rows.every(({ series }) => countries.has(series.toLowerCase()))
            ? 'Country'
            : 'Series',
        sources: (widget.info?.sources ?? []).map(({ name, url, licence }) => ({
            name,
            url,
            licence,
        })),
    };
};

const sameFrame = (a: FrameRef, b: FrameRef): boolean => frameKey(a) === frameKey(b);

// The chart `card` draws on the frame its slot serves, or on `frame` when
// one is named, under the frame dfo-apis says it drew. A named read whose
// reply names another frame, or none, is `backend_invalid`, thrown so no
// entry keeps it under the named frame. A chart whose reply names no frame
// draws no table, with a log line, since the table's CSV link needs one.
const readSlot = async (
    shares: SharesBackend,
    shareId: string,
    card: ShareCard,
    frame: FrameRef | null,
): Promise<SlotChart | null> => {
    const read = await readSlotCard(shares, shareId, card.slot, { frame });

    if (frame && !(read.frame && sameFrame(read.frame, frame))) {
        throw new SharesError('backend_invalid');
    }

    const chart = read.body && chartOf(card, read.body);

    if (!chart) {
        return null;
    }

    if (!read.frame) {
        console.warn('library_slot_unframed', { share: shareId, slot: card.slot });

        return null;
    }

    return { ...chart, frame: read.frame };
};

/**
 * The cards of share `shareId` its page shows that draw from a slot
 * (`shownPageCards`): a card share's one card, and every card a canvas
 * shows. A share dfo-apis refuses in a way a later read will not change is
 * kept in `refused`. Any other failed read throws its `SharesError`.
 */
export const readShareCards = async (
    shares: SharesBackend,
    shareId: string,
): Promise<ShareCards> => {
    let share: ShareRecord | null;

    try {
        share = await readShare(shares, shareId);
    } catch (error) {
        const refusal = permanentRefusal(error, null);

        if (refusal) {
            return { cards: [], refused: refusal, single: true, snapshotAt: null };
        }

        throw error;
    }

    if (share?.kind !== 'card' && share?.kind !== 'canvas') {
        return { cards: [], refused: null, single: true, snapshotAt: null };
    }

    const { payload } = share;

    return {
        cards: shownPageCards(share).flatMap((page, index) =>
            page.ref && page.slot !== null
                ? [
                      {
                          id: page.id,
                          position: index + 1,
                          slot: page.slot,
                          held: page.held,
                          view: savedView(payload, page.id) ?? null,
                          title: savedTitle(payload, page.id) ?? null,
                      },
                  ]
                : [],
        ),
        refused: null,
        single: share.kind === 'card',
        snapshotAt: share.mode === 'snapshot' ? share.createdAt : null,
    };
};

/**
 * Card `card`'s current read: the chart it draws on the frame its slot
 * serves. A chart, a table, and either one saved in the other's view draw
 * rows; a key number draws none. A refusal a later read will not change
 * (the slot gone, a card dfo-apis cannot draw, an answer outside its shape)
 * is kept in `refusal`, so the cache keeps it. Any other failed read, a
 * refusal dfo-apis marks `retryable` included, throws its `SharesError` or
 * `BackendError`, so the cache keeps the card's last good entry.
 */
export const readCurrentSlot = async (
    shares: SharesBackend,
    shareId: string,
    card: ShareCard,
): Promise<SlotRead> => {
    try {
        return { chart: await readSlot(shares, shareId, card, null), refusal: null };
    } catch (error) {
        const refusal = permanentRefusal(error, card.id);

        if (refusal) {
            return { chart: null, refusal };
        }

        throw error;
    }
};

/** The cache tag of a share's entries, which a take-down revalidates. */
export const libraryShareTag = (shareId: string): string => `library-share:${shareId}`;

// The backend a read that fills a cache entry uses: its own deadline, so a
// page that stops waiting leaves it running.
const filling = (backend: SharesBackend): SharesBackend => ({
    ...backend,
    signal: AbortSignal.timeout(FILL_DEADLINE_MS),
});

/**
 * `readShareCards`, cached per share under `libraryShareTag` for
 * `REVALIDATE_SECONDS`, the lifetime of the link-preview image. The cache is
 * stale-while-revalidate: the first request after an entry expires is
 * served the old entry and starts a read, and later requests get that
 * read's answer, so a change shows after five minutes and one more view. A
 * failed read throws, stores nothing and leaves the old entry in place.
 * The reads name the caller of the request that fills the entry, as the
 * other entries' do.
 */
export const cachedShareCards = (backend: SharesBackend, shareId: string): Promise<ShareCards> =>
    unstable_cache((id: string) => readShareCards(filling(backend), id), ['library-share-cards'], {
        revalidate: REVALIDATE_SECONDS,
        tags: [libraryShareTag(shareId)],
    })(shareId);

/**
 * `readCurrentSlot`, cached per share and card under `libraryShareTag` for
 * `REVALIDATE_SECONDS`, as `cachedShareCards` is. The key holds the whole
 * card, so a card the share saves another view or title for is read afresh.
 * A failed read keeps this card's last good entry and no other's.
 */
export const cachedCurrentSlot = (
    backend: SharesBackend,
    shareId: string,
    card: ShareCard,
): Promise<SlotRead> =>
    unstable_cache(
        (id: string, shown: ShareCard) => readCurrentSlot(filling(backend), id, shown),
        ['library-slot-current'],
        { revalidate: REVALIDATE_SECONDS, tags: [libraryShareTag(shareId)] },
    )(shareId, card);

/**
 * The chart `card` draws on `frame`, cached per share, card and frame under
 * `libraryShareTag` for `REVALIDATE_SECONDS`, which a pinned CSV request
 * reads to learn whether the card draws rows on that frame. On a miss,
 * `draw` gives the chart: the page passes the chart its current read drew
 * on that frame, and the CSV route a read of the slot on that frame, so
 * either fills the entry the other reads. A `draw` that throws stores
 * nothing, so a frame dfo-apis refuses is asked again. The key goes in the
 * key parts, as `draw` is a closure.
 */
const frameChart = (
    shareId: string,
    card: ShareCard,
    frame: FrameRef,
    draw: () => Promise<SlotChart | null>,
): Promise<SlotChart | null> =>
    unstable_cache(
        () => draw(),
        ['library-slot-frame', shareId, JSON.stringify(card), frameKey(frame)],
        { revalidate: REVALIDATE_SECONDS, tags: [libraryShareTag(shareId)] },
    )();

// The chart card `card` shows on the page: its current read's, which also
// fills the frame entry a pinned CSV request reads. Null when the card draws
// no rows. A failed read throws.
const pageChart = async (
    backend: SharesBackend,
    shareId: string,
    card: ShareCard,
): Promise<SlotChart | null> => {
    const { chart } = await cachedCurrentSlot(backend, shareId, card);

    if (chart) {
        await frameChart(shareId, card, chart.frame, () => Promise.resolve(chart));
    }

    return chart;
};

// At most `max` characters, cut at a word break when one is near.
const clip = (text: string, max: number): string => {
    if (text.length <= max) {
        return text;
    }

    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');

    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

// "a", "a and b", "a, b, and c", or the first NAMES_LISTED and a count.
const listOf = (names: readonly string[]): string => {
    const items =
        names.length > NAMES_LISTED
            ? [...names.slice(0, NAMES_LISTED), `${names.length - NAMES_LISTED} more`]
            : names;

    return items.length < 3
        ? items.join(' and ')
        : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
};

type DescriptionParts = {
    measure: string;
    window: LibraryChartData['window'];
    sources: readonly Source[];
    single: boolean;
};

/**
 * For an artifact of one chart, the Library description when it is long
 * enough for a Dataset. Otherwise one built from the chart, which names the
 * measure, the places or series, the period, the sources and the artifact's
 * title. Either is clipped to `DESCRIPTION_MAX`. Each chart of a canvas gets its own built
 * description, since the Library's describes the whole canvas.
 */
const datasetDescription = (
    artifact: ChartArtifact,
    chart: SlotChart,
    { measure, window, sources, single }: DescriptionParts,
): string => {
    const own = artifact.description.trim();

    if (single && own.length >= DESCRIPTION_MIN) {
        return clip(own, DESCRIPTION_MAX);
    }

    const names = [...new Set(chart.rows.map(({ series }) => series))];
    const period =
        window.start === window.end
            ? `in ${formatPeriod(window.start)}`
            : `from ${formatPeriod(window.start)} to ${formatPeriod(window.end)}`;
    const sentences = [
        `${measure.charAt(0).toUpperCase()}${measure.slice(1)} for ${listOf(names)} ${period}.`,
        ...(sources.length ? [`Source: ${listOf(sources.map(({ name }) => name))}.`] : []),
        `Published in the Development Finance Observatory Library as "${artifact.title}".`,
    ];

    return clip(sentences.join(' '), DESCRIPTION_MAX);
};

// A frame as one cache key part.
const frameKey = ({ spec_id, content_version }: FrameRef): string =>
    `${spec_id}@${content_version}`;

/**
 * The CSV route's address for `chart`, pinned to the frame the rows are drawn
 * on: `data.csv` for an artifact of one chart, and `data.csv?card=<id>` for
 * each chart of an artifact with more, with the frame in `spec_id` and
 * `content_version`, as dfo-apis' slot routes name it.
 */
const csvHrefOf = (slug: string, chart: SlotChart, { single }: { single: boolean }): string => {
    const query = new URLSearchParams({
        ...(single ? {} : { card: chart.id }),
        spec_id: chart.frame.spec_id,
        content_version: chart.frame.content_version,
    });

    return `${artifactPath(slug)}/data.csv?${query}`;
};

/**
 * The table and Dataset block of a Library chart drawn from `chart`. The
 * chart of a card share (`single`) names its Dataset by the artifact's
 * title. Each chart of a canvas is named by its own title, or by the
 * artifact's title and its place on the page when it has none. With
 * `labelled`, the table carries that name too.
 */
export const chartDataOf = (
    chart: ShownChart,
    artifact: ChartArtifact,
    origin: string,
    { single = true, labelled = false }: { single?: boolean; labelled?: boolean } = {},
): LibraryChartData | null => {
    const [first, ...rest] = chart.rows;

    if (!first) {
        return null;
    }

    const { rows } = chart;
    const periodHeading = periodHeadingOf(rows);
    const window = windowOf(first, rest);
    const start = monthBound(window.start, false);
    const end = monthBound(window.end, true);
    const csvHref = csvHrefOf(artifact.slug, chart, { single });
    const storedSources = new Map(artifact.sources.map(({ name, url }) => [name, url]));
    const sources: Source[] = (
        chart.sources.length
            ? chart.sources
            : artifact.sources.map((source) => ({ ...source, licence: null }))
    ).map(({ name, url, licence }) => {
        const sourceUrl = url ?? storedSources.get(name);

        return {
            '@type': 'Dataset',
            name,
            url: sourceUrl?.startsWith('/data/sources/')
                ? new URL(sourceUrl, origin).href
                : httpUrl(sourceUrl),
            license: licenceOf(licence),
        };
    });
    const [source] = sources;
    const title =
        chart.title.trim() ||
        (single ? artifact.title : `${artifact.title}, chart ${chart.position}`);
    const name = single ? artifact.title : title;
    const measure = chart.measure?.trim() || title;

    return {
        id: chart.id,
        label: labelled ? name : null,
        rows,
        totalRows: rows.length,
        shownWindow: window,
        seriesHeading: chart.seriesHeading,
        periodHeading,
        window,
        csvHref,
        dataset: {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name,
            description: datasetDescription(artifact, chart, { measure, window, sources, single }),
            url: new URL(artifactPath(artifact.slug), origin).href,
            temporalCoverage: start === end ? start : `${start}/${end}`,
            variableMeasured: measure,
            creator: DFO_ORGANIZATION,
            publisher: DFO_ORGANIZATION,
            isAccessibleForFree: true,
            dateModified: chart.dateModified ?? undefined,
            includedInDataCatalog: {
                '@type': 'DataCatalog',
                name: `${SITE_NAME} Library`,
                url: new URL('/library', origin).href,
            },
            isBasedOn: sources.length ? sources : undefined,
            license: sources.length === 1 ? source.license : undefined,
            distribution: {
                '@type': 'DataDownload',
                encodingFormat: 'text/csv',
                contentUrl: new URL(csvHref, origin).href,
            },
        },
    };
};

/**
 * The table and Dataset block of each chart a Library artifact shows, on the
 * frames its public slots serve, in page order. Each table is cut to the
 * rows `withRowBudget` keeps. The result is empty when no card draws rows,
 * the share's read fails, or it is not done in `deadlineMs`, and leaves out
 * a card whose own read fails or is not done by then. A read that misses the
 * deadline goes on to fill the cache, and `waitUntil` receives it so the
 * server keeps running it after the response.
 */
export const libraryChartData = async (
    backend: SharesBackend,
    artifact: ChartArtifact,
    origin: string,
    {
        deadlineMs = PAGE_DEADLINE_MS,
        waitUntil,
    }: { deadlineMs?: number; waitUntil?: (pending: Promise<unknown>) => void } = {},
): Promise<LibraryChartData[]> => {
    const { shareId } = artifact;
    const unavailable = (code: string, card?: string) => {
        console.warn('library_chart_data_unavailable', { share: shareId, card, code });

        return null;
    };
    const gate = gateOf(READ_CONCURRENCY);
    const chartsOf = ({ cards }: ShareCards) =>
        cards.map((card) => ({ card, read: gate(() => pageChart(backend, shareId, card)) }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((resolve) => {
        timer = setTimeout(resolve, deadlineMs, 'late');
    });
    // A fill left running after the page's deadline, whose failure is logged.
    const logged = (fill: Promise<unknown>, card?: string) =>
        fill.catch((error: unknown) =>
            unavailable(isReadFailure(error) ? error.code : 'fill_failed', card),
        );
    // `read`'s answer, or 'late' after handing it to `waitUntil` to finish.
    const inTime = async <T>(
        read: Promise<T>,
        { card, settle = () => null }: { card?: string; settle?: (answer: T) => unknown } = {},
    ) => {
        const answer = await Promise.race([read, late]);

        if (answer === 'late') {
            waitUntil?.(logged(read.then(settle), card));
        }

        return answer;
    };

    try {
        const share = await inTime(cachedShareCards(backend, shareId), {
            settle: (filled) =>
                Promise.all(chartsOf(filled).map(({ card, read }) => logged(read, card.id))),
        });

        if (share === 'late') {
            unavailable('page_deadline');

            return [];
        }

        const charts = await Promise.all(
            chartsOf(share).map(async ({ card, read }) => {
                try {
                    const chart = await inTime(read, { card: card.id });

                    return chart === 'late' ? unavailable('page_deadline', card.id) : chart;
                } catch (error) {
                    if (!isReadFailure(error)) {
                        throw error;
                    }

                    return unavailable(error.code, card.id);
                }
            }),
        );
        const shown = charts.filter((chart) => chart !== null);
        const { single } = share;
        // From the cards the share shows, so a card that failed or was late
        // leaves the others' names in place.
        const labelled = share.cards.length > 1;

        return withRowBudget(
            shown.flatMap(
                (chart) =>
                    chartDataOf(shownChart(chart, share), artifact, origin, { single, labelled }) ??
                    [],
            ),
        );
    } catch (error) {
        if (!isReadFailure(error)) {
            throw error;
        }

        unavailable(error.code);

        return [];
    } finally {
        clearTimeout(timer);
    }
};

type Failure = Pick<SharesError, 'code' | 'retryable'> & {
    status?: number;
    retryAfterS?: number;
};

// The statuses with which dfo-apis refuses a request itself, which the CSV
// route answers under as dfo-apis gave them: those the share download maps
// (`REQUEST_REFUSALS`), and 410, a slot or frame gone for good.
const PASSED_REFUSALS = [...REQUEST_REFUSALS, 410] as const satisfies readonly ProblemStatus[];

/**
 * The CSV route's answer to a failed read: a refusal dfo-apis made of the
 * request itself (`PASSED_REFUSALS`), `frame_not_served` (404) and
 * `frame_expired` (410) among them, under its own status, a 429 with its
 * `Retry-After`, and 502 for any other fault.
 */
export const readFailureResponse = ({
    code,
    status,
    retryable,
    retryAfterS,
}: Failure): Response => {
    const answer =
        status === 429 ? 429 : (PASSED_REFUSALS.find((refusal) => refusal === status) ?? 502);

    return problem({
        status: answer,
        code,
        detail: 'The card has no data file to serve.',
        retryable,
        headers: {
            'Cache-Control': 'no-store',
            ...(answer === 429 && retryAfterS !== undefined
                ? { 'Retry-After': String(retryAfterS) }
                : {}),
        },
    });
};

// The CSV route's answer to a refusal the cache holds: its own status when
// it is one of `PASSED_REFUSALS`, and 404 `not_found` for any other,
// `backend_invalid` (an answer outside dfo-apis' shape, with no status)
// included, since the card has no data to serve.
const storedRefusalResponse = ({ status, code }: SlotRefusal): Response => {
    const answer = PASSED_REFUSALS.find((refusal) => refusal === status);

    return answer === undefined
        ? noData()
        : problem({
              status: answer,
              code,
              detail: 'The card has no data file to serve.',
              retryable: false,
              headers: { 'Cache-Control': 'no-store' },
          });
};

const noData = (): Response =>
    problem({
        status: 404,
        code: 'not_found',
        detail: 'This Library artifact has no data rows.',
        retryable: false,
        headers: { 'Cache-Control': 'no-store' },
    });

type ReadFailure = SharesError | BackendError;

// The card a request names, with its current read when finding it took one:
// card `card`, a card share's one card, or a canvas's first card whose
// current read draws rows. A canvas card whose read fails or is refused is
// passed over. A canvas with no card that draws rows answers the first
// refusal or failure its reads met, and with none, no card.
const requestedCard = async (
    backend: SharesBackend,
    shareId: string,
    share: ShareCards,
    card: string | null,
): Promise<
    | { shown: ShareCard; current?: SlotRead }
    | { refusal: SlotRefusal }
    | { failure: ReadFailure }
    | null
> => {
    if (card !== null || share.single) {
        const found = card === null ? share.cards[0] : share.cards.find(({ id }) => id === card);

        return found ? { shown: found } : null;
    }

    let first: { refusal: SlotRefusal } | { failure: ReadFailure } | null = null;

    for (const shown of share.cards) {
        let current: SlotRead;

        try {
            current = await cachedCurrentSlot(backend, shareId, shown);
        } catch (error) {
            if (!isReadFailure(error)) {
                throw error;
            }

            first ??= { failure: error };
            continue;
        }

        if (current.chart) {
            return { shown, current };
        }

        first ??= current.refusal && { refusal: current.refusal };
    }

    return first;
};

/**
 * `GET /library/<slug>/data.csv?card=&spec_id=&content_version=`, for a
 * published artifact: the data file of chart `card` (the first chart when
 * `card` is null) on `frame`, the frame the page's link names, or on the
 * frame the slot serves when `frame` is null. The file is dfo-apis'
 * unbundled CSV export of the card's slot, with every column the card's rows
 * carry, so a link the page pinned serves the page's values from any server
 * however far the slot has moved on. A card that draws no rows on the frame,
 * or in its current read, is 404. dfo-apis' refusals and failed
 * reads answer as `readFailureResponse` maps them: a frame the slot never
 * served its card on 404 `frame_not_served`, one DFO no longer holds 410
 * `frame_expired`, a 429 with its `Retry-After`. A card or share the cache
 * holds as refused answers as `storedRefusalResponse` maps it. Any other
 * card, and an artifact with no chart, is 404. The file's `Link` header
 * names the artifact's page as the address to cite. An open Library's file
 * is cached publicly for five minutes. An admin's preview is not stored.
 */
export const libraryCsvResponse = async (
    backend: SharesBackend,
    artifact: Pick<LibraryArtifact, 'slug' | 'shareId'>,
    { card, frame, open }: { card: string | null; frame: FrameRef | null; open: boolean },
): Promise<Response> => {
    const { shareId } = artifact;

    try {
        const share = await cachedShareCards(backend, shareId);

        if (share.refused) {
            return storedRefusalResponse(share.refused);
        }

        const requested = await requestedCard(backend, shareId, share, card);

        if (requested === null) {
            return noData();
        }

        if ('refusal' in requested) {
            return storedRefusalResponse(requested.refusal);
        }

        if ('failure' in requested) {
            return readFailureResponse(requested.failure);
        }

        const { shown } = requested;
        let chart: SlotChart | null;

        if (frame) {
            chart = await frameChart(shareId, shown, frame, () =>
                readSlot(filling(backend), shareId, shown, frame),
            );
        } else {
            const current = requested.current ?? (await cachedCurrentSlot(backend, shareId, shown));

            if (current.refusal) {
                return storedRefusalResponse(current.refusal);
            }

            chart = current.chart;
        }

        if (!chart) {
            return noData();
        }

        // A request without a frame reads the file on the frame the slot
        // serves, whatever frame a stale entry holds. The body is read whole
        // first, so a file cut off at the call's deadline answers an error,
        // not a short file.
        const file = await bodyBytes(
            await readSlotFile(backend, shareId, shown.slot, {
                format: 'csv',
                bundle: 'false',
                frame,
            }),
        );
        const name = share.single ? artifact.slug : `${artifact.slug}-${shown.position}`;

        return new Response(file, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${name}.csv"`,
                'Cache-Control': open ? OPEN_CACHE : 'no-store',
                Link: `<${new URL(artifactPath(artifact.slug), SITE_ORIGIN).href}>; rel="cite-as"`,
            },
        });
    } catch (error) {
        if (!isReadFailure(error)) {
            throw error;
        }

        return readFailureResponse(error);
    }
};
