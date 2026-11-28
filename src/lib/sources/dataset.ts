/**
 * A source page's schema.org `Dataset` block, built from the documentation
 * the page shows. Each property comes from a field of the document, and a
 * field the document leaves empty leaves its property out.
 *
 * No `@/` imports, so `node --test` can load it.
 */

import { DFO_ORGANIZATION, SITE_NAME, SITE_ORIGIN } from '../site.ts';
import {
    clip,
    DESCRIPTION_MAX,
    DESCRIPTION_MIN,
    httpUrl,
    type Licence,
    licenceOf,
} from '../structuredData.ts';

import type { SourceDoc } from './graph.ts';
import { cleanDcid } from './url.ts';

type Organization = { '@type': 'Organization'; name: string };

export type SourceDataset = {
    '@context': 'https://schema.org';
    '@type': 'Dataset';
    name: string;
    description: string;
    url: string;
    sameAs?: string;
    creator?: Organization;
    publisher?: Organization;
    citation?: string;
    license?: Licence | string[];
    dateModified?: string;
    temporalCoverage?: string;
    spatialCoverage?: { '@type': 'Place'; name: string }[];
    includedInDataCatalog: {
        '@type': 'DataCatalog';
        name: string;
        url: string;
        publisher: typeof DFO_ORGANIZATION;
    };
    distribution?: { '@type': 'DataDownload'; contentUrl: string }[];
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/;

// An ISO date or datetime whose day exists in the calendar.
const isCalendarDate = (value: string): boolean => {
    const match = value.match(ISO_DATE);

    if (!match) {
        return false;
    }

    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// "1970-2033" or "2021": the forms the graph writes years covered in.
const YEARS = /^(\d{4})(?:\s*[-–]\s*(\d{4}))?$/;

// The graph joins several URLs in one field with commas, and a URL can hold
// a comma of its own (an SDMX query), so a list splits only where the next
// URL starts.
const httpUrls = (value: string | null | undefined): string[] =>
    (value ?? '')
        .split(/,(?=\s*https?:)/i)
        .map((part) => httpUrl(part.trim()))
        .filter((url): url is string => !!url);

// An ISO 8601 interval for the years covered, or nothing for another form.
const temporalCoverageOf = (years: string | null): string | undefined => {
    const match = years?.trim().match(YEARS);

    if (match) {
        return match[2] && match[2] !== match[1] ? `${match[1]}/${match[2]}` : match[1];
    }
};

const licenceOfDoc = ({ license }: SourceDoc): Licence | string[] | undefined => {
    const urls = httpUrls(license.url);

    return urls.length > 1 ? urls : (urls[0] ?? licenceOf(license.type));
};

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * The source's own description when it is long enough for a Dataset.
 * Otherwise a sentence built from its name, publisher and years covered,
 * followed by the short description when there is one. Either is clipped to
 * `DESCRIPTION_MAX`.
 */
const descriptionOf = (name: string, publisher: string | null, doc: SourceDoc): string => {
    const own = doc.details.description?.trim() ?? '';

    if (own.length >= DESCRIPTION_MIN) {
        return clip(own, DESCRIPTION_MAX);
    }

    const years = doc.scope_and_units.years_covered?.trim();
    const by = publisher && publisher !== name ? `, published by ${publisher}` : '';
    const sentences = [
        `${name}${by}${years ? `, covering ${years}` : ''}.`,
        ...(own ? [sentence(own)] : []),
        `A data source in the ${SITE_NAME} catalogue.`,
    ];

    return clip(sentences.join(' '), DESCRIPTION_MAX);
};

/**
 * The Dataset block of the source `dcid`, or null when its document has no
 * name, which Google requires.
 */
export const sourceDataset = (dcid: string, doc: SourceDoc): SourceDataset | null => {
    const { details, license, scope_and_units: scope } = doc;
    const name = details.name_of_source?.trim();

    if (!name) {
        return null;
    }

    // The publisher the page shows: the origin registry's name, else the graph's.
    const publisherName = (details.source?.label ?? details.publisher)?.trim() || null;
    const publisher: Organization | undefined = publisherName
        ? { '@type': 'Organization', name: publisherName }
        : undefined;
    const sameAs = httpUrl(details.source_url);
    // Many sources give their web page as the data URL too. That page is
    // the publisher's site, so it is the Dataset's sameAs and no download.
    const downloads = httpUrls(details.source_data_url).filter((url) => url !== sameAs);
    const lastUpdate = license.last_update?.trim();

    return {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name,
        description: descriptionOf(name, publisherName, doc),
        url: new URL(`/data/sources/${cleanDcid(dcid)}`, SITE_ORIGIN).href,
        sameAs,
        creator: publisher,
        publisher,
        citation: details.citation?.trim() || undefined,
        license: licenceOfDoc(doc),
        dateModified: lastUpdate && isCalendarDate(lastUpdate) ? lastUpdate : undefined,
        temporalCoverage: temporalCoverageOf(scope.years_covered),
        spatialCoverage: scope.countries.length
            ? scope.countries.map((country) => ({ '@type': 'Place', name: country }))
            : undefined,
        includedInDataCatalog: {
            '@type': 'DataCatalog',
            name: `${SITE_NAME} data sources`,
            url: new URL('/data/sources', SITE_ORIGIN).href,
            publisher: DFO_ORGANIZATION,
        },
        distribution: downloads.length
            ? downloads.map((contentUrl) => ({ '@type': 'DataDownload', contentUrl }))
            : undefined,
    };
};
