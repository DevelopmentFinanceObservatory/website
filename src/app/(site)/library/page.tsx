import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Library from '@/components/organisms/Library/Library';
import { libraryView } from '@/lib/library/admin';
import { listArtifacts } from '@/lib/library/store';
import { NOT_FOUND_METADATA, pageOpenGraph } from '@/lib/site';

// Read per request, so a newly published artifact shows at once and
// `next build` needs no database.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
    'A citable collection of DFO charts, datasets, and canvases using live data or point-in-time snapshots.';

// While LIBRARY_ENABLED is off, admins see the page and search engines are
// told to leave it out; everyone else gets the 404, which carries the
// not-found page's metadata.
export const generateMetadata = async (): Promise<Metadata> => {
    const view = await libraryView();

    if (view === null) {
        return NOT_FOUND_METADATA;
    }

    return {
        title: 'Library — DFO',
        description: DESCRIPTION,
        openGraph: pageOpenGraph({ title: 'Library', description: DESCRIPTION }),
        ...(view === 'preview' && { robots: { index: false, follow: false } }),
    };
};

// The list reads no artifact's text section or build steps, so they stay on
// the server.
const listed = async () =>
    (await listArtifacts()).map((artifact) => ({
        ...artifact,
        contentTitle: null,
        content: null,
        steps: [],
    }));

const LibraryPage = async () => {
    if ((await libraryView()) === null) {
        notFound();
    }

    return (
        <main>
            <Library artifacts={await listed()} />
        </main>
    );
};

export default LibraryPage;
