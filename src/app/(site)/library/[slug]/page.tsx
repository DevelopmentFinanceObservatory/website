import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import LibraryArtifact from '@/components/organisms/Library/LibraryArtifact';
import WithdrawnArtifact from '@/components/organisms/Library/WithdrawnArtifact';
import { libraryAdmin, libraryView } from '@/lib/library/admin';
import { artifactBySlug } from '@/lib/library/store';
import { pageOpenGraph, SITE_ORIGIN } from '@/lib/site';

export const dynamic = 'force-dynamic';

type LibraryArtifactPageProps = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: LibraryArtifactPageProps): Promise<Metadata> => {
    const view = await libraryView();

    if (view === null) {
        return { title: 'Library — DFO' };
    }

    const found = await artifactBySlug((await params).slug);

    if (found === null) {
        return { title: 'Library — DFO' };
    }

    // A withdrawn artifact's address answers 200, since Next has no
    // page-level 410, so it asks search engines to drop it. While
    // LIBRARY_ENABLED is off, admins see every artifact page unindexed.
    if (found.status === 'withdrawn' || view === 'preview') {
        return {
            title: `${found.artifact.title} — DFO Library`,
            robots: { index: false, follow: false },
        };
    }

    const { artifact } = found;

    return {
        title: `${artifact.title} — DFO Library`,
        description: artifact.description,
        openGraph: pageOpenGraph({ title: artifact.title, description: artifact.description }),
    };
};

const LibraryArtifactPage = async ({ params }: LibraryArtifactPageProps) => {
    if ((await libraryView()) === null) {
        notFound();
    }

    const found = await artifactBySlug((await params).slug);

    if (found === null) {
        notFound();
    }

    if (found.status === 'withdrawn') {
        return (
            <main>
                <WithdrawnArtifact artifact={found.artifact} />
            </main>
        );
    }

    const { artifact } = found;

    return (
        <main>
            <LibraryArtifact
                artifact={artifact}
                origin={SITE_ORIGIN}
                accessed={new Date()}
                canEdit={(await libraryAdmin()) !== null}
            />
        </main>
    );
};

export default LibraryArtifactPage;
