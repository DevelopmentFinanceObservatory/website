/**
 * The dfo-apis path prefixes the site proxies to SEARCH_API_BASE under its
 * public address: /api/v1/<surface>/* (src/app/api/v1/<surface>) forwards to
 * /api/<surface>/*. The Presentation API is proxied only for its cards and
 * shares. The site's /openapi.json keeps these surfaces' paths and no others
 * (./openapi). src/lib/proxy/test/surfaces.test.ts holds the list to the
 * route directories.
 */
export const SEARCH_API_SURFACES = [
    'search',
    'datasets',
    'graph',
    'presentation/components',
    'presentation/shares',
] as const;

/**
 * Whether a catch-all route's path segments stay below its surface once
 * forwarded. Next.js hands a route its segments decoded, so `%2E%2E` arrives
 * as `..` and `%2F` as `/`, and `fetch` would resolve either against the
 * surface's prefix. A segment that is `.` or `..`, or holds `/` or `\`, is
 * refused before the upstream URL is built.
 */
export const isForwardablePath = (segments: readonly string[]): boolean =>
    segments.every((segment) => segment !== '.' && segment !== '..' && !/[/\\]/.test(segment));

/**
 * The path a route's decoded segments take below its surface upstream, each
 * segment encoded again, or undefined when isForwardablePath refuses them.
 * Next.js decodes a segment once, so `%252e%252e` arrives as `%2e%2e`, which
 * `fetch` would read as `..` if spliced in raw, and `%3F` or `%23` arrives as
 * `?` or `#`, which would start a query or fragment.
 */
export const forwardablePath = (segments: readonly string[]): string | undefined =>
    isForwardablePath(segments)
        ? segments.map((segment) => `/${encodeURIComponent(segment)}`).join('')
        : undefined;
