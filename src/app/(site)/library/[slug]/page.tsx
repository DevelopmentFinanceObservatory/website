import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import LibraryArtifact from '@/components/organisms/Library/LibraryArtifact';
import { artifactBySlug } from '@/lib/library/store';
import { pageOpenGraph, SITE_ORIGIN } from '@/lib/site';

export const dynamic = 'force-dynamic';

type LibraryArtifactPageProps = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: LibraryArtifactPageProps): Promise<Metadata> => {
    const artifact = await artifactBySlug((await params).slug);

    if (!artifact) {
        return { title: 'Library — DFO' };
    }

    return {
        title: `${artifact.title} — DFO Library`,
        description: artifact.description,
        openGraph: pageOpenGraph({ title: artifact.title, description: artifact.description }),
    };
};

const LibraryArtifactPage = async ({ params }: LibraryArtifactPageProps) => {
    const artifact = await artifactBySlug((await params).slug);

    if (!artifact) {
        notFound();
    }

    return (
        <main>
            <LibraryArtifact artifact={artifact} origin={SITE_ORIGIN} accessed={new Date()} />
        </main>
    );
};

export default LibraryArtifactPage;
