import type { Metadata } from 'next';
import { Suspense } from 'react';

import styles from './page.module.scss';

import DataSearch from '@/components/organisms/DataSearch/DataSearch';
import { loadSearchCatalogue } from '@/lib/search/catalogueLoader';

// Rendered per request, so `next build` does not depend on the API
// answering. The catalogue read revalidates every five minutes, so the API
// sees at most one read per period however many requests arrive.
export const dynamic = 'force-dynamic';

type DataPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// A version link (?spec=) is unlisted, like a share link: one page per
// dataset version is nothing a search engine should list.
export const generateMetadata = async ({ searchParams }: DataPageProps): Promise<Metadata> =>
    (await searchParams).spec ? { robots: { index: false, follow: false } } : {};

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
