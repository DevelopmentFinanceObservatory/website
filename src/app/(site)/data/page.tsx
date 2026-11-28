import type { Metadata } from 'next';

import DataSearch from '@/components/organisms/DataSearch/DataSearch';
import { getSession } from '@/lib/auth/session';
import { dataPageMetadata } from '@/lib/crawl';
import { loadSearchCatalogue } from '@/lib/search/catalogueLoader';
import { studioRoutingEnabled } from '@/lib/search/studioRoutingSetting';
import { visitorIsGuest } from '@/lib/search/studioRoute';

// Rendered per request, so `next build` does not depend on the API
// answering. The catalogue read revalidates every five minutes, so the API
// sees at most one read per period however many requests arrive.
export const dynamic = 'force-dynamic';

type DataPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Version links and search shares are unlisted (dataPageMetadata).
export const generateMetadata = async ({ searchParams }: DataPageProps): Promise<Metadata> =>
    dataPageMetadata(await searchParams);

// The catalogue comes from the server, so the idle chips, the stat tiles and
// the starting point render with no search call. DataSearch has no Suspense
// boundary: the route is dynamic, so useSearchParams reads the URL during
// the server render and the first HTML holds the whole view. The session
// read tells DataSearch whether a move to Studio spends a guest prompt, and
// a read that fails renders the page for a guest.
const DataPage = async () => {
    const [catalogue, guest] = await Promise.all([
        loadSearchCatalogue(),
        visitorIsGuest(getSession),
    ]);

    return (
        <main>
            <DataSearch
                catalogue={catalogue}
                guest={guest}
                studioRouting={studioRoutingEnabled()}
            />
        </main>
    );
};

export default DataPage;
