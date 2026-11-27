import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import LibraryArtifact from '@/components/organisms/Library/LibraryArtifact';
import WithdrawnArtifact from '@/components/organisms/Library/WithdrawnArtifact';
import { libraryAdmin, libraryView } from '@/lib/library/admin';
import { artifactBySlug } from '@/lib/library/store';
import { NOT_FOUND_METADATA, pageOpenGraph, SITE_ORIGIN } from '@/lib/site';

export const dynamic = 'force-dynamic';

type LibraryArtifactPageProps = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: LibraryArtifactPageProps): Promise<Metadata> => {
    const view = await libraryView();

    if (view === null) {
        return NOT_FOUND_METADATA;
    }

    const found = await artifactBySlug((await params).slug);

    if (found === null) {
        return NOT_FOUND_METADATA;
    }

    // A withdrawn artifact's address answers 200, since Next has no
    // page-level 410, so it asks search engines to drop it.
    if (found.status === 'withdrawn') {
        return {
            title: 'Withdrawn artifact — DFO',
            robots: { index: false, follow: false },
        };
    }

    const { artifact } = found;

    // While LIBRARY_ENABLED is off, admins see each artifact under its own
    // title, unindexed.
    return {
        title: `${artifact.title} — DFO Library`,
        description: artifact.description,
        openGraph: pageOpenGraph({ title: artifact.title, description: artifact.description }),
        ...(view === 'preview' ? { robots: { index: false, follow: false } } : {}),
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
