/* eslint-disable @next/next/no-before-interactive-script-outside-document -- the rule targets the Pages Router; this component renders only in App Router root layouts */
import Script from 'next/script';

import { CMP_LOADER_SRC, CMP_SETTINGS_ID } from '@/lib/consent';
import { EMBED_PREFIX } from '@/lib/embed';

// The consent scripts every root layout renders before its content: the
// website's (src/app/layout.tsx) and the prototypes app's
// (prototypes/app/layout.tsx), which shares the site's origin and so its
// visitors' choices. beforeInteractive scripts must sit in a root layout and
// run in source order.
const ConsentScripts = () => (
    <>
        {/* Google Consent Mode v2 defaults, all denied until the visitor
            chooses and Usercentrics sends the update. Runs on every host and
            sits above the Usercentrics loader because beforeInteractive
            scripts run in source order. */}
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
        {/* Usercentrics (the CMP ONE pays for; DFO has its own settings id,
            styled to match this site, with the logo served from
            public/logo.svg). Embeds (/embed/) run inside other sites and load
            no consent manager, so this script injects the loader everywhere
            else. The loader loads async alongside hydration; the consent
            defaults above still run first, so GA waits for the update or falls
            back to denied. A separate root layout for /embed would keep a
            blocking <Script src>, but Next 16.3 then serves unknown URLs' 404
            either without the consent scripts or only behind its experimental
            globalNotFound flag. Inside <body>: a <script> straight under
            <html> is invalid markup and breaks hydration. */}
        <Script id="usercentrics-cmp-loader" strategy="beforeInteractive">
            {`if (!location.pathname.startsWith(${JSON.stringify(EMBED_PREFIX)})) {
    const cmp = document.createElement('script');
    cmp.id = 'usercentrics-cmp';
    cmp.src = '${CMP_LOADER_SRC}';
    cmp.setAttribute('data-settings-id', '${CMP_SETTINGS_ID}');
    cmp.async = true;
    document.head.appendChild(cmp);
}`}
        </Script>
    </>
);

export default ConsentScripts;
