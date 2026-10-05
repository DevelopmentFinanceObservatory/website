import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import EmbedView, { type EmbedKind } from '@/components/organisms/EmbedView/EmbedView';
import type { SavedConversation } from '@/lib/chat/history';
import { getShare } from '@/lib/chat/shareStore';
import { track } from '@/lib/events/track';

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

// The host site of the page the iframe sits on, as a bare hostname: the
// Referer's path and query can carry personal data, so they never leave here.
// Null when the host page's referrer policy strips it.
const refererHost = (referer: string | null): string | null =>
    URL.parse(referer ?? '')?.hostname || null;

// The iframe view of a share: just the read-only sheet, or the one card,
// edge to edge. A search share has no sheet to embed.
const EmbedPage = async ({ params }: EmbedPageProps) => {
    const { id } = await params;
    const row = await getShare(id);

    if (!row || row.kind === 'search') {
        notFound();
    }

    // Counted here, server-side, with no identifier and nothing stored on the
    // device, so it needs no consent. Headers are read during render: inside
    // after() they throw.
    const host = refererHost((await headers()).get('referer'));
    after(() => track('embed.view', { shareId: id, kind: row.kind, host }));

    return <EmbedView kind={row.kind as EmbedKind} saved={row.data as SavedConversation} />;
};

export default EmbedPage;
