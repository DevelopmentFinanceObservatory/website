/**
 * The values a Library chart or table card draws, for the artifact page's own
 * HTML (a table and a schema.org `Dataset` block) and its CSV route
 * (`/library/<slug>/data.csv`).
 *
 * The share's record and slot are read once per share and cached
 * (`cachedSlotChart`). The page waits `PAGE_DEADLINE_MS` for the read and
 * renders without the table after that, while the read runs on for up to
 * `FILL_DEADLINE_MS` to fill the cache for the next request.
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
import { readShare, readSlotCard, SharesError, type SharesBackend } from '../chat/apisShares.ts';
import type { CardData } from '../chat/widgets.ts';
import { cardDescription } from '../studio/infoPanel.ts';
import { BackendError } from '../studio/liveBackend.ts';
import { formatPeriod } from '../studio/period.ts';
import { problem } from '../proxy/problem.ts';
import { drawSlotCard, pageCards, REQUEST_REFUSALS } from '../studio/slotCards.ts';
import { artifactPath, type LibraryArtifact } from './artifact.ts';

const REVALIDATE_SECONDS = 300;

// Two dfo-apis calls in a row, the share and its slot. A slot read can
// start dfo-apis' check of a live slot for newer data, its slow path, so
// the page gives both 1.5 s and renders without the table after that.
const PAGE_DEADLINE_MS = 1_500;

// How long a read that missed the page's deadline may run on to fill the
// cache.
const FILL_DEADLINE_MS = 10_000;

// Google reads a Dataset description of 50 to 5,000 characters.
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 5_000;

// dfo-apis statuses that say the share or its slot is gone or cannot be
// drawn, which a later read will not change.
const PERMANENT_STATUSES = new Set([404, 410, 422]);

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
    isBasedOn?: Source[];
    license?: Licence;
    distribution: { '@type': 'DataDownload'; encodingFormat: 'text/csv'; contentUrl: string };
};

/**
 * What a share's one card draws, as dfo-apis serves its slot: the
 * slot, the plotted rows and what the card says about them. Plain JSON, so
 * the cache can hold it.
 */
export type SlotChart = {
    slot: number;
    title: string;
    measure: string | null;
    rows: Row[];
    seriesHeading: 'Country' | 'Series';
    sources: { name: string; url: string | null; licence: string | null }[];
};

