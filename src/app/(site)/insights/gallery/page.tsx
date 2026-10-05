import type { Metadata } from 'next';
import { Suspense } from 'react';

import Gallery from '@/components/organisms/Gallery/Gallery';

export const metadata: Metadata = {
    title: 'Gallery — DFO',
    description:
        'Expert-curated canvases built in DFO Studio with live knowledge graph data — ready to monitor or fork.',
};

// Suspense: the filters read the URL (useSearchParams) on a static page.
const GalleryPage = () => (
    <main>
        <Suspense fallback={null}>
            <Gallery />
        </Suspense>
    </main>
);

export default GalleryPage;
