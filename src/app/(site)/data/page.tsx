import type { Metadata } from 'next';

import DataSearch from '@/components/organisms/DataSearch/DataSearch';
import { getSession } from '@/lib/auth/session';
import { dataPageMetadata } from '@/lib/crawl';
import { loadSearchCatalogue } from '@/lib/search/catalogueLoader';

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
// read tells DataSearch whether a move to Studio spends a guest prompt.
const DataPage = async () => {
    const [catalogue, session] = await Promise.all([loadSearchCatalogue(), getSession()]);

    return (
        <main>
            <DataSearch catalogue={catalogue} guest={!session} />
        </main>
    );
};

export default DataPage;
