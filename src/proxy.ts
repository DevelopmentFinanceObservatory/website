import { NextResponse, type NextRequest } from 'next/server';

import { GALLERY_ITEMS } from '@/components/organisms/Gallery/galleryData';
import { dataPageNoindex, NOINDEX_HEADER } from '@/lib/crawl';
import { isGraphExplorerPath, withRequestPath } from '@/lib/graphExplorer/signIn';

/** A Graph Explorer request carries its path and query (withRequestPath). */
const graphExplorer = (request: NextRequest) =>
    NextResponse.next({ request: { headers: withRequestPath(request.headers, request.nextUrl) } });

/**
 * `X-Robots-Tag` on a /data response the page's metadata keeps out of
 * search (dataPageRobots): a version link, or a search share no gallery
 * item opens. The header holds whatever the render does, redirects and
 * errors included.
 */
const dataPage = (request: NextRequest) => {
    const response = NextResponse.next();

    if (dataPageNoindex(request.nextUrl.searchParams, GALLERY_ITEMS)) {
        response.headers.set(NOINDEX_HEADER.key, NOINDEX_HEADER.value);
    }

    return response;
};

export const proxy = (request: NextRequest) =>
    isGraphExplorerPath(request.nextUrl.pathname) ? graphExplorer(request) : dataPage(request);

export const config = { matcher: ['/data', '/graph-explorer', '/graph-explorer/:path*'] };
