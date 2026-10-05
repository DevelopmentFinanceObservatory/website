import type { Metadata } from 'next';
import { Suspense } from 'react';

import Roadmap from '@/components/organisms/Roadmap/Roadmap';

export const metadata: Metadata = {
    title: 'Roadmap — DFO',
    description: 'What is available in the graph and what is currently on the horizon.',
};

// Suspense: the tabs, toggle and filters read the URL (useSearchParams) on
// a static page.
const RoadmapPage = () => (
    <main>
        <Suspense fallback={null}>
            <Roadmap />
        </Suspense>
    </main>
);

export default RoadmapPage;
