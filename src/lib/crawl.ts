/**
 * What search engines may index. A crawler reads `noindex` only on a URL
 * robots.txt lets it fetch, so these routes stay open to crawlers (app/robots.ts)
 * and say `noindex` themselves. Its one runtime import, lib/site.ts, has
 * none of its own, so next.config.ts and `node --test` can load it.
 */
import type { Metadata } from 'next';

import type { GalleryItem } from '@/components/organisms/Gallery/galleryData';

import { galleryCard, pageOpenGraph } from './site.ts';

/**
 * The routes kept out of search results, each with everything under it:
 * share and embed links are unlisted by design (anyone with the link can
 * read them, nobody should find them in a search), and the Studio, history
 * and sign-in pages are a person's own.
 */
export const NOINDEX_ROUTES = ['/s', '/embed', '/studio', '/history', '/login', '/register'];

/** The header that keeps a response out of search results. */
export const NOINDEX_HEADER = { key: 'X-Robots-Tag', value: 'noindex, nofollow' };

/**
 * next.config.ts `headers()`: `X-Robots-Tag` on every response from a
 * noindex route, so its redirects, 404s and error pages say noindex too,
 * and a page whose metadata streams into `<body>` says it in the headers.
 * /data decides per URL, so src/proxy.ts sends its header
 * (dataPageNoindex).
 */
export const noindexHeaders = () =>
    NOINDEX_ROUTES.map((route) => ({ source: `${route}/:path*`, headers: [NOINDEX_HEADER] }));

const NOINDEX: Metadata['robots'] = { index: false, follow: false };

type DataPageQuery = Record<string, string | string[] | undefined>;

export type GallerySearch = Extract<GalleryItem, { kind: 'dataset' }>;

/**
 * The gallery item a /data URL opens: a search share (?share=, where
 * `/s/<id>` sends one) that a dataset item names. A version link (?spec=)
 * opens a dataset version, never a gallery item.
 */
export const gallerySearch = (
    query: DataPageQuery,
    gallery: readonly GalleryItem[],
): GallerySearch | undefined => {
    const { spec, share } = query;

    if (spec !== undefined || share === undefined) {
        return undefined;
    }

    return gallery.find(
        (item): item is GallerySearch => item.kind === 'dataset' && item.sharedFrom === share,
    );
};

/**
 * The robots metadata for /data. A version link is unlisted: one page per
 * dataset version is nothing to list. A search share is unlisted unless a
 * gallery item opens it (gallerySearch), so a curated search is found the
 * way the rest of the gallery is.
 */
export const dataPageRobots = (
    query: DataPageQuery,
    gallery: readonly GalleryItem[],
): Metadata['robots'] => {
    if (query.spec === undefined && query.share === undefined) {
        return undefined;
    }

    return gallerySearch(query, gallery) ? undefined : NOINDEX;
};

/**
 * The metadata for /data: a gallery search carries its item's title and
 * description, as its gallery page would, and the rest keep the site's.
 */
export const dataPageMetadata = (
    query: DataPageQuery,
    gallery: readonly GalleryItem[],
): Metadata => {
    const item = gallerySearch(query, gallery);

    if (item) {
        return {
            title: `${item.title} — DFO Gallery`,
            description: item.description,
            openGraph: pageOpenGraph({
                title: item.title,
                description: item.description,
                image: galleryCard(item.slug),
            }),
        };
    }

    const robots = dataPageRobots(query, gallery);

    return robots ? { robots } : {};
};

/**
 * A /data URL's query as the page's `searchParams` holds it: a key given
 * once maps to its value, empty or not, and a repeated key to every value.
 */
export const dataPageQuery = (params: URLSearchParams): DataPageQuery => {
    const query: Record<string, string | string[]> = {};

    for (const key of new Set(params.keys())) {
        const values = params.getAll(key);

        query[key] = values.length > 1 ? values : (values[0] ?? '');
    }

    return query;
};

/**
 * Whether src/proxy.ts sends `X-Robots-Tag: noindex` for a /data URL. It
 * reads the URL through dataPageRobots, as the page's metadata does, so the
 * header and the metadata cannot disagree.
 */
export const dataPageNoindex = (
    params: URLSearchParams,
    gallery: readonly GalleryItem[],
): boolean => dataPageRobots(dataPageQuery(params), gallery) !== undefined;
