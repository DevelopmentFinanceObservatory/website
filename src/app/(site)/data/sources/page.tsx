import type { Metadata } from 'next';
import { Suspense } from 'react';

import Sources from '@/components/organisms/Sources/Sources';
import { loadSources } from '@/lib/sources/graph';

export const metadata: Metadata = {
    title: 'Sources — DFO',
    description:
        'Where the DFO data comes from, how it was processed, and what to know before using it.',
};

// Rendered per request, so `next build` (CI, the Docker image) does not
// depend on the API answering. The catalogue fetch has an hour-long
// revalidate, so the graph is read at most hourly however many requests
// arrive, and only a 200 answer enters that cache.
export const dynamic = 'force-dynamic';

// The cards come from one cached catalogue read on the server, so a visitor
// makes no graph calls.
// Suspense: the filters read the URL (useSearchParams).
const SourcesPage = async () => {
    const sources = await loadSources();

    return (
        <main>
            <Suspense fallback={null}>
                <Sources sources={sources} />
            </Suspense>
        </main>
    );
};

export default SourcesPage;
