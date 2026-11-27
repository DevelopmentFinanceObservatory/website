/**
 * What search engines may index. A crawler reads `noindex` only on a URL
 * robots.txt lets it fetch, so these routes stay open to crawlers (app/robots.ts)
 * and say `noindex` themselves. Its one runtime import, lib/site.ts, has
 * none of its own, so next.config.ts and `node --test` can load it.
 */
import type { Metadata } from 'next';

import { pageOpenGraph } from './site.ts';

/**
 * The routes kept out of search results, each with everything under it:
 * share and embed links are unlisted by design (anyone with the link can
 * read them, nobody should find them in a search), the Studio, history
 * and sign-in pages are a person's own, and the Graph Explorer is for
 * signed-in team accounts.
 */
export const NOINDEX_ROUTES = [
    '/s',
    '/embed',
    '/studio',
    '/history',
    '/login',
    '/register',
    '/graph-explorer',
];

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

/**
 * The robots metadata for /data. A version link is unlisted: one page per
 * dataset version is nothing to list. A search share is unlisted, as every
 * share is.
 */
export const dataPageRobots = (query: DataPageQuery): Metadata['robots'] =>
    query.spec === undefined && query.share === undefined ? undefined : NOINDEX;

const DATA_TITLE = 'Data — DFO';

const DATA_DESCRIPTION =
    'Search aid, debt, climate and health finance data in plain language, and trace every number to its source.';

/** The metadata for /data, with the robots rule for its URL. */
export const dataPageMetadata = (query: DataPageQuery): Metadata => {
    const robots = dataPageRobots(query);

    return {
        title: DATA_TITLE,
        description: DATA_DESCRIPTION,
        openGraph: pageOpenGraph({ title: 'Data', description: DATA_DESCRIPTION }),
        ...(robots && { robots }),
    };
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
export const dataPageNoindex = (params: URLSearchParams): boolean =>
    dataPageRobots(dataPageQuery(params)) !== undefined;
