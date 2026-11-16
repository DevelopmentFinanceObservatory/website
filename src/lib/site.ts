import type { Metadata } from 'next';

/**
 * The production origin. Dev and production build the same metadata, link
 * previews and sitemap, so no build-time variable sets it.
 */
export const SITE_ORIGIN = 'https://developmentfinance.org';

export const SITE_NAME = 'Development Finance Observatory';

// The website leaves NEXT_PUBLIC_SITE_LINK_ORIGIN unset. The prototypes app
// (prototypes/next.config.ts) sets it to the production origin, because
// next/link and the router would prefix its basePath, /prototypes, to a
// root-relative path.
const SITE_LINK_ORIGIN = process.env.NEXT_PUBLIC_SITE_LINK_ORIGIN ?? '';

/**
 * Whether this build is the website itself. False in the prototypes app,
 * where usePathname() names a prototypes page, so no site menu entry is
 * current there, and a site page is a full page load away.
 */
export const IS_SITE = SITE_LINK_ORIGIN === '';

/**
 * A link to a page of the main site: the path unchanged on the website, the
 * absolute URL in the prototypes app.
 */
export const siteHref = (path: string): string => SITE_LINK_ORIGIN + path;

/** The size and type of every link-preview card the site draws. */
export const CARD_SIZE = { width: 1200, height: 630 };
export const CARD_TYPE = 'image/png';

type Card = { url: string; width: number; height: number; type: string; alt?: string };

/** The site's own card, drawn by app/opengraph-image.tsx. */
export const SITE_CARD: Card = {
    url: '/opengraph-image',
    ...CARD_SIZE,
    type: CARD_TYPE,
    alt: 'Development Finance Observatory: Development Finance Data. Simplified.',
};

/**
 * Next suffixes a metadata image under a route group with a hash of its
 * parent path, so the gallery item card's address carries one.
 * src/lib/test/crawl.test.ts checks it against Next's own.
 */
const GALLERY_CARD_SUFFIX = '1pc5v7';

/** A gallery item's own card, drawn by
 *  app/(studio)/insights/gallery/[slug]/opengraph-image.tsx. */
export const galleryCard = (slug: string): Card => ({
    url: `/insights/gallery/${slug}/opengraph-image-${GALLERY_CARD_SUFFIX}`,
    ...CARD_SIZE,
    type: CARD_TYPE,
});

/**
 * The Open Graph tags of a page that names itself. Next replaces a
 * segment's `openGraph` whole, so a page that sets one would drop the root
 * layout's site name and card; these keep the site name and show `image`,
 * the site's card unless the page names another. A route with an
 * `opengraph-image` file of its own passes null, since Next reads the file
 * only when the page's `openGraph` has no `images`.
 */
export const pageOpenGraph = ({
    title,
    description,
    image = SITE_CARD,
}: {
    title: string;
    description: string;
    image?: Card | null;
}): NonNullable<Metadata['openGraph']> => ({
    type: 'article',
    siteName: SITE_NAME,
    title,
    description,
    ...(image && { images: image }),
});
