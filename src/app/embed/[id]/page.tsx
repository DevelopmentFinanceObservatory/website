import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import EmbedView from '@/components/organisms/EmbedView/EmbedView';
import { getShare } from '@/lib/chat/shareStore';
import { refererHost } from '@/lib/events/referer';
import { track } from '@/lib/events/track';
import { sharedViewOf } from '@/lib/studio/liveCards';

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

// The iframe view of a share: just the read-only sheet, or the one card,
// edge to edge. A search share has no sheet to embed. A live share's data
// cards leave the server held and are filled in the browser (sharedViewOf).
const EmbedPage = async ({ params }: EmbedPageProps) => {
    const { id } = await params;
    const row = await getShare(id);

    if (!row || row.kind === 'search') {
        notFound();
    }

    // Counted here, server-side, with no identifier and nothing stored on the
    // device, so it needs no consent. Headers are read during render: inside
    // after() they throw.
    const incoming = await headers();
    const host = refererHost(incoming.get('referer'));
    after(() => track('embed.view', { shareId: id, kind: row.kind, host }, { headers: incoming }));

    return <EmbedView shared={sharedViewOf(row)} />;
};

export default EmbedPage;