export type LibraryChartData = {
    rows: Row[];
    seriesHeading: SlotChart['seriesHeading'];
    periodHeading: 'Year' | 'Period';
    window: { start: string; end: string };
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

/**
 * The rows the share's one card draws, read from dfo-apis, or null when the
 * share is not a one-card share, the view the embed shows (`resolveCardView`
 * with the view the share saved) draws no rows, as a key number's does not,
 * or the card holds no value. A chart, a table, and either one saved in the
 * other's view all draw rows. A refusal a later read will not change (the
 * share or slot gone, a card dfo-apis cannot draw, an answer outside its
 * shape) also reads as null, so the cache keeps it. Any other failed read
 * throws its `SharesError` or `BackendError`.
 */
export const readSlotChart = async (
    shares: SharesBackend,
    shareId: string,
): Promise<SlotChart | null> => {
    try {
        return await slotChartOf(shares, shareId);
    } catch (error) {
        if (isReadFailure(error) && isPermanent(error)) {
            return null;
        }

        throw error;
    }
};

/** Whether `error` is a failed dfo-apis read, which `code` names. */
export const isReadFailure = (error: unknown): error is SharesError | BackendError =>
    error instanceof SharesError || error instanceof BackendError;

const isPermanent = (error: SharesError | BackendError): boolean =>
    error.code === 'backend_invalid' ||
    (error.status !== undefined && PERMANENT_STATUSES.has(error.status));

const slotChartOf = async (shares: SharesBackend, shareId: string): Promise<SlotChart | null> => {
    const share = await readShare(shares, shareId);

    if (share?.kind !== 'card') {
        return null;
    }

    const [page] = pageCards(share);

    if (!page?.ref || page.slot === null) {
        return null;
    }

    const { body } = await readSlotCard(shares, share.id, page.slot);
    const widget = body && drawSlotCard(page.held, body);

    if (!widget || widget.kind === 'text' || !widget.data) {
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
        slot: page.slot,
        title: savedTitle(share.payload, page.id) ?? widgetTitle(widget),
        measure: description?.about.measure?.label ?? null,
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

/** The cache tag of a share's entry, which a take-down revalidates. */
export const libraryShareTag = (shareId: string): string => `library-share:${shareId}`;

/**
 * `readSlotChart`, cached per share under `libraryShareTag` for
 * `REVALIDATE_SECONDS`, the lifetime of the link-preview image. The cache is
 * stale-while-revalidate: the first request after an entry expires is
 * served the old entry and starts a read, and later requests get that
 * read's answer, so a change shows after five minutes and one more view. A
 * failed read throws, stores nothing and leaves the old entry in place, so
 * a transient fault keeps the last good rows; a refusal that will not change
 * stores null (`readSlotChart`). Taking the share down revalidates the tag.
 * The reads name the caller of the request that fills the entry.
 */
export const cachedSlotChart = (
    backend: SharesBackend,
    shareId: string,
): Promise<SlotChart | null> =>
    unstable_cache(
        (id: string) =>
            readSlotChart({ ...backend, signal: AbortSignal.timeout(FILL_DEADLINE_MS) }, id),
        ['library-slot-chart'],
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

/**
 * The Library description when it is long enough for a Dataset, else one
 * built from the chart: the measure, the places or series, the period, the
 * sources and the artifact's title. Either is clipped to `DESCRIPTION_MAX`.
 */
const datasetDescription = (
    artifact: ChartArtifact,
    chart: SlotChart,
    measure: string,
    window: LibraryChartData['window'],
    sources: readonly Source[],
): string => {
    const own = artifact.description.trim();

    if (own.length >= DESCRIPTION_MIN) {
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

/** The table and Dataset block of a Library chart drawn from `chart`. */
export const chartDataOf = (
    chart: SlotChart,
    artifact: ChartArtifact,
    origin: string,
): LibraryChartData | null => {
    const [first, ...rest] = chart.rows;

    if (!first) {
        return null;
    }

    const { rows } = chart;
    const periodHeading = rows.every(({ period }) => /^\d{4}$/.test(period)) ? 'Year' : 'Period';
    const window = windowOf(first, rest);
    const start = monthBound(window.start, false);
    const end = monthBound(window.end, true);
    const csvHref = `${artifactPath(artifact.slug)}/data.csv`;
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
    const measure = chart.measure?.trim() || chart.title;

    return {
        rows,
        seriesHeading: chart.seriesHeading,
        periodHeading,
        window,
        csvHref,
        dataset: {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: artifact.title,
            description: datasetDescription(artifact, chart, measure, window, sources),
            url: new URL(artifactPath(artifact.slug), origin).href,
            temporalCoverage: start === end ? start : `${start}/${end}`,
            variableMeasured: measure,
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
 * The rows a Library chart draws on the frame its public slot serves, or
 * null when there are none to show, the read fails, or it is not done in
 * `deadlineMs`. A read that misses the deadline goes on to fill the cache,
 * and `waitUntil` receives it so the server keeps running it after the
 * response.
 */
export const libraryChartData = async (
    backend: SharesBackend,
    artifact: ChartArtifact,
    origin: string,
    {
        deadlineMs = PAGE_DEADLINE_MS,
        waitUntil,
    }: { deadlineMs?: number; waitUntil?: (pending: Promise<unknown>) => void } = {},
): Promise<LibraryChartData | null> => {
    const unavailable = (code: string) => {
        console.warn('library_chart_data_unavailable', { share: artifact.shareId, code });

        return null;
    };
    const read = cachedSlotChart(backend, artifact.shareId);
    const settled = read.catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((resolve) => {
        timer = setTimeout(resolve, deadlineMs, 'late');
    });

    try {
        const chart = await Promise.race([read, late]);

        if (chart === 'late') {
            waitUntil?.(settled);

            return unavailable('page_deadline');
        }

        return chart && chartDataOf(chart, artifact, origin);
    } catch (error) {
        if (!isReadFailure(error)) {
            throw error;
        }

        return unavailable(error.code);
    } finally {
        clearTimeout(timer);
    }
};

/**
 * The CSV route's answer to a failed read: a refusal dfo-apis made of the
 * request itself (`REQUEST_REFUSALS`, as the share download maps them) under
 * its own status, a 429 with its `Retry-After`, and 502 for any other fault.
 */
export const readFailureResponse = (error: SharesError | BackendError): Response => {
    const retryAfterS = error instanceof SharesError ? error.retryAfterS : undefined;
    const status =
        error.status === 429
            ? 429
            : (REQUEST_REFUSALS.find((code) => code === error.status) ?? 502);

    return problem({
        status,
        code: error.code,
        detail: 'The card has no data file to serve.',
        retryable: error.retryable,
        headers: {
            'Cache-Control': 'no-store',
            ...(status === 429 && retryAfterS !== undefined
                ? { 'Retry-After': String(retryAfterS) }
                : {}),
        },
    });
};
