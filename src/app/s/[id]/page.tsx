import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';

import Studio from '@/components/organisms/Studio/Studio';
import { getShare, slotDepsFor } from '@/lib/chat/shareStore';
import { refererHost } from '@/lib/events/referer';
import { track } from '@/lib/events/track';
import { sharedViewOfRecord } from '@/lib/studio/slotCards';

type SharePageProps = { params: Promise<{ id: string }> };

export const generateMetadata = async ({ params }: SharePageProps): Promise<Metadata> => {
    const { id } = await params;
    const row = await getShare(id);

    // A share link is unlisted: anyone holding it can read it, nobody
    // should find it in a search (the gallery is where curated sessions
    // are meant to be found).
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
    // device, so it needs no consent. Headers are read during render: inside
    // after() they throw. Scheduled before the redirect below, which throws.
    const incoming = await headers();
    const host = refererHost(incoming.get('referer'));
    after(() =>
        track(
            'share.open',
            { shareId: row.id, kind: row.kind, mode: row.mode, host },
            { headers: incoming },
        ),
    );

    // A search result opens on the search page itself, which loads the
    // share's references and replays (or reads back) the data.
    if (row.kind === 'search') {
        redirect(`/data?share=${row.id}`);
    }

    return <Studio shared={await sharedViewOfRecord(slotDepsFor(incoming), row)} />;
};

export default SharePage;
