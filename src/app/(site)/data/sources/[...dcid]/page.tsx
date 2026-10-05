import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import SourceDetail from '@/components/organisms/Sources/SourceDetail';
import { loadSourceDoc } from '@/lib/sources/graph';

// A source is addressed by its dcid, which carries slashes
// (`dc/d/WorldBank_WorldDevelopmentIndicators`), so the segment is a
// catch-all and the id is the joined path.
type SourcePageProps = { params: Promise<{ dcid: string[] }> };

// Rendered per request, so a graph failure throws inside the route's error
// boundary (../error.tsx) and answers 500 with the site chrome. A cached
// render that throws would answer a bare 500. Each read is cached for an hour
// (lib/sources/graph.ts), so the graph is read at most hourly per source. A
// dcid the graph does not hold as a source renders the 404 page.
export const dynamic = 'force-dynamic';

export const generateMetadata = async ({ params }: SourcePageProps): Promise<Metadata> => {
    const { dcid } = await params;
    const doc = await loadSourceDoc(dcid.join('/'));
    const name = doc?.details.name_of_source;

    return { title: name ? `${name} — Sources — DFO` : 'Sources — DFO' };
};

const SourcePage = async ({ params }: SourcePageProps) => {
    const { dcid } = await params;
    const ref = dcid.join('/');
    const doc = await loadSourceDoc(ref);

    if (!doc) {
        notFound();
    }

    return (
        <main>
            {/* Suspense: the tabs read the URL (useSearchParams) on a static page. */}
            <Suspense fallback={null}>
                <SourceDetail dcid={ref} doc={doc} />
            </Suspense>
        </main>
    );
};

export default SourcePage;
