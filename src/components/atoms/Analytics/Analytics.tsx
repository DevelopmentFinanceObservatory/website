import GoogleAnalytics from '@/components/atoms/GoogleAnalytics/GoogleAnalytics';
import { CMP_LOADER_SRC, CMP_SETTINGS_ID } from '@/lib/consent';
import { EMBED_PREFIX } from '@/lib/embed';

// Google Consent Mode v2 defaults, all denied until the visitor chooses and
// Usercentrics sends the update. Runs on every host.
const CONSENT_DEFAULTS = `window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
});`;

// Usercentrics (the CMP ONE pays for; DFO has its own settings id, styled to
// match this site, with the logo served from public/logo.svg). Embeds
// (/embed/) run inside other sites and load no consent manager, so this script
// injects the loader everywhere else. A separate root layout for /embed would
// allow a plain <script src>, but Next 16.3 then serves unknown URLs' 404
// either without the consent scripts or only behind its experimental
// globalNotFound flag.
const CMP_LOADER = `if (!location.pathname.startsWith(${JSON.stringify(EMBED_PREFIX)})) {
    const cmp = document.createElement('script');
    cmp.id = 'usercentrics-cmp';
    cmp.src = '${CMP_LOADER_SRC}';
    cmp.setAttribute('data-settings-id', '${CMP_SETTINGS_ID}');
    cmp.async = true;
    document.head.appendChild(cmp);
}`;

// The consent scripts and GA4 tag every root layout renders: the website's
// (src/app/layout.tsx) and the prototypes app's (prototypes/app/layout.tsx),
// which shares the site's origin and so its visitors' choices. GA4 renders only
// here, so it never runs without the Consent Mode defaults.
//
// Both scripts are plain inline <script> tags, which the browser runs while it
// parses the server HTML, in source order: the defaults, then the loader. GA4
// loads after hydration (GoogleAnalytics is a client component), so it still
// follows the defaults. next/script's beforeInteractive strategy instead queues
// them in self.__next_s until Next's client JavaScript has downloaded, which
// started the loader about 2 s later on a throttled mobile load. On a first
// visit the banner text is the page's largest paint, and Usercentrics reaches
// it through about ten sequential requests that begin with the loader, so the
// banner paints that much later too. Inside <body>: a <script> straight under
// <html> is invalid markup and breaks hydration.
const Analytics = () => (
    <>
        <script id="consent-defaults" dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULTS }} />
        <script id="usercentrics-cmp-loader" dangerouslySetInnerHTML={{ __html: CMP_LOADER }} />
        <GoogleAnalytics />
    </>
);

export default Analytics;
