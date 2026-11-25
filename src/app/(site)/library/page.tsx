import type { Metadata } from 'next';

import Library from '@/components/organisms/Library/Library';
import { listArtifacts } from '@/lib/library/store';
import { pageOpenGraph } from '@/lib/site';

// Read per request, so a newly published artifact shows at once and
// `next build` needs no database.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
    'A citable collection of DFO charts, datasets, and canvases using live data or point-in-time snapshots.';

export const metadata: Metadata = {
    title: 'Library — DFO',
    description: DESCRIPTION,
    openGraph: pageOpenGraph({ title: 'Library', description: DESCRIPTION }),
};

const LibraryPage = async () => (
    <main>
        <Library artifacts={await listArtifacts()} />
    </main>
);

export default LibraryPage;
