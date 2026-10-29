import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { CARD_SIZE, CARD_TYPE, SITE_CARD } from '@/lib/site';

export const alt = SITE_CARD.alt;
export const size = CARD_SIZE;
export const contentType = CARD_TYPE;

// Outfit, the site's typeface, from the @fontsource package the layout
// already loads. The image has no request-time input, so it renders once at
// build and the font read never runs in the server.
const outfit = (weight: number) =>
    readFile(
        join(
            process.cwd(),
            `node_modules/@fontsource/outfit/files/outfit-latin-${weight}-normal.woff`,
        ),
    );

/**
 * The card every page without its own shows when its link is pasted: the
 * DFO mark over the full name and the hero's line, on the site's ground.
 * Slack shows the card as a thumbnail cropped to the centre 630px square,
 * so everything sits centred inside that square. Gallery items draw their
 * own (insights/gallery/[slug]/opengraph-image.tsx).
 */
const OpenGraphImage = async () => {
    const [regular, medium] = await Promise.all([outfit(400), outfit(500)]);

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
            {/* public/logo.svg */}
            <svg width="348" height="132" viewBox="0 0 58 22" fill="#484842">
                <path d="M.394 21.395V.413h8.841c6.572 0 11.375 4.125 11.375 10.49 0 6.337-4.803 10.492-11.316 10.492zM9.235 5.422H6.288v10.963h2.947c3.3 0 5.364-1.827 5.364-5.51 0-3.655-2.093-5.453-5.364-5.453" />
                <path d="M20.362 21.395V.413h15.53v4.892h-9.636v3.742h9.195v4.892h-9.195v7.456z" />
                <path d="M46.012 21.807c-6.571 0-11.434-4.685-11.434-10.933C34.578 4.627 39.382 0 45.953 0 52.525 0 57.33 4.627 57.33 10.904c0 6.247-4.804 10.903-11.317 10.903m-.059-5.186c3.301 0 5.364-2.24 5.364-5.747 0-3.477-2.092-5.687-5.364-5.687-3.3 0-5.363 2.21-5.363 5.687 0 3.507 2.063 5.747 5.363 5.747" />
            </svg>
            <div
                style={{
                    display: 'flex',
                    marginTop: 56,
                    width: 560,
                    justifyContent: 'center',
                    fontSize: 52,
                    fontWeight: 500,
                    lineHeight: 1.1,
                    letterSpacing: -1,
                }}
            >
                Development Finance Observatory
            </div>
            <div style={{ display: 'flex', marginTop: 20, fontSize: 28, color: '#5e5e52' }}>
                Development Finance Data. Simplified.
            </div>
        </div>,
        {
            ...size,
            fonts: [
                { name: 'Outfit', data: regular, weight: 400, style: 'normal' },
                { name: 'Outfit', data: medium, weight: 500, style: 'normal' },
            ],
        },
    );
};

export default OpenGraphImage;
