/**
 * The values each chart or table card of a Library artifact draws, for the
 * artifact page's own HTML (a table and a schema.org `Dataset` block per
 * card) and its CSV route (`/library/<slug>/data.csv`).
 *
 * The share's record and slots are read once per share and cached
 * (`cachedSlotCharts`). The page and the CSV route both draw from that one
 * entry, so a CSV holds the rows the page's table shows. The page waits
 * `PAGE_DEADLINE_MS` for the read and renders without the tables after that,
 * while the read runs on for up to `FILL_DEADLINE_MS` to fill the cache for
 * the next request.
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
    readShare,
    readSlotCard,
    SharesError,
    type ShareRecord,
    type SharesBackend,
} from '../chat/apisShares.ts';
import type { CardData, FrameRef } from '../chat/widgets.ts';
import { toCsv } from '../graphExplorer/sheet.ts';
import { cardDataDates } from '../studio/dataThrough.ts';
import { gateOf } from '../studio/gate.ts';
import { cardDescription } from '../studio/infoPanel.ts';
import { BackendError, componentReadOf, drawnFrame } from '../studio/liveBackend.ts';
import { formatPeriod } from '../studio/period.ts';
import { problem, type ProblemStatus } from '../proxy/problem.ts';
import {
    drawSlotCard,
    type PageCard,
    REQUEST_REFUSALS,
    shownPageCards,
} from '../studio/slotCards.ts';
import { DFO_ORGANIZATION, SITE_NAME, SITE_ORIGIN } from '../site.ts';
import { artifactPath, type LibraryArtifact } from './artifact.ts';

const REVALIDATE_SECONDS = 300;

// The share read, then its slots in waves of `READ_CONCURRENCY` reads, so a
// canvas of nine data cards takes the share read and three waves. A slot
// read can start dfo-apis' check of a live slot for newer data, its slow
// path. The page gives the whole read 1.5 s and renders without the tables
// after that.
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
 * What one card of a share draws, as dfo-apis serves its slot: the card's
 * payload id, the slot, the frame the card is drawn on (null when the read
 * names none), the plotted rows and what the card says about them. Plain
 * JSON, so the cache can hold it.
 */
export type SlotChart = {
    id: string;
    // The card's place among the cards the page shows, from 1.
    position: number;
    slot: number;
    frame: FrameRef | null;
    title: string;
    measure: string | null;
    // When the card's data last changed, as an ISO 8601 date or time, or null
    // when nothing says.
    dateModified: string | null;
    rows: Row[];
    seriesHeading: 'Country' | 'Series';
    sources: { name: string; url: string | null; licence: string | null }[];
};

/** A refusal of the share (`card` null) or of one card's slot that a later
 *  read will not change. */
export type SlotRefusal = { card: string | null; status: number | undefined; code: string };

/**
 * The cards of a share that draw rows, in the order its page shows them, the
 * permanent refusals met on the way, and whether the share is a card share
 * (`single`), whose one chart stands for the whole artifact. Plain JSON, so
 * the cache can hold it.
 */
export type SlotCharts = { charts: SlotChart[]; refused: SlotRefusal[]; single: boolean };

