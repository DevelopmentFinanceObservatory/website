import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import LibraryArtifact from '@/components/organisms/Library/LibraryArtifact';
import WithdrawnArtifact from '@/components/organisms/Library/WithdrawnArtifact';
import { sharesBackendFor } from '@/lib/chat/shareStore';
import { libraryAdmin, libraryView } from '@/lib/library/admin';
import { artifactPath } from '@/lib/library/artifact';
import { libraryChartData } from '@/lib/library/chartData';
import { artifactBySlug, replacementChoices } from '@/lib/library/store';
import { NOT_FOUND_METADATA, pageOpenGraph, SITE_ORIGIN } from '@/lib/site';

export const dynamic = 'force-dynamic';

type LibraryArtifactPageProps = {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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
    // title, unindexed. The card is ./opengraph-image.tsx.
    return {
        title: `${artifact.title} — DFO Library`,
        description: artifact.description,
        alternates: { canonical: artifactPath(artifact.slug) },
        openGraph: pageOpenGraph({
            title: artifact.title,
            description: artifact.description,
            image: null,
        }),
        ...(view === 'preview' ? { robots: { index: false, follow: false } } : {}),
    };
};

const LibraryArtifactPage = async ({ params, searchParams }: LibraryArtifactPageProps) => {
    if ((await libraryView()) === null) {
        notFound();
    }

    const found = await artifactBySlug((await params).slug);

    if (found === null) {
        notFound();
    }

    // An admin can name, or change, the artifact on show a withdrawn one's
    // address links to.
    const replacements =
        (await libraryAdmin()) !== null
            ? (await replacementChoices()).filter((choice) => choice.id !== found.artifact.id)
            : undefined;

    if (found.status === 'withdrawn') {
        return (
            <main>
                <WithdrawnArtifact
                    artifact={found.artifact}
                    replacements={replacements}
                    // The Edit dialog's Delete lands here when the replacement it
                    // named was withdrawn before the withdrawal committed.
                    replacementLost={(await searchParams)?.['replacement'] === 'withdrawn'}
                />
            </main>
        );
    }

    // The cards whose saved view draws rows (`readCurrentSlot`), each with
    // its table, Dataset block and ./data.csv address.
    const chartData = await libraryChartData(
        sharesBackendFor(await headers()),
        found.artifact,
        SITE_ORIGIN,
        { waitUntil: after },
    );

    return (
        <main>
            <LibraryArtifact
                artifact={found.artifact}
                chartData={chartData}
                origin={SITE_ORIGIN}
                accessed={new Date()}
                replacements={replacements}
            />
        </main>
    );
};

export default LibraryArtifactPage;
