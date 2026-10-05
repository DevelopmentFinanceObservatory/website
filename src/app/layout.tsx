import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

import GoogleAnalytics from '@/components/atoms/GoogleAnalytics/GoogleAnalytics';

import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

import '@/styles/main.scss';

export const metadata: Metadata = {
    title: 'DFO — Development Finance Observatory',
    description: 'Development finance data simplified.',
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
                    public/logo.svg): consent has to be asked before anything
                    that needs it runs, so this loads ahead of our own code, as
                    do the consent defaults above. Inside <body>: a
                    <script> straight under <html> is invalid markup and breaks
                    hydration. */}
                <Script
                    id="usercentrics-cmp"
                    src="https://web.cmp.usercentrics.eu/ui/loader.js"
                    data-settings-id="yv5DSuw_0kFrRJ"
                    strategy="beforeInteractive"
                />
                {children}
                <GoogleAnalytics />
            </body>
        </html>
    );
};

export default RootLayout;
