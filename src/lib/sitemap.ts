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
];

export const sitemapPaths = ({
    docs,
    sourceIds,
    librarySlugs,
}: {
    docs: readonly DocsPage[];
    // Source dcids, slashes and all.
    sourceIds: readonly string[];
    // The artifacts' slugs, or null while LIBRARY_ENABLED is off, which
    // leaves /library out too.
    librarySlugs: readonly string[] | null;
}): string[] => [
    ...STATIC_PATHS,
    ...docs.map((page) => docsHref(page.path)),
    ...sourceIds.map((dcid) => `/data/sources/${dcid}`),
    ...(librarySlugs ? ['/library', ...librarySlugs.map((slug) => `/library/${slug}`)] : []),
];
