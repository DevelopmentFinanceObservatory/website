import type { Metadata } from 'next';
import { Suspense } from 'react';

import Gallery from '@/components/organisms/Gallery/Gallery';
import GalleryOffline from '@/components/organisms/GalleryOffline/GalleryOffline';
import { GALLERY_OFFLINE_METADATA, GALLERY_PUBLISHED } from '@/lib/gallery/published';

export const metadata: Metadata = GALLERY_PUBLISHED
    ? {
          title: 'Gallery — DFO',
          description:
              'Expert-curated canvases built in DFO Studio with live knowledge graph data — ready to monitor or fork.',
      }
    : GALLERY_OFFLINE_METADATA;

// Suspense: the filters read the URL (useSearchParams) on a static page.
const GalleryPage = () => (
    <main>
        {GALLERY_PUBLISHED ? (
            <Suspense fallback={null}>
                <Gallery />
            </Suspense>
        ) : (
            <GalleryOffline />
        )}
    </main>
);

export default GalleryPage;
