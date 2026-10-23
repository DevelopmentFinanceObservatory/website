import type { MetadataRoute } from 'next';

/**
 * What crawlers may read. The curated pages — including every gallery item —
 * are open; a person's own material is not: share and embed links are
 * unlisted by design (anyone with the link can read them, nobody should
 * find them in a search), the Studio, history and auth pages need an
 * account anyway, and the platform proxy's API routes are for programs.
 */
const robots = (): MetadataRoute.Robots => ({
    rules: [
        {
            userAgent: '*',
            allow: '/',
            disallow: [
                '/s/',
                '/embed/',
                '/studio',
                '/history',
                '/login',
                '/register',
                '/api/',
                '/codes/',
                '/openapi.json',
            ],
        },
    ],
});

export default robots;
