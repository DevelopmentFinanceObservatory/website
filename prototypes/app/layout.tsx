import type { Metadata, Viewport } from 'next';

import { CARD } from '../registry';

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

// The same fonts, global styles, header and footer as the site
// (src/app/layout.tsx and src/app/(site)/layout.tsx), without its analytics
// and consent scripts, because the prototypes are static pages. The header
// and footer link to the site through siteHref (src/lib/site.ts), and the
// footer's privacy settings load the consent manager on demand.
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
            <Header />
            <main>{children}</main>
            <Footer />
        </body>
    </html>
);

export default RootLayout;
