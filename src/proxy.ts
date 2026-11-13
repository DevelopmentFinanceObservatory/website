import { NextResponse, type NextRequest } from 'next/server';

import { GALLERY_ITEMS } from '@/components/organisms/Gallery/galleryData';
import { dataPageNoindex, NOINDEX_HEADER } from '@/lib/crawl';
import { isGraphExplorerPath, REQUEST_PATH_HEADER } from '@/lib/graphExplorer/signIn';

/**
 * A Graph Explorer request carries its path and query in
 * REQUEST_PATH_HEADER, which overwrites any value the client sent.
 */
const graphExplorer = (request: NextRequest) => {
    const { pathname, search } = request.nextUrl;
    const headers = new Headers(request.headers);

    headers.set(REQUEST_PATH_HEADER, pathname + search);

    return NextResponse.next({ request: { headers } });
};

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
