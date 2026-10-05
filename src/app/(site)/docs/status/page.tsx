import type { Metadata } from 'next';

import StatusTracker from '@/components/organisms/StatusTracker/StatusTracker';

export const metadata: Metadata = {
    title: 'Status Tracker — DFO',
    description: 'Current status of the DFO services and the incident history.',
};

const StatusPage = () => (
    <main>
        <StatusTracker />
    </main>
);

export default StatusPage;
