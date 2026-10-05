import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import EmbedView from '@/components/organisms/EmbedView/EmbedView';
import type { SavedConversation } from '@/lib/chat/history';
import { getShare } from '@/lib/chat/shareStore';

type EmbedPageProps = { params: Promise<{ id: string }> };

export const generateMetadata = async ({ params }: EmbedPageProps): Promise<Metadata> => {
    const { id } = await params;
    const row = await getShare(id);

    // Embedded, so it rides someone else's page — never its own search hit.
    return {
        title: row ? row.title : 'DFO Studio',
        robots: { index: false, follow: false },
    };
};

// The iframe view of a share: just the read-only sheet, edge to edge.
const EmbedPage = async ({ params }: EmbedPageProps) => {
    const { id } = await params;
    const row = await getShare(id);

    if (!row) {
        notFound();
    }

    return <EmbedView saved={row.data as SavedConversation} />;
};

export default EmbedPage;
