import type { Metadata } from 'next';

import Studio from '@/components/organisms/Studio/Studio';
import { getSession } from '@/lib/auth/session';
import { liveSharingAvailable } from '@/lib/studio/liveShare';

export const metadata: Metadata = {
    title: 'DFO Studio',
};

// Open to everyone; a guest gets a few free prompts and no history.
const StudioPage = async () => {
    const session = await getSession();

    return <Studio guest={!session} liveSharing={liveSharingAvailable()} />;
};

export default StudioPage;
