import type { Metadata } from 'next';

import Publications, {
    type PublicationCard,
} from '@/components/organisms/Publications/Publications';
import { sanityClient } from '@/sanity/client';
import { toPublicationCards } from '@/sanity/publications';
import { PUBLICATIONS_QUERY } from '@/sanity/queries';

export const metadata: Metadata = {
    title: 'Publications — DFO',
    description:
        'Research and analysis produced by the DFO team, built directly on the data in the DFO knowledge graph.',
};

// Edits published in cms-dfo reach the page within five minutes.
export const revalidate = 300;

// A failed read renders the empty list, so a Sanity outage during `next build`
// leaves the build running and the next revalidation fills the page in.
const loadPublications = async (): Promise<PublicationCard[]> => {
    try {
        return toPublicationCards(await sanityClient.fetch(PUBLICATIONS_QUERY));
    } catch (error) {
        console.warn('publications: the Sanity read failed', error);

        return [];
    }
};

const PublicationsPage = async () => (
    <main>
        <Publications publications={await loadPublications()} />
    </main>
);

export default PublicationsPage;