export type LibraryChartData = {
    id: string;
    // The chart's name, which the page shows beside its table when it shows
    // more than one; null otherwise.
    label: string | null;
    rows: Row[];
    seriesHeading: SlotChart['seriesHeading'];
    periodHeading: 'Year' | 'Period';
    window: { start: string; end: string };
    // The page's download link, pinned to the frame the rows are drawn on.
    // The Dataset block names the unpinned address, since a live share's
    // older frames go.
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

// When a card's data last changed: a legacy card's `last_refreshed`, else
// the date its description says its version was prepared or computed, else,
// for a snapshot, whose slots keep their frames, the day the share was made.
// A live slot's own date would take a read of the share's history, which
// the page does not make.
const refreshedOf = (
    info: Parameters<typeof cardDataDates>[0],
    description: ReturnType<typeof cardDescription> | undefined,
    share: ShareRecord,
): string | null =>
    [
        cardDataDates(info).lastRefreshed,
        description?.freshness.prepared,
        description?.freshness.computed,
        share.mode === 'snapshot' ? share.createdAt : null,
    ].find((date): date is string => typeof date === 'string' && ISO_DATE.test(date)) ?? null;

// The rows card `page` of `share` draws, or null when the view the embed
// shows (`resolveCardView` with the view the share saved) draws none, as a
// key number's does not, or the card holds no value.
const slotChartOf = async (
    shares: SharesBackend,
    share: ShareRecord,
    page: PageCard,
    position: number,
): Promise<SlotChart | null> => {
    if (!page.ref || page.slot === null) {
        return null;
    }

    const { body } = await readSlotCard(shares, share.id, page.slot);
    const widget = body && drawSlotCard(page.held, body);

    if (!body || !widget || widget.kind === 'text' || !widget.data) {
        return null;
    }

    const { view } = resolveCardView(widget, savedView(share.payload, page.id));

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
        id: page.id,
        position,
        slot: page.slot,
        frame: drawnFrame(componentReadOf(body).card),
        title: savedTitle(share.payload, page.id) ?? widgetTitle(widget),
        measure: description?.about.measure?.label ?? null,
        dateModified: refreshedOf(widget.info, description, share),
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

/**
 * The rows each card a card or canvas share shows draws, read from dfo-apis.
 * The cards are the ones its page shows (`shownPageCards`): a card share's
 * one card, and every card a canvas shows. A chart, a table, and either one
 * saved in the other's view draw rows; a key number and a note draw none. A
 * refusal a later read will not change (the share or slot gone, a card
 * dfo-apis cannot draw, an answer outside its shape) is kept in `refused`,
 * so the cache keeps it. Any other failed read, a refusal dfo-apis marks
 * `retryable` included, throws its `SharesError` or `BackendError`, so the
 * whole read fails and the cache keeps its last good entry.
 */
export const readSlotCharts = async (
    shares: SharesBackend,
    shareId: string,
): Promise<SlotCharts> => {
    let share: ShareRecord | null;

    try {
        share = await readShare(shares, shareId);
    } catch (error) {
        const refusal = permanentRefusal(error, null);

        if (refusal) {
            return { charts: [], refused: [refusal], single: true };
        }

        throw error;
    }

    if (share?.kind !== 'card' && share?.kind !== 'canvas') {
        return { charts: [], refused: [], single: true };
    }

    const record = share;
    const gate = gateOf(READ_CONCURRENCY);
    const cards = await Promise.all(
        shownPageCards(record).map(async (page, index) => {
            try {
                return { chart: await gate(() => slotChartOf(shares, record, page, index + 1)) };
            } catch (error) {
                const refusal = permanentRefusal(error, page.id);

                if (refusal) {
                    return { refusal };
                }

                throw error;
            }
        }),
    );

    return {
        charts: cards.flatMap(({ chart }) => chart ?? []),
        refused: cards.flatMap(({ refusal }) => refusal ?? []),
        single: record.kind === 'card',
    };
};

/** The cache tag of a share's entry, which a take-down revalidates. */
export const libraryShareTag = (shareId: string): string => `library-share:${shareId}`;

/**
 * `readSlotCharts`, cached per share under `libraryShareTag` for
 * `REVALIDATE_SECONDS`, the lifetime of the link-preview image. The cache is
 * stale-while-revalidate: the first request after an entry expires is
 * served the old entry and starts a read, and later requests get that
 * read's answer, so a change shows after five minutes and one more view. A
 * failed read throws, stores nothing and leaves the old entry in place, so
 * a transient fault keeps the last good rows; a refusal that will not change
 * is stored (`readSlotCharts`). Taking the share down revalidates the tag.
 * The reads name the caller of the request that fills the entry.
 */
export const cachedSlotCharts = (backend: SharesBackend, shareId: string): Promise<SlotCharts> =>
    unstable_cache(
        (id: string) =>
            readSlotCharts({ ...backend, signal: AbortSignal.timeout(FILL_DEADLINE_MS) }, id),
        ['library-slot-charts'],
        { revalidate: REVALIDATE_SECONDS, tags: [libraryShareTag(shareId)] },
    )(shareId);

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
 * enough for a Dataset; else one built from the chart: the measure, the
 * places or series, the period, the sources and the artifact's title. Either
 * is clipped to `DESCRIPTION_MAX`. Each chart of a canvas gets its own built
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

// A frame as the CSV route's `frame` query names it.
const frameKey = ({ spec_id, content_version }: FrameRef): string =>
    `${spec_id}@${content_version}`;

/**
 * The CSV route's address for `chart`: the bare `data.csv` for an artifact of
 * one chart, and `data.csv?card=<id>` for each chart of an artifact with
 * more. With `pinned`, it also names the frame the rows are drawn on.
 */
const csvHrefOf = (
    slug: string,
    chart: SlotChart,
    { single, pinned }: { single: boolean; pinned: boolean },
): string => {
    const query = new URLSearchParams({
        ...(single ? {} : { card: chart.id }),
        ...(pinned && chart.frame ? { frame: frameKey(chart.frame) } : {}),
    });

    return `${artifactPath(slug)}/data.csv${query.size ? `?${query}` : ''}`;
};

/**
 * The table and Dataset block of a Library chart drawn from `chart`. The
 * chart of a card share (`single`) names its Dataset by the artifact's
 * title. Each chart of a canvas is named by its own title, or by the
 * artifact's title and its place on the page when it has none. With
 * `labelled`, the table carries that name too.
 */
export const chartDataOf = (
    chart: SlotChart,
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
    const csvHref = csvHrefOf(artifact.slug, chart, { single, pinned: true });
    const datasetCsv = csvHrefOf(artifact.slug, chart, { single, pinned: false });
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
                contentUrl: new URL(datasetCsv, origin).href,
            },
        },
    };
};

