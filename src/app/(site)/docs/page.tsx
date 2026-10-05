import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Docs from '@/components/organisms/Docs/Docs';
import { docsPageByPath } from '@/lib/docs/corpus';

export const metadata: Metadata = {
    title: 'Documentation — DFO',
    alternates: { types: { 'text/markdown': '/docs.md' } },
};

// The corpus home (the manifest's page at path "").
const DocsHome = () => {
    const page = docsPageByPath('');

    if (!page) {
        notFound();
    }

    return (
        <main>
            <Docs page={page} />
        </main>
    );
};

export default DocsHome;
