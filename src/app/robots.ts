import type { MetadataRoute } from 'next';

import { SITE_ORIGIN } from '../lib/site.ts';

/**
 * What crawlers may read: every page. A page that should stay out of search
 * results says so itself with `noindex` (lib/crawl.ts), and a crawler can
 * only read that on a page it may fetch; a blocked URL can still be indexed,
 * bare, from the links that point at it. Blocked are the routes for
 * programs, which serve no HTML page: the platform proxy's APIs, the
 * refusal-code registry, the OpenAPI document, the MCP server (`GET /mcp`
 * answers 405) and a share's download, which can start a dataset build.
 */
const robots = (): MetadataRoute.Robots => ({
    rules: [
        {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/', '/codes/', '/openapi.json', '/mcp', '/s/*/download'],
        },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
});

export default robots;
