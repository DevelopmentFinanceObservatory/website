import type { Metadata } from 'next';

import Studio from '@/components/organisms/Studio/Studio';
import { getSession } from '@/lib/auth/session';
import { liveSharingAvailable } from '@/lib/studio/liveShare';

export const metadata: Metadata = {
    title: 'DFO Studio',
};

// A conversation's own URL — the Studio opens straight on it (a refresh, a
// link, a fresh fork). A guest has nothing saved, so lands on the landing.
const StudioConversationPage = async ({ params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const session = await getSession();

    return <Studio openId={id} guest={!session} liveSharing={liveSharingAvailable()} />;
};

export default StudioConversationPage;
