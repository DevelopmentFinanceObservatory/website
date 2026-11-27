import type { Metadata } from 'next';

import Publications from '@/components/organisms/Publications/Publications';

export const metadata: Metadata = {
    title: 'Publications — DFO',
    description:
        'Research and analysis produced by the DFO team, built directly on the data in the DFO knowledge graph.',
};

const PublicationsPage = () => (
    <main>
        <Publications />
    </main>
);

export default PublicationsPage;
