import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { GALLERY_ITEMS, galleryItem } from '@/components/organisms/Gallery/galleryData';
import Studio from '@/components/organisms/Studio/Studio';
import { gallerySession } from '@/lib/gallery/sessions';

type GalleryItemPageProps = { params: Promise<{ slug: string }> };

// The curated list is known at build; anything else is a 404.
export const dynamicParams = false;

export const generateStaticParams = () => GALLERY_ITEMS.map((item) => ({ slug: item.slug }));

export const generateMetadata = async ({ params }: GalleryItemPageProps): Promise<Metadata> => {
    const item = galleryItem((await params).slug);

    if (!item) {
        return {};
    }

    // Unlike a share link, a gallery item is meant to be found: it is
    // curated, stable, and carries its own card (see opengraph-image).
    return {
        title: `${item.title} — DFO Gallery`,
        description: item.description,
        robots: { index: true, follow: true },
        openGraph: {
            type: 'article',
            title: item.title,
            description: item.description,
        },
    };
};

/**
 * One gallery item: the curated session, opened in the Studio read-only.
 * There is no input — the only action is carrying the session on in your
 * own Studio, which forks it into your account. A dataset item opens its
 * search instead, where the same result is built live.
 */
const GalleryItemPage = async ({ params }: GalleryItemPageProps) => {
    const item = galleryItem((await params).slug);

    if (!item) {
        notFound();
    }

    if (item.kind === 'dataset') {
        redirect(`/data?q=${encodeURIComponent(item.query ?? item.title)}`);
    }

    // The page is prerendered, and the Studio reads the URL (useSearchParams).
    return (
        <Suspense fallback={null}>
            {/* `continuable` (the "Continue this session" button) stays off:
                a fork starts a fresh harness conversation with no context,
                so the button promised more than it could deliver. */}
            <Studio shared={{ id: item.slug, kind: item.kind, saved: gallerySession(item.slug) }} />
        </Suspense>
    );
};

export default GalleryItemPage;