/**
 * The table and Dataset block of each chart a Library artifact shows, on the
 * frames its public slots serve, in page order: none when no card draws
 * rows, the read fails, or it is not done in `deadlineMs`. A read that
 * misses the deadline goes on to fill the cache, and `waitUntil` receives it
 * so the server keeps running it after the response.
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
    const unavailable = (code: string) => {
        console.warn('library_chart_data_unavailable', { share: artifact.shareId, code });

        return [];
    };
    const read = cachedSlotCharts(backend, artifact.shareId);
    const settled = read.catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((resolve) => {
        timer = setTimeout(resolve, deadlineMs, 'late');
    });

    try {
        const answer = await Promise.race([read, late]);

        if (answer === 'late') {
            waitUntil?.(settled);

            return unavailable('page_deadline');
        }

        const { single } = answer;
        const labelled = answer.charts.length > 1;

        return answer.charts.flatMap(
            (chart) => chartDataOf(chart, artifact, origin, { single, labelled }) ?? [],
        );
    } catch (error) {
        if (!isReadFailure(error)) {
            throw error;
        }

        return unavailable(error.code);
    } finally {
        clearTimeout(timer);
    }
};

type Failure = Pick<SharesError, 'code' | 'retryable'> & {
    status?: number;
    retryAfterS?: number;
};

/**
 * The CSV route's answer to a failed read: a refusal
 * dfo-apis made of the request itself (`REQUEST_REFUSALS`, as the share
 * download maps them) under its own status, a 429 with its `Retry-After`,
 * and 502 for any other fault.
 */
