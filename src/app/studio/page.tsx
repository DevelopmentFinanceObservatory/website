import type { Metadata } from 'next';

import Studio from '@/components/organisms/Studio/Studio';
import { getSession } from '@/lib/auth/session';
import { loadDataAvailability } from '@/lib/studio/dataAvailabilityLoader';
import { pickExamples } from '@/lib/studio/examples';

export const metadata: Metadata = {
    title: 'DFO Studio',
    robots: { index: false, follow: false },
};

// Open to everyone; a guest gets a few free prompts and no history. The
// session read makes this a per-request render, so each visit draws its own
// examples.
const StudioPage = async () => {
    const [session, dataAvailability] = await Promise.all([getSession(), loadDataAvailability()]);

    return (
        <Studio guest={!session} examples={pickExamples()} dataAvailability={dataAvailability} />
    );
};

export default StudioPage;
