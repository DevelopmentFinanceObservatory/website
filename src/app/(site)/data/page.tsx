import type { Metadata } from 'next';
import { Suspense } from 'react';

import styles from './page.module.scss';

import DataSearch from '@/components/organisms/DataSearch/DataSearch';
import { GALLERY_ITEMS } from '@/components/organisms/Gallery/galleryData';
import { dataPageRobots } from '@/lib/crawl';
import { loadSearchCatalogue } from '@/lib/search/catalogueLoader';

// Rendered per request, so `next build` does not depend on the API
// answering. The catalogue read revalidates every five minutes, so the API
// sees at most one read per period however many requests arrive.
export const dynamic = 'force-dynamic';

type DataPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Version links and search shares are unlisted, except a gallery item's
// search (dataPageRobots).
export const generateMetadata = async ({ searchParams }: DataPageProps): Promise<Metadata> => {
    const robots = dataPageRobots(await searchParams, GALLERY_ITEMS);

    return robots ? { robots } : {};
};

// The catalogue comes from the server, so the idle chips, the stat tiles and
// the starting point render with no search call.
const DataPage = async () => {
    const catalogue = await loadSearchCatalogue();

    return (
        <main>
            <Suspense fallback={<div className={styles.fallback} data-nav-dark="true" />}>
                <DataSearch catalogue={catalogue} />
            </Suspense>
        </main>
    );
};

export default DataPage;
