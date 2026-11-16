import type { Metadata, Viewport } from 'next';

import SiteHeader from '../components/SiteHeader/SiteHeader';

import { CARD } from '../registry';

import { pageOpenGraph, SITE_NAME, SITE_ORIGIN } from '@/lib/site';

import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

import '@/styles/main.scss';

// The same fonts and global styles as the site (src/app/layout.tsx), without
// its analytics and consent scripts, because the prototypes are static pages.
const DESCRIPTION = `Tools and apps built on the ${SITE_NAME} infrastructure.`;

export const metadata: Metadata = {
    metadataBase: new URL(`${SITE_ORIGIN}/prototypes/`),
    title: {
        default: `Prototypes · ${SITE_NAME}`,
        template: `%s · Prototypes · ${SITE_NAME}`,
    },
    description: DESCRIPTION,
    openGraph: {
        ...pageOpenGraph({ title: 'Prototypes', description: DESCRIPTION, image: CARD }),
        type: 'website',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#f6f6e8',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <html lang="en">
        <body className="page">
            <SiteHeader />
            <main>{children}</main>
        </body>
    </html>
);

export default RootLayout;
