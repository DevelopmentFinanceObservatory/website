import { readShare, readSlotCard, SharesError, type SharesBackend } from '../chat/apisShares.ts';
import { sharedCardDataUrl } from '../studio/cardDownload.ts';
import { cardDescription } from '../studio/infoPanel.ts';
import { BackendError } from '../studio/liveBackend.ts';
import { drawSlotCard, pageCards } from '../studio/slotCards.ts';
import { artifactPath, type LibraryArtifact } from './artifact.ts';

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

export type LibraryChartData = {
    rows: Row[];
    seriesHeading: 'Country' | 'Series';
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

/** The rows a Library chart draws on the frame its public slot serves. */
export const libraryChartData = async (
    backend: SharesBackend,
    artifact: ChartArtifact,
    origin: string,
): Promise<LibraryChartData | null> => {
    const shares = { ...backend, signal: AbortSignal.timeout(4_000) };

    try {
        const share = await readShare(shares, artifact.shareId);

        if (share?.kind !== 'card') {
            return null;
        }

        const [page] = pageCards(share);

        if (!page?.ref || page.slot === null) {
            return null;
        }

        const { body } = await readSlotCard(shares, share.id, page.slot);
        const widget = body && drawSlotCard(page.held, body);

        if (widget?.kind !== 'chart' || !widget.data) {
            return null;
        }

        const rows = widget.data.rows.flatMap(([series, period, value, unit]) =>
            typeof series === 'string' &&
            typeof period === 'string' &&
            typeof value === 'number' &&
            Number.isFinite(value)
                ? [{ series, period, value, unit: typeof unit === 'string' ? unit : null }]
                : [],
        );

        const [first, ...rest] = rows;

        if (!first) {
            return null;
        }

        const description = widget.info && cardDescription(widget.info);
        const dimensions = description?.about.drawn?.dimensions ?? [];
        const countries = new Set(
            dimensions
                .flatMap(({ values }) => values ?? [])
                .filter(({ ref }) => /^(?:dcid:)?country\//.test(ref))
                .map(({ label }) => label.toLowerCase()),
        );
        const seriesHeading = rows.every(({ series }) => countries.has(series.toLowerCase()))
            ? 'Country'
            : 'Series';
        const periodHeading = rows.every(({ period }) => /^\d{4}$/.test(period))
            ? 'Year'
            : 'Period';
        const window = windowOf(first, rest);
        const start = monthBound(window.start, false);
        const end = monthBound(window.end, true);
        const csvHref = sharedCardDataUrl(
            { shareId: share.id, cardId: page.id, slot: page.slot },
            { format: 'csv', bundle: false },
        );
        const storedSources = new Map(artifact.sources.map(({ name, url }) => [name, url]));
        const sources: Source[] = (
            widget.info?.sources?.length
                ? widget.info.sources
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

        return {
            rows,
            seriesHeading,
            periodHeading,
            window,
            csvHref,
            dataset: {
                '@context': 'https://schema.org',
                '@type': 'Dataset',
                name: artifact.title,
                description: artifact.description,
                url: new URL(artifactPath(artifact.slug), origin).href,
                temporalCoverage: start === end ? start : `${start}/${end}`,
                variableMeasured: description?.about.measure?.label ?? widget.title,
                isBasedOn: sources.length ? sources : undefined,
                license: sources.length === 1 ? source.license : undefined,
                distribution: {
                    '@type': 'DataDownload',
                    encodingFormat: 'text/csv',
                    contentUrl: new URL(csvHref, origin).href,
                },
            },
        };
    } catch (error) {
        if (!(error instanceof SharesError || error instanceof BackendError)) {
            throw error;
        }

        console.warn('library_chart_data_unavailable', {
            share: artifact.shareId,
            code: error.code,
        });

        return null;
    }
};
