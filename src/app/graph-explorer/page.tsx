import { Suspense } from 'react';

import GraphExplorer from '@/components/organisms/GraphExplorer/GraphExplorer';

/** The Explore page. The client organism reads its view from the URL query, so it renders inside Suspense. */
const GraphExplorerPage = () => (
    <Suspense fallback={null}>
        <GraphExplorer />
    </Suspense>
);

export default GraphExplorerPage;
