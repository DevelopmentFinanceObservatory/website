import type { MetadataRoute } from 'next';

import { GALLERY_ITEMS } from '@/components/organisms/Gallery/galleryData';
import { DOCS_PAGES } from '@/lib/docs/corpus';
import { SITE_ORIGIN } from '@/lib/site';
import { sitemapPaths } from '@/lib/sitemap';
import { loadSources } from '@/lib/sources/graph';

// Rendered per request, like the Sources page, so `next build` does not
// depend on the graph answering. The catalogue read is cached for an hour.
export const dynamic = 'force-dynamic';

// A graph failure drops the source pages and keeps the rest: a sitemap with
// fewer URLs removes nothing from the index, and a 500 serves none.
const sourceIds = async (): Promise<string[]> => {
    try {
        return (await loadSources()).map((source) => source.id);
    } catch (error) {
        console.error('sitemap: the source pages are left out', error);

        return [];
    }
};

const sitemap = async (): Promise<MetadataRoute.Sitemap> =>
    sitemapPaths({
        docs: DOCS_PAGES,
        gallery: GALLERY_ITEMS,
        sourceIds: await sourceIds(),
    }).map((path) => ({ url: `${SITE_ORIGIN}${path}` }));

export default sitemap;
