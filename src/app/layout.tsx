import type { Metadata, Viewport } from 'next';

import ConsentScripts from '@/components/atoms/ConsentScripts/ConsentScripts';
import GoogleAnalytics from '@/components/atoms/GoogleAnalytics/GoogleAnalytics';
import { SITE_NAME, SITE_ORIGIN } from '@/lib/site';

import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

import '@/styles/main.scss';

const SITE_DESCRIPTION =
    'The Development Finance Observatory integrates aid, debt, climate and health finance, domestic budgets, and remittances into a single open platform, where every number is traceable to its source.';

// Link previews need absolute image URLs, so the base is the production
// origin (lib/site.ts). Without it Next writes localhost. Pages that set no
// openGraph of their own inherit this card, and the image is
// app/opengraph-image.tsx.
export const metadata: Metadata = {
    metadataBase: new URL(SITE_ORIGIN),
    title: 'DFO — Development Finance Observatory',
    description: SITE_DESCRIPTION,
    openGraph: {
        type: 'website',
        siteName: SITE_NAME,
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
    },
    // X reads the Open Graph tags; this only picks its large-image layout.
    twitter: { card: 'summary_large_image' },
};

// Cover the phone's safe areas (the notch band, the home-indicator strip):
// the page paints under them and the fixed pieces (header, footer, Studio,
// drawers) pad by env(safe-area-inset-*) themselves.
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#f6f6e8',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
    return (
        <html lang="en">
            <body className="page">
                <ConsentScripts />
                {children}
                <GoogleAnalytics />
            </body>
        </html>
    );
};

export default RootLayout;
