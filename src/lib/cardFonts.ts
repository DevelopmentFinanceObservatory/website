import 'server-only';

import { readFile } from 'node:fs/promises';

/*
 * Outfit, the site's typeface, for the link-preview cards ImageResponse
 * draws, from the @fontsource package the layout loads. Each file is named
 * by a URL relative to this module, so the build copies it beside the
 * server bundle: the standalone server (deploy/Dockerfile) has no
 * node_modules/@fontsource, and a card drawn per request reads the files
 * there. They are read once per server.
 */
const files = {
    400: new URL(
        '../../node_modules/@fontsource/outfit/files/outfit-latin-400-normal.woff',
        import.meta.url,
    ),
    500: new URL(
        '../../node_modules/@fontsource/outfit/files/outfit-latin-500-normal.woff',
        import.meta.url,
    ),
};

type CardFont = { name: 'Outfit'; data: Buffer; weight: 400 | 500; style: 'normal' };

let loaded: Promise<CardFont[]> | null = null;

export const cardFonts = (): Promise<CardFont[]> =>
    (loaded ??= Promise.all(
        ([400, 500] as const).map(async (weight) => ({
            name: 'Outfit' as const,
            data: await readFile(files[weight]),
            weight,
            style: 'normal' as const,
        })),
    ));
