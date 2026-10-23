import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';

import Studio from '@/components/organisms/Studio/Studio';
import { isLiveStudioShare, searchShareMode, type ShareMode } from '@/lib/chat/shareMode';
import { getShare } from '@/lib/chat/shareStore';
import { refererHost } from '@/lib/events/referer';
import { track } from '@/lib/events/track';
import { sharedViewOf } from '@/lib/studio/liveCards';

type SharePageProps = { params: Promise<{ id: string }> };

export const generateMetadata = async ({ params }: SharePageProps): Promise<Metadata> => {
    const { id } = await params;
    const row = await getShare(id);

    // A share link is unlisted: anyone holding it can read it, nobody
    // should find it in a search (the gallery is where curated sessions
    // are meant to be found).
    return {
        title: row ? `${row.title} — DFO Studio` : 'DFO Studio',
        robots: { index: false, follow: false },
    };
};

// The mode a stored share is served in: a Studio row with no stored mode is
// a snapshot, a search row with none is live (shareMode.ts).
const modeOf = (row: { kind: string; mode: string | null }): ShareMode => {
    if (row.kind === 'search') {
        return searchShareMode(row.mode);
    }

    return isLiveStudioShare(row) ? 'live' : 'snapshot';
};

// A public share: the Studio, read-only, on the stored copy. No account
// needed to look. A live share's data cards leave the server held and are
// filled in the browser on current data (sharedViewOf).
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
            { shareId: row.id, kind: row.kind, mode: modeOf(row), host },
            { headers: incoming },
        ),
    );

    // A search result opens on the search page itself, which loads the
    // share's references and replays (or reads back) the data.
    if (row.kind === 'search') {
        redirect(`/data?share=${row.id}`);
    }

    return <Studio shared={sharedViewOf(row)} />;
};

export default SharePage;
