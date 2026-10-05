/**
 * The dfo-apis origin (the Search, Datasets and graph APIs) that the server
 * calls and the /api/search|datasets|graph proxy forwards to. It has no
 * default, so a deploy without SEARCH_API_BASE fails instead of quietly
 * reaching another environment's API.
 *
 * Read at call time, so `next build` needs no value. src/instrumentation.ts
 * calls this once at startup, so a production server without it refuses to
 * start.
 */
export const searchApiBase = (env: Record<string, string | undefined> = process.env): string => {
    const base = env.SEARCH_API_BASE?.trim();

    if (!base) {
        throw new Error('missing required environment variable SEARCH_API_BASE');
    }

    return base;
};
