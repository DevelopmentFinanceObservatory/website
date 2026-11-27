import { ImageResponse } from 'next/og';

import SiteOpenGraphImage from '@/app/opengraph-image';
import { cardFonts } from '@/lib/cardFonts';
import { kindLabel } from '@/lib/library/artifact';
import { libraryEnabled } from '@/lib/library/enabled';
import { artifactBySlug } from '@/lib/library/store';
import { CARD_SIZE, CARD_TYPE, SITE_NAME } from '@/lib/site';

// Either card shows the DFO mark, and the page's own title names the artifact.
export const alt = SITE_NAME;
export const size = CARD_SIZE;
export const contentType = CARD_TYPE;

// Read per request, so a withdrawn artifact's card goes with it and
// `next build` needs no database.
export const dynamic = 'force-dynamic';

// At most `max` characters, cut at a word break when one is near.
const shorten = (text: string, max: number) => {
    if (text.length <= max) {
        return text;
    }

    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');

    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

// The artifact at `slug`, or null when the lookup fails, so the preview is
// the site's card.
const lookUp = async (slug: string) => {
    try {
        return await artifactBySlug(slug);
    } catch (error) {
        console.error('library_preview_lookup_failed', { slug, error: String(error) });

        return null;
    }
};

/**
 * A published artifact's link-preview card: its type, title and sources over
 * the DFO mark, on the site's ground, centred inside the 630px square Slack
 * crops a thumbnail to. A withdrawn or unknown slug, a failed lookup, and
 * every slug while LIBRARY_ENABLED is off get the site's card, so the image
 * says nothing the page would not. The check reads the switch alone: the
 * image is fetched by link unfurlers, never by the admin who may preview the
 * Library, and a shared cache must not keep an admin's copy.
 */
const LibraryOpenGraphImage = async ({ params }: { params: Promise<{ slug: string }> }) => {
    const found = libraryEnabled() ? await lookUp((await params).slug) : null;

    if (found?.status !== 'published') {
        return SiteOpenGraphImage();
    }

    const { artifact } = found;
    const title = shorten(artifact.title, 90);
    const sources = shorten(artifact.sources.map((source) => source.name).join(' · '), 70);

    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                backgroundColor: '#f6f6e8',
                color: '#484842',
                fontFamily: 'Outfit',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    fontSize: 24,
                    fontWeight: 500,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: '#5e5e52',
                }}
            >
                {`Library · ${kindLabel(artifact.kind)}`}
            </div>
            <div
                style={{
                    display: 'flex',
                    marginTop: 28,
                    width: 560,
                    justifyContent: 'center',
                    fontSize: title.length > 48 ? 44 : 56,
                    fontWeight: 500,
                    lineHeight: 1.1,
                    letterSpacing: -1,
                }}
            >
                {title}
            </div>
            {sources && (
                <div
                    style={{
                        display: 'flex',
                        marginTop: 24,
                        width: 560,
                        justifyContent: 'center',
                        fontSize: 24,
                        lineHeight: 1.3,
                        color: '#5e5e52',
                    }}
                >
                    {sources}
                </div>
            )}
            {/* public/logo.svg */}
            <svg
                width="145"
                height="55"
                viewBox="0 0 58 22"
                fill="#484842"
                style={{ marginTop: 48 }}
            >
                <path d="M.394 21.395V.413h8.841c6.572 0 11.375 4.125 11.375 10.49 0 6.337-4.803 10.492-11.316 10.492zM9.235 5.422H6.288v10.963h2.947c3.3 0 5.364-1.827 5.364-5.51 0-3.655-2.093-5.453-5.364-5.453" />
                <path d="M20.362 21.395V.413h15.53v4.892h-9.636v3.742h9.195v4.892h-9.195v7.456z" />
                <path d="M46.012 21.807c-6.571 0-11.434-4.685-11.434-10.933C34.578 4.627 39.382 0 45.953 0 52.525 0 57.33 4.627 57.33 10.904c0 6.247-4.804 10.903-11.317 10.903m-.059-5.186c3.301 0 5.364-2.24 5.364-5.747 0-3.477-2.092-5.687-5.364-5.687-3.3 0-5.363 2.21-5.363 5.687 0 3.507 2.063 5.747 5.363 5.747" />
            </svg>
        </div>,
        { ...size, fonts: await cardFonts() },
    );
};

export default LibraryOpenGraphImage;
