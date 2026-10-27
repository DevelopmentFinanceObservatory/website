/**
 * The pages the sitemap lists: those that answer 200 to anyone and leave
 * indexing on. A dataset gallery item redirects to its saved search, so the
 * sitemap lists the search, `/data?share=<id>`. The noindex routes
 * (lib/crawl.ts) are left out. Paths follow the app directory's routes.
 */
import type { GalleryItem } from '@/components/organisms/Gallery/galleryData';

import type { DocsPage } from './docs/corpus.ts';
import { docsHref } from './docs/href.ts';

const STATIC_PATHS = [
    '/',
    '/about',
    '/ai-policy',
    '/data',
    '/data/roadmap',
    '/data/sources',
    '/insights',
    '/insights/gallery',
    '/insights/publications',
];

export const sitemapPaths = ({
    docs,
    gallery,
    sourceIds,
}: {
    docs: readonly DocsPage[];
    gallery: readonly GalleryItem[];
    // Source dcids, slashes and all.
    sourceIds: readonly string[];
}): string[] => [
    ...STATIC_PATHS,
    ...docs.map((page) => docsHref(page.path)),
    ...gallery.map((item) =>
        item.kind === 'dataset'
            ? `/data?share=${item.sharedFrom}`
            : `/insights/gallery/${item.slug}`,
    ),
    ...sourceIds.map((dcid) => `/data/sources/${dcid}`),
];
