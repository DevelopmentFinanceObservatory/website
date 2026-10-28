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
