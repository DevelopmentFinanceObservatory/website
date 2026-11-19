import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import EmbedView from '@/components/organisms/EmbedView/EmbedView';
import { auth } from '@/lib/auth/auth';
import { getShare, slotDepsFor, viewerOwnsShare } from '@/lib/chat/shareStore';
import { anonymousWho } from '@/lib/events/internalEng';
import { refererHost } from '@/lib/events/referer';
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
    // device, so it needs no consent. The event holds whether the viewer owns
    // the share and `internal_eng`, read from the session's verified email. The
    // user id is left off the event.
    // Headers are read during render: inside after() they throw.
    const incoming = await headers();
    const host = refererHost(incoming.get('referer'));
    after(async () => {
        // The session is read here, after the response, so the render does not wait on it.
        const session = await auth.api
            .getSession({ headers: incoming, query: { disableRefresh: true } })
            .catch((error) => {
                console.warn('embed.view: session read failed', id, error);
                return null;
            });

        await track(
            'embed.view',
            {
                shareId: id,
                kind: row.kind,
                host,
                owner: await viewerOwnsShare(id, session?.user.id),
            },
            { ...anonymousWho(session?.user), headers: incoming },
        );
    });

    return <EmbedView shared={await sharedViewOfRecord(slotDepsFor(incoming), row)} />;
};

export default EmbedPage;
