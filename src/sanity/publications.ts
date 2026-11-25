import type { PublicationCard } from '@/components/organisms/Publications/Publications';
import type { PUBLICATIONS_QUERY_RESULT } from '@/sanity/sanity.types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Twice the 280 px cover slot. The Sanity CDN serves SVG covers unchanged and
// scales raster covers down to this width in the best format the browser takes.
const COVER_PARAMS = 'w=560&fit=max&auto=format';

const httpsUrl = (value: string | null): string | null => {
    if (!value) {
        return null;
    }

    try {
        return new URL(value).protocol === 'https:' ? value : null;
    } catch {
        return null;
    }
};

/**
 * The publications the page can render. Studio enforces the schema's
 * required fields and formats, but documents written through the API skip
 * those checks, so a document without a title, byline, ISO date or cover is
 * left out with a warning, and a report URL other than https is dropped.
 */
export const toPublicationCards = (results: PUBLICATIONS_QUERY_RESULT): PublicationCard[] =>
    results.flatMap(({ id, title, byline, publishedAt, abstract, reportUrl, coverSrc }) => {
        if (!title || !byline || !publishedAt || !ISO_DATE.test(publishedAt) || !coverSrc) {
            console.warn('publications: a document lacks a required field and is left out', {
                id,
                title: Boolean(title),
                byline: Boolean(byline),
                publishedAt,
                cover: Boolean(coverSrc),
            });

            return [];
        }

        return [
            {
                id,
                title,
                byline,
                publishedAt,
                abstract: abstract ?? '',
                reportUrl: httpsUrl(reportUrl),
                coverSrc: `${coverSrc}?${COVER_PARAMS}`,
            },
        ];
    });
