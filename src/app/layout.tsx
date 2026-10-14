import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

import GoogleAnalytics from '@/components/atoms/GoogleAnalytics/GoogleAnalytics';
import { EMBED_PREFIX } from '@/lib/embed';

import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

import '@/styles/main.scss';

const SITE_NAME = 'Development Finance Observatory';
const SITE_DESCRIPTION =
    'The Development Finance Observatory integrates aid, debt, climate and health finance, domestic budgets, and remittances into a single open platform, where every number is traceable to its source.';

// Link previews need absolute image URLs. Staging builds the image
// production runs, so the origin is the production host rather than a
// build-time variable; without it Next writes localhost. Pages that set no
// openGraph of their own inherit this card, and the image is
// app/opengraph-image.tsx.
export const metadata: Metadata = {
    metadataBase: new URL('https://developmentfinance.org'),
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
                {/* Google Consent Mode v2 defaults, all denied until the visitor
                    chooses and Usercentrics sends the update. Runs on every
                    host and sits above the Usercentrics loader because
                    beforeInteractive scripts run in source order. */}
                <Script id="consent-defaults" strategy="beforeInteractive">
                    {`window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
});`}
                </Script>
                {/* Usercentrics (the CMP ONE pays for; DFO has its own settings
                    id, styled to match this site, with the logo served from
                    public/logo.svg). Embeds (/embed/) run inside other sites
                    and load no consent manager, so this script injects the
                    loader everywhere else. The loader loads async alongside
                    hydration; the consent defaults above still run first, so
                    GA waits for the update or falls back to denied. A separate
                    root layout for /embed would keep a blocking <Script src>,
                    but Next 16.3 then serves unknown URLs' 404 either without
                    the consent scripts or only behind its experimental
                    globalNotFound flag. Inside <body>: a <script> straight
                    under <html> is invalid markup and breaks hydration. */}
                <Script id="usercentrics-cmp-loader" strategy="beforeInteractive">
                    {`if (!location.pathname.startsWith(${JSON.stringify(EMBED_PREFIX)})) {
    const cmp = document.createElement('script');
    cmp.id = 'usercentrics-cmp';
    cmp.src = 'https://web.cmp.usercentrics.eu/ui/loader.js';
    cmp.setAttribute('data-settings-id', 'yv5DSuw_0kFrRJ');
    cmp.async = true;
    document.head.appendChild(cmp);
}`}
                </Script>
                {children}
                <GoogleAnalytics />
            </body>
        </html>
    );
};

export default RootLayout;
