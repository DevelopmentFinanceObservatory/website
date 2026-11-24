/**
 * The Graph Explorer's way back after sign-in. src/proxy.ts writes the
 * requested path and query into REQUEST_PATH_HEADER, and the section's
 * layout builds the sign-in address from it. It imports only nextPath.ts,
 * so `node --test` and the proxy can load it.
 */

import { resolveOnSite } from '../auth/nextPath.ts';

export const GRAPH_EXPLORER_PATH = '/graph-explorer';

/**
 * The request header src/proxy.ts sets on a request to the Graph Explorer:
 * its path and query, which the layout sends the visitor back to after
 * sign-in. A layout has no other way to read the requested path.
 */
export const REQUEST_PATH_HEADER = 'x-dfo-request-path';

/**
 * The headers a Graph Explorer request goes on with: the client's, with
 * REQUEST_PATH_HEADER set to the requested path and query, which overwrites
 * any value the client sent.
 */
export const withRequestPath = (
    headers: Headers,
    { pathname, search }: { pathname: string; search: string },
): Headers => {
    const next = new Headers(headers);
    next.set(REQUEST_PATH_HEADER, pathname + search);
    return next;
};

/** Whether a path is the Graph Explorer or under it, by whole segments. */
export const isGraphExplorerPath = (pathname: string): boolean =>
    pathname === GRAPH_EXPLORER_PATH || pathname.startsWith(`${GRAPH_EXPLORER_PATH}/`);

/**
 * The sign-in address for a signed-out visitor to the Graph Explorer, with
 * `next` set to the requested path when it resolves to a Graph Explorer
 * path, and to the Graph Explorer otherwise. The requested path is judged
 * after URL resolution, so dot segments cannot leave the section.
 * /login validates `next` again (safeNext).
 */
export const graphExplorerSignIn = (requested: string | null | undefined): string => {
    const url = resolveOnSite(requested);
    const next =
        url !== null && isGraphExplorerPath(url.pathname)
            ? url.pathname + url.search
            : GRAPH_EXPLORER_PATH;

    return `/login?next=${encodeURIComponent(next)}`;
};
