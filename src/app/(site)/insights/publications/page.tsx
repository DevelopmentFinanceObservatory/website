import type { Metadata } from 'next';

import Publications, {
    type PublicationCard,
} from '@/components/organisms/Publications/Publications';
import { sanityClient } from '@/sanity/client';
import { PUBLICATIONS_QUERY } from '@/sanity/queries';

export const metadata: Metadata = {
    title: 'Publications — DFO',
    description:
        'Research and analysis produced by the DFO team, built directly on the data in the DFO knowledge graph.',
};

// Edits published in cms-dfo reach the page within five minutes.
export const revalidate = 300;

const PublicationsPage = async () => {
    const results = await sanityClient.fetch(PUBLICATIONS_QUERY);
    // The schema requires these fields, but TypeGen types every field as
    // nullable, so a document that lacks one is left out.
    const publications = results.flatMap(
        ({ id, title, byline, publishedAt, abstract, reportUrl, coverSrc }): PublicationCard[] =>
            title && byline && publishedAt && coverSrc
                ? [
                      {
                          id,
                          title,
                          byline,
                          publishedAt,
                          abstract: abstract ?? '',
                          reportUrl,
                          coverSrc,
                      },
                  ]
                : [],
    );

    return (
        <main>
            <Publications publications={publications} />
        </main>
    );
};

export default PublicationsPage;
