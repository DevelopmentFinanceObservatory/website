import type { Metadata } from 'next';

import Footer from '@/components/organisms/Footer/Footer';
import Header from '@/components/organisms/Header/Header';

import { parsePreparingQuery } from '@/lib/search/shareDownload';

import PreparingDownload from './PreparingDownload';

type PreparingPageProps = {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
    title: 'Preparing your download — DFO',
    robots: { index: false, follow: false },
};

// Where /s/<id>/download sends the browser when the Datasets API builds the
// file in the background (a 202 with an operation id). The page polls the
// operation and starts the download of the rendering the link asked for
// (`format`, `bundle`) when it is done. A malformed query shows the failure
// message at once. Outside the (site) group, so the chrome is added
// explicitly.
const PreparingPage = async ({ params, searchParams }: PreparingPageProps) => {
    const { id } = await params;
    const query = await searchParams;
    const preparing = parsePreparingQuery({
        get: (name) => {
            const value = query[name];

            return typeof value === 'string' ? value : null;
        },
        has: (name) => typeof query[name] === 'string',
    });

    return (
        <>
            <Header />
            <main>
                <PreparingDownload shareId={id} preparing={preparing} />
            </main>
            <Footer />
        </>
    );
};

export default PreparingPage;
