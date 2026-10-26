import type { Metadata } from 'next';

import DataSearch from '@/components/organisms/DataSearch/DataSearch';
import GallerySearchLead from '@/components/organisms/DataSearch/GallerySearchLead';
import { GALLERY_ITEMS } from '@/components/organisms/Gallery/galleryData';
import { dataPageMetadata, gallerySearch } from '@/lib/crawl';
import { loadSearchCatalogue } from '@/lib/search/catalogueLoader';

// Rendered per request, so `next build` does not depend on the API
// answering. The catalogue read revalidates every five minutes, so the API
// sees at most one read per period however many requests arrive.
export const dynamic = 'force-dynamic';

type DataPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Version links and search shares are unlisted, except a gallery item's
// search, which carries the item's title and description (dataPageMetadata).
export const generateMetadata = async ({ searchParams }: DataPageProps): Promise<Metadata> =>
    dataPageMetadata(await searchParams, GALLERY_ITEMS);

// The catalogue comes from the server, so the idle chips, the stat tiles and
// the starting point render with no search call. A gallery search's summary
// does too, since the share itself loads in the browser. DataSearch has no
// Suspense boundary: the route is dynamic, so useSearchParams reads the URL
// during the server render and the first HTML holds the whole view, the
// gallery lead and its <h1> once.
const DataPage = async ({ searchParams }: DataPageProps) => {
    const [catalogue, item] = await Promise.all([
        loadSearchCatalogue(),
        searchParams.then((query) => gallerySearch(query, GALLERY_ITEMS)),
    ]);

    const lead = item && <GallerySearchLead item={item} />;

    return (
        <main>
            <DataSearch catalogue={catalogue} lead={lead} />
        </main>
    );
};

export default DataPage;
