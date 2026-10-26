/**
 * What search engines may index. A crawler reads `noindex` only on a URL
 * robots.txt lets it fetch, so these routes stay open to crawlers (app/robots.ts)
 * and say `noindex` themselves. No runtime imports, so next.config.ts and
 * `node --test` can load it.
 */
import type { Metadata } from 'next';

import type { GalleryItem } from '@/components/organisms/Gallery/galleryData';

/**
 * The routes kept out of search results, each with everything under it:
 * share and embed links are unlisted by design (anyone with the link can
 * read them, nobody should find them in a search), and the Studio, history
 * and sign-in pages are a person's own.
 */
export const NOINDEX_ROUTES = ['/s', '/embed', '/studio', '/history', '/login', '/register'];

/**
 * next.config.ts `headers()`: `X-Robots-Tag` on every response from a
 * noindex route, so its redirects, 404s and error pages say noindex too,
 * and a page whose metadata streams into `<body>` says it in the headers.
 */
export const noindexHeaders = () =>
    NOINDEX_ROUTES.map((route) => ({
        source: `${route}/:path*`,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }));

const NOINDEX: Metadata['robots'] = { index: false, follow: false };

/**
 * The robots metadata for /data. A version link (?spec=) is unlisted: one
 * page per dataset version is nothing to list. A search share (?share=, where
 * `/s/<id>` sends one) is unlisted unless a gallery item opens it, so a
 * curated search is found the way the rest of the gallery is.
 */
export const dataPageRobots = (
    query: Record<string, string | string[] | undefined>,
    gallery: readonly GalleryItem[],
): Metadata['robots'] => {
    const { spec, share } = query;

    if (spec !== undefined) {
        return NOINDEX;
    }

    if (share === undefined) {
        return undefined;
    }

    const curated = gallery.some((item) => item.kind === 'dataset' && item.sharedFrom === share);

    return curated ? undefined : NOINDEX;
};
