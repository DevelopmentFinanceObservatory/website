import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { GALLERY_ITEMS, galleryItem } from '@/components/organisms/Gallery/galleryData';
import Studio from '@/components/organisms/Studio/Studio';
import { liveSlotsOf } from '@/lib/chat/sharePayload';
import { gallerySession } from '@/lib/gallery/sessions';
import { pageOpenGraph } from '@/lib/site';

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
        openGraph: pageOpenGraph({
            title: item.title,
            description: item.description,
            image: null,
        }),
    };
};

/**
 * One gallery item: the curated session, opened in the Studio read-only.
 * There is no input — the only action is carrying the session on in your
 * own Studio, which forks it into your account. A live item opens the
 * copied layout and refreshes each data card through the prod share it came
 * from, `/api/share/<sharedFrom>/cards/<cardId>/refresh`, so its share id
 * is `sharedFrom`. Each card's refresh names its slot in that share, which
 * `liveSlotsOf` derives from the copied session the way the share was given
 * its slots (`slotCanvas`), so the two agree while the copy matches the share.
 * A dataset item redirects to its saved search,
 * `/data?share=<sharedFrom>`, the page `/s/<id>` sends a search share to.
 */
const GalleryItemPage = async ({ params }: GalleryItemPageProps) => {
    const item = galleryItem((await params).slug);

    if (!item) {
        notFound();
    }

    if (item.kind === 'dataset') {
        redirect(`/data?share=${item.sharedFrom}`);
    }

    const saved = gallerySession(item.slug);

    // The page is prerendered, and the Studio reads the URL (useSearchParams).
    return (
        <Suspense fallback={null}>
            {/* `continuable` (the "Continue this session" button) stays off:
                a fork starts a fresh harness conversation with no context,
                so the button promised more than it could deliver. */}
            <Studio
                shared={{
                    id: item.live ? item.sharedFrom : item.slug,
                    kind: item.kind,
                    saved,
                    live: item.live,
                    slots: item.live ? liveSlotsOf(saved) : undefined,
                }}
            />
        </Suspense>
    );
};

export default GalleryItemPage;
