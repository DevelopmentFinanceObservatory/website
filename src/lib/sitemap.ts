/**
 * The pages the sitemap lists: those that answer 200 to anyone and leave
 * indexing on. The noindex routes (lib/crawl.ts) are left out. Paths follow
 * the app directory's routes.
 */
import type { DocsPage } from './docs/corpus.ts';
import { docsHref } from './docs/href.ts';

const STATIC_PATHS = [
    '/',
    '/about',
    '/about/publications',
    '/ai-policy',
    '/data',
    '/data/roadmap',
    '/data/sources',
    '/library',
];

export const sitemapPaths = ({
    docs,
    sourceIds,
}: {
    docs: readonly DocsPage[];
    // Source dcids, slashes and all.
    sourceIds: readonly string[];
}): string[] => [
    ...STATIC_PATHS,
    ...docs.map((page) => docsHref(page.path)),
    ...sourceIds.map((dcid) => `/data/sources/${dcid}`),
];
