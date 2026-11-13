/**
 * The Graph Explorer's way back after sign-in. src/proxy.ts writes the
 * requested path and query into REQUEST_PATH_HEADER, and the section's
 * layout builds the sign-in address from it. No imports, so `node --test`
 * and the proxy can load it.
 */

export const GRAPH_EXPLORER_PATH = '/graph-explorer';

/**
 * The request header src/proxy.ts sets on a request to the Graph Explorer:
 * its path and query, which the layout sends the visitor back to after
 * sign-in. A layout has no other way to read the requested path.
 */
export const REQUEST_PATH_HEADER = 'x-dfo-request-path';

/** Whether a path is the Graph Explorer or under it, by whole segments. */
export const isGraphExplorerPath = (pathname: string): boolean =>
    pathname === GRAPH_EXPLORER_PATH || pathname.startsWith(`${GRAPH_EXPLORER_PATH}/`);

/**
 * The sign-in address for a signed-out visitor to the Graph Explorer, with
 * `next` set to the requested path when it is a Graph Explorer path, and to
 * the Graph Explorer otherwise. /login validates `next` again (safeNext).
 */
export const graphExplorerSignIn = (requested: string | null | undefined): string => {
    const inside =
        requested != null &&
        (isGraphExplorerPath(requested) || requested.startsWith(`${GRAPH_EXPLORER_PATH}?`));
    const next = inside ? requested : GRAPH_EXPLORER_PATH;

    return `/login?next=${encodeURIComponent(next)}`;
};
