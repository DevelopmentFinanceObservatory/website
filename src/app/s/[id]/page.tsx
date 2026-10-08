import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import Studio from '@/components/organisms/Studio/Studio';
import { getShare } from '@/lib/chat/shareStore';
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

// A public share: the Studio, read-only, on the stored copy. No account
// needed to look. A live share's data cards leave the server held and are
// filled in the browser on current data (sharedViewOf).
const SharePage = async ({ params }: SharePageProps) => {
    const { id } = await params;
    const row = await getShare(id);

    if (!row) {
        notFound();
    }

    // A search result opens on the search page itself, which loads the
    // share's references and replays (or reads back) the data.
    if (row.kind === 'search') {
        redirect(`/data?share=${row.id}`);
    }

    return <Studio shared={sharedViewOf(row)} />;
};

export default SharePage;
