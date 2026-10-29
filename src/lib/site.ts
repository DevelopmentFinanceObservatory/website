import type { Metadata } from 'next';

/**
 * The production origin. Dev and production build the same metadata, link
 * previews and sitemap, so no build-time variable sets it.
 */
export const SITE_ORIGIN = 'https://developmentfinance.org';

export const SITE_NAME = 'Development Finance Observatory';

/** The site's own link-preview card, drawn by app/opengraph-image.tsx. */
export const SITE_CARD = '/opengraph-image';

/**
 * The Open Graph tags of a page that names itself. Next replaces a
 * segment's `openGraph` whole, so a page that sets one would drop the root
 * layout's site name and card; these keep both. A route with an
 * `opengraph-image` file of its own passes `ownCard`, since Next reads the
 * file only when the page's `openGraph` has no `images`.
 */
export const pageOpenGraph = ({
    title,
    description,
    ownCard = false,
}: {
    title: string;
    description: string;
    ownCard?: boolean;
}): NonNullable<Metadata['openGraph']> => ({
    type: 'article',
    siteName: SITE_NAME,
    title,
    description,
    ...(!ownCard && { images: SITE_CARD }),
});
