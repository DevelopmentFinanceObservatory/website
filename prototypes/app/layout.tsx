import type { Metadata, Viewport } from 'next';

import { CARD } from '../registry';

import ConsentScripts from '@/components/atoms/ConsentScripts/ConsentScripts';
import GoogleAnalytics from '@/components/atoms/GoogleAnalytics/GoogleAnalytics';
import Footer from '@/components/organisms/Footer/Footer';
import Header from '@/components/organisms/Header/Header';
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

// The same fonts, global styles, consent scripts, analytics, header and footer
// as the site (src/app/layout.tsx and src/app/(site)/layout.tsx). The app
// shares the site's origin, so the consent manager shows and stores the
// visitor's site-wide choices, and GA4 reports its pages under /prototypes/.
// The header and footer link to the site through siteHref (src/lib/site.ts).
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
            <ConsentScripts />
            <Header />
            <main>{children}</main>
            <Footer />
            <GoogleAnalytics />
        </body>
    </html>
);

export default RootLayout;
