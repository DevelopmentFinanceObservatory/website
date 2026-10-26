import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import HistoryScreen from '@/components/organisms/HistoryScreen/HistoryScreen';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
    title: 'My History — DFO Studio',
    robots: { index: false, follow: false },
};

// Account-only, like the Studio.
const HistoryPage = async () => {
    if (!(await getSession())) {
        redirect('/login?next=/history');
    }

    return <HistoryScreen />;
};

export default HistoryPage;
