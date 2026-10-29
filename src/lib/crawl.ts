/**
 * What search engines may index. A crawler reads `noindex` only on a URL
 * robots.txt lets it fetch, so these routes stay open to crawlers (app/robots.ts)
 * and say `noindex` themselves. Its one runtime import, lib/site.ts, has
 * none of its own, so next.config.ts and `node --test` can load it.
 */
import type { Metadata, NextConfig } from 'next';

import type { GalleryItem } from '@/components/organisms/Gallery/galleryData';

import { pageOpenGraph } from './site.ts';

/**
 * The routes kept out of search results, each with everything under it:
 * share and embed links are unlisted by design (anyone with the link can
 * read them, nobody should find them in a search), and the Studio, history
 * and sign-in pages are a person's own.
 */
export const NOINDEX_ROUTES = ['/s', '/embed', '/studio', '/history', '/login', '/register'];

type HeaderRule = Awaited<ReturnType<NonNullable<NextConfig['headers']>>>[number];

const NOINDEX_HEADER = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

/** A regular expression matching exactly the given values. */
const anyOf = (values: readonly string[]): string =>
    `(?:${values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;

/**
 * next.config.ts `headers()`: `X-Robots-Tag` on every response from a
 * noindex route, so its redirects, 404s and error pages say noindex too,
 * and a page whose metadata streams into `<body>` says it in the headers.
 * /data gets it for the URLs dataPageRobots keeps out of search: any
 * version link (?spec=) and any search share (?share=) no gallery item
 * opens.
 */
export const noindexHeaders = (gallery: readonly GalleryItem[]): HeaderRule[] => {
    const gallerySearches = gallery.flatMap((item) =>
        item.kind === 'dataset' ? [item.sharedFrom] : [],
    );

    return [
        ...NOINDEX_ROUTES.map((route) => ({ source: `${route}/:path*`, headers: NOINDEX_HEADER })),
        {
            source: '/data',
            has: [{ type: 'query', key: 'spec' }],
            headers: NOINDEX_HEADER,
        },
        {
            source: '/data',
            has: [{ type: 'query', key: 'share' }],
            ...(gallerySearches.length > 0 && {
                missing: [{ type: 'query', key: 'share', value: anyOf(gallerySearches) }],
            }),
            headers: NOINDEX_HEADER,
        },
    ];
};

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
            openGraph: pageOpenGraph({ title: item.title, description: item.description }),
        };
    }

    const robots = dataPageRobots(query, gallery);

    return robots ? { robots } : {};
};