export const readFailureResponse = ({
    code,
    status,
    retryable,
    retryAfterS,
}: Failure): Response => {
    const answer =
        status === 429 ? 429 : (REQUEST_REFUSALS.find((refusal) => refusal === status) ?? 502);

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

// The statuses a stored refusal answers under as dfo-apis gave them. Any
// other, as `backend_invalid` (an answer outside dfo-apis' shape, with no
// status) is, answers 404 `not_found`: the card has no data to serve.
const STORED_REFUSALS = [...REQUEST_REFUSALS, 410] as const satisfies readonly ProblemStatus[];

// The CSV route's answer to a refusal the cache holds.
const storedRefusalResponse = ({ status, code }: SlotRefusal): Response => {
    const answer = STORED_REFUSALS.find((refusal) => refusal === status);

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

// A CSV cell for a label, guarded against running as a formula (`toCsv`).
const textCell = (text: string): string => toCsv([[text]]);

/** The rows of `chart` as the page's table shows them, as CSV: its four
 *  columns under the table's headings, one line per row, lines ending CRLF. */
export const chartCsv = (chart: SlotChart): string => {
    const lines = [
        [chart.seriesHeading, periodHeadingOf(chart.rows), 'Value', 'Unit'].join(','),
        ...chart.rows.map(({ series, period, value, unit }) =>
            [textCell(series), textCell(period), String(value), textCell(unit ?? '')].join(','),
        ),
    ];

    return `${lines.join('\r\n')}\r\n`;
};

const frameChanged = (): Response =>
    problem({
        status: 409,
        code: 'frame_changed',
        detail: 'The card shows newer data than this link names. Reload the page for its link.',
        retryable: false,
        headers: { 'Cache-Control': 'no-store' },
    });

/**
 * `GET /library/<slug>/data.csv?card=&frame=`, for a published artifact: the
 * rows of chart `card` (the first chart when `card` is null) from the
 * share's cached entry (`cachedSlotCharts`), the entry the page draws its
 * tables from, so the file holds the rows the page shows. The page's link
 * names the frame those rows are drawn on (`frame`), and when the entry has
 * moved to another frame since, the link answers 409 `frame_changed`
 * instead of a file of other rows. A request without `frame` gets the rows
 * the page shows now. A read that fails
 * answers as `readFailureResponse` maps it, a 429 with its `Retry-After`
 * among them. A card the entry holds as refused, or a share refused whole,
 * answers that refusal's status when it is 400, 404, 410 or 422, and 404
 * `not_found` otherwise (`storedRefusalResponse`). The file's
 * `Link` header names the artifact's page as the address to cite. Any other
 * card, and an artifact with no chart, is 404. An open Library's file is
 * cached publicly for five minutes; an admin's preview is not stored.
 */
export const libraryCsvResponse = async (
    backend: SharesBackend,
    artifact: Pick<LibraryArtifact, 'slug' | 'shareId'>,
    { card, frame, open }: { card: string | null; frame: string | null; open: boolean },
): Promise<Response> => {
    let read: SlotCharts;

    try {
        read = await cachedSlotCharts(backend, artifact.shareId);
    } catch (error) {
        if (!isReadFailure(error)) {
            throw error;
        }

        return readFailureResponse(error);
    }

    const chart = card === null ? read.charts[0] : read.charts.find(({ id }) => id === card);

    if (!chart) {
        const refusal = read.refused.find(
            (refused) => card === null || refused.card === null || refused.card === card,
        );

        return refusal ? storedRefusalResponse(refusal) : noData();
    }

    if (frame !== null && (chart.frame === null || frameKey(chart.frame) !== frame)) {
        return frameChanged();
    }

    const name = read.single ? artifact.slug : `${artifact.slug}-${chart.position}`;

    return new Response(chartCsv(chart), {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${name}.csv"`,
            'Cache-Control': open ? OPEN_CACHE : 'no-store',
            Link: `<${new URL(artifactPath(artifact.slug), SITE_ORIGIN).href}>; rel="cite-as"`,
        },
    });
};
