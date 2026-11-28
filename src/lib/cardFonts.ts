import 'server-only';

import { readFile } from 'node:fs/promises';

/*
 * Outfit, the site's typeface, for the link-preview cards ImageResponse
 * draws, from the @fontsource package the layout loads. Each file is read
 * through a literal `new URL(..., import.meta.url)`, so the build copies
 * just that file beside the server bundle, where the standalone server
 * (deploy/Dockerfile), which has no node_modules/@fontsource, reads it. A
 * URL held in a variable makes Turbopack trace the whole project into the
 * output.
 */
const readOutfit400 = () =>
    readFile(
        new URL(
            '../../node_modules/@fontsource/outfit/files/outfit-latin-400-normal.woff',
            import.meta.url,
        ),
    );
const readOutfit500 = () =>
    readFile(
        new URL(
            '../../node_modules/@fontsource/outfit/files/outfit-latin-500-normal.woff',
            import.meta.url,
        ),
    );

type CardFont = { name: 'Outfit'; data: Buffer; weight: 400 | 500; style: 'normal' };

let loaded: Promise<CardFont[]> | null = null;

/** The fonts, read on the first call. A failed read is forgotten, so the
 *  next card tries again. */
export const cardFonts = (): Promise<CardFont[]> => {
    loaded ??= Promise.all([readOutfit400(), readOutfit500()])
        .then(([regular, medium]): CardFont[] => [
            { name: 'Outfit', data: regular, weight: 400, style: 'normal' },
            { name: 'Outfit', data: medium, weight: 500, style: 'normal' },
        ])
        .catch((error: unknown) => {
            loaded = null;
            throw error;
        });

    return loaded;
};
