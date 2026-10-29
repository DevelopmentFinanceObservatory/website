import { ImageResponse } from 'next/og';

import { GALLERY_ITEMS, galleryItem } from '@/components/organisms/Gallery/galleryData';
import { CARD_SIZE, CARD_TYPE } from '@/lib/site';

export const size = CARD_SIZE;
export const contentType = CARD_TYPE;

export const dynamicParams = false;

export const generateStaticParams = () => GALLERY_ITEMS.map((item) => ({ slug: item.slug }));

/**
 * The card a gallery item shows when it is pasted anywhere: the item's own
 * title and blurb on the site's ground. Drawn rather than photographed —
 * a canvas screenshot would need a render pipeline the curation flow
 * doesn't have yet.
 */
const OpenGraphImage = async ({ params }: { params: Promise<{ slug: string }> }) => {
    const item = galleryItem((await params).slug);

    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                width: '100%',
                height: '100%',
                padding: 72,
                backgroundColor: '#f6f6e8',
                color: '#484842',
            }}
        >
            <div style={{ display: 'flex', fontSize: 28, letterSpacing: -0.5 }}>DFO Gallery</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', fontSize: 68, lineHeight: 1.05 }}>
                    {item?.title ?? 'DFO Studio session'}
                </div>
                <div style={{ display: 'flex', fontSize: 30, color: '#5e5e52' }}>
                    {(item?.description ?? '').slice(0, 120)}
                </div>
            </div>
        </div>,
        size,
    );
};

export default OpenGraphImage;
