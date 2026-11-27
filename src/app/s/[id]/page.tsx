import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';

import Studio from '@/components/organisms/Studio/Studio';
import { auth } from '@/lib/auth/auth';
import { getShare, slotDepsFor, viewerOwnsShare } from '@/lib/chat/shareStore';
import { refererHost } from '@/lib/events/referer';
import { shareViewEvent } from '@/lib/events/shareView';
import { track } from '@/lib/events/track';
import { sharedViewOfRecord } from '@/lib/studio/slotCards';

type SharePageProps = { params: Promise<{ id: string }> };

export const generateMetadata = async ({ params }: SharePageProps): Promise<Metadata> => {
    const { id } = await params;
    const row = await getShare(id);

    // A share link is unlisted: anyone holding it can read it, nobody
    // should find it in a search.
    return {
        title: row?.title ? `${row.title} — DFO Studio` : 'DFO Studio',
        robots: { index: false, follow: false },
    };
};

// A public share: the Studio, read-only, on the share dfo-apis holds. No
// account needed to look. A snapshot's data cards are drawn here from their
// component revisions; a live share's leave the server held and are filled
// in the browser on current data (src/lib/studio/slotCards).
const SharePage = async ({ params }: SharePageProps) => {
    const { id } = await params;
    const row = await getShare(id);

    if (!row) {
        notFound();
    }

    // Counted here, server-side, with no identifier and nothing stored on the
    // device, so it needs no consent. The event holds who viewed the share
    // (`viewer`: owner, other, signed_out or unknown) and `internal_eng`, read from the domain of the session's
    // verified email, and leaves off the user id (src/lib/events/shareView).
    // Headers are read during render: inside after() they throw. Scheduled before the redirect below, which throws.
    const incoming = await headers();
    const host = refererHost(incoming.get('referer'));
    after(async () => {
        // The session is read here, after the response, so the render does not wait on it.
        const { props, who } = await shareViewEvent({
            shareId: row.id,
            props: { kind: row.kind, mode: row.mode, host },
            label: 'share.open',
            readSession: () =>
                auth.api.getSession({ headers: incoming, query: { disableRefresh: true } }),
            ownsShare: viewerOwnsShare,
        });

        await track('share.open', props, { ...who, headers: incoming });
    });

    // A search result opens on the search page itself, which loads the
    // share's references and replays (or reads back) the data.
    if (row.kind === 'search') {
        redirect(`/data?share=${row.id}`);
    }

    return <Studio shared={await sharedViewOfRecord(slotDepsFor(incoming), row)} />;
};

export default SharePage;
