import { NextResponse, type NextRequest } from 'next/server';

import { dataPageNoindex, NOINDEX_HEADER } from '@/lib/crawl';
import { isGraphExplorerPath, withRequestPath } from '@/lib/graphExplorer/signIn';
import { issueVisitorCookie, secureCookieFor } from '@/lib/proxy/visitor';
import { variantRedirect } from '@/lib/studio/variant';

/** A Graph Explorer request carries its path and query (withRequestPath). */
const graphExplorer = (request: NextRequest) =>
    NextResponse.next({ request: { headers: withRequestPath(request.headers, request.nextUrl) } });

/**
 * `X-Robots-Tag` on a /data response the page's metadata keeps out of
 * search (dataPageRobots): a version link or a search share. The header
 * holds whatever the render does, redirects and errors included.
 */
const dataPage = (request: NextRequest) => {
    const response = NextResponse.next();

    if (dataPageNoindex(request.nextUrl.searchParams)) {
        response.headers.set(NOINDEX_HEADER.key, NOINDEX_HEADER.value);
    }

    return response;
};

const DATA_PATH = '/data';

/**
 * A Studio page carrying `?studio=prompt|classic` answers 307 to itself
 * without the parameter and sets the session cookie the page reads
 * (variantRedirect).
 */
const studioVariant = (request: NextRequest) => {
    const { pathname, search } = request.nextUrl;
    const redirect = variantRedirect(pathname, search, {
        secure: secureCookieFor(request.nextUrl),
    });

    if (!redirect) {
        return null;
    }

    const response = NextResponse.redirect(new URL(redirect.location, request.nextUrl), 307);

    // The answer carries one visitor's cookie choice, so no shared cache
    // may keep it.
    response.headers.set('Cache-Control', 'private, no-store');

    if (redirect.cookie) {
        response.cookies.set(redirect.cookie);
    }

    return response;
};

const pageResponse = (request: NextRequest) => {
    const { pathname } = request.nextUrl;
    const variant = studioVariant(request);

    if (variant) {
        return variant;
    }

    if (isGraphExplorerPath(pathname)) {
        return graphExplorer(request);
    }

    return pathname === DATA_PATH ? dataPage(request) : NextResponse.next();
};

/**
 * Every page request, document load or RSC fetch, gets its Studio variant,
 * Graph Explorer or /data handling, then a `dfo_v` visitor cookie when one is due
 * (issueVisitorCookie).
 */
export const proxy = (request: NextRequest) => {
    const response = pageResponse(request);
    const cookie = issueVisitorCookie(request);

    if (cookie) {
        response.cookies.set(cookie);
    }

    return response;
};

/**
 * Pages only: the first entry skips /api, /mcp, /openapi.json, /codes,
 * /embed and /prototypes (served by the prototypes Worker), each as a whole
 * path segment, so /apiary or /codes-of-conduct would still match. It also
 * skips Next's own files and any path ending in a file extension of either
 * case. /data and /graph-explorer are listed on their own as well, so their
 * handling never rests on the first entry.
 */
export const config = {
    matcher: [
        '/((?!(?:api|mcp|openapi\\.json|codes|embed|prototypes)(?:/|$)|_next/|.*\\.[a-zA-Z0-9]+$).*)',
        '/data',
        '/graph-explorer',
        '/graph-explorer/:path*',
    ],
};
