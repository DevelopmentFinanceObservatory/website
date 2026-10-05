import type { MetadataRoute } from 'next';

/**
 * What crawlers may read. The curated pages — including every gallery item —
 * are open; a person's own material is not: share and embed links are
 * unlisted by design (anyone with the link can read them, nobody should
 * find them in a search), and the Studio, history and auth pages need an
 * account anyway.
 */
const robots = (): MetadataRoute.Robots => ({
    rules: [
        {
            userAgent: '*',
            allow: '/',
            disallow: ['/s/', '/embed/', '/studio', '/history', '/login', '/register', '/api/'],
        },
    ],
});

export default robots;
