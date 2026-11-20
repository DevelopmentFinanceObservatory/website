import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import EmbedView from '@/components/organisms/EmbedView/EmbedView';
import { auth } from '@/lib/auth/auth';
import { getShare, slotDepsFor, viewerOwnsShare } from '@/lib/chat/shareStore';
import { refererHost } from '@/lib/events/referer';
import { shareViewEvent } from '@/lib/events/shareView';
import { track } from '@/lib/events/track';
import { sharedViewOfRecord } from '@/lib/studio/slotCards';

type EmbedPageProps = { params: Promise<{ id: string }> };

export const generateMetadata = async ({ params }: EmbedPageProps): Promise<Metadata> => {
    const { id } = await params;
    const row = await getShare(id);

    // Embedded, so it rides someone else's page — never its own search hit.
    return {
        title: row?.title ?? 'DFO Studio',
        robots: { index: false, follow: false },
    };
};

// The iframe view of a share: just the read-only sheet, or the one card,
// edge to edge. A search share has no sheet to embed. A live share's data
// cards leave the server held and are filled in the browser
// (src/lib/studio/slotCards).
const EmbedPage = async ({ params }: EmbedPageProps) => {
    const { id } = await params;
    const row = await getShare(id);

    if (!row || row.kind === 'search') {
        notFound();
    }

    // Counted here, server-side, with no identifier and nothing stored on the
    // device, so it needs no consent. The event holds who viewed the share
    // (`viewer`: owner, other, signed_out or unknown) and `internal_eng`, read from the domain of the session's
    // verified email, and leaves off the user id (src/lib/events/shareView).
    // Headers are read during render: inside after() they throw.
    const incoming = await headers();
    const host = refererHost(incoming.get('referer'));
    after(async () => {
        // The session is read here, after the response, so the render does not wait on it.
        const { props, who } = await shareViewEvent({
            shareId: id,
            props: { kind: row.kind, host },
            label: 'embed.view',
            readSession: () =>
                auth.api.getSession({ headers: incoming, query: { disableRefresh: true } }),
            ownsShare: viewerOwnsShare,
        });

        await track('embed.view', props, { ...who, headers: incoming });
    });

    return <EmbedView shared={await sharedViewOfRecord(slotDepsFor(incoming), row)} />;
};

export default EmbedPage;
