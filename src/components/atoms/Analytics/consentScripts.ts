import { CMP_LOADER_SRC, CMP_SETTINGS_ID } from '@/lib/consent';
import { EMBED_PREFIX } from '@/lib/embed';

// The consent scripts as source text. Analytics renders them as inline
// <script> tags, and ConsentRecovery runs them again after React commits the
// root layout on the client. Each sets a window flag on its first run and does
// nothing on a second, so each runs exactly once per page load whichever path
// ran it first.

// Google Consent Mode v2 defaults, all denied until the visitor chooses and
// Usercentrics sends the update. Runs on every host. gtag is assigned to window
// because a function declaration inside a block is hoisted to the global scope
// only when the block runs.
const CONSENT_DEFAULTS = `if (!window.__dfoConsentDefaults) {
    window.__dfoConsentDefaults = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        wait_for_update: 500,
    });
}`;

// Usercentrics (the CMP ONE pays for; DFO has its own settings id, styled to
// match this site, with the logo served from public/logo.svg). Embeds
// (/embed/) run inside other sites and load no consent manager, so this script
// injects the loader everywhere else. A separate root layout for /embed would
// allow a plain <script src>, but Next 16 then serves unknown URLs' 404 either
// without the consent scripts or only behind its experimental globalNotFound
// flag.
//
// Usercentrics appends its UI root (aside#usercentrics-cmp-ui) and its consent
// sharing iframe to <body>, and with the loader inline it can do so before
// hydration ends. When hydration fails and React renders the root on the
// client, React removes every <body> child it does not own except scripts and
// styles, and the banner vanishes. Usercentrics never removes either node
// itself, so the observer puts them back.
const CMP_LOADER = `if (!window.__dfoCmpLoader && !location.pathname.startsWith(${JSON.stringify(EMBED_PREFIX)})) {
    window.__dfoCmpLoader = true;
    const cmp = document.createElement('script');
    cmp.id = 'usercentrics-cmp';
    cmp.src = '${CMP_LOADER_SRC}';
    cmp.setAttribute('data-settings-id', '${CMP_SETTINGS_ID}');
    cmp.async = true;
    document.head.appendChild(cmp);
    const cmpNodes = ['usercentrics-cmp-ui', 'uc-cross-domain-consent-sharing-bridge'];
    new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.removedNodes) {
                if (node instanceof Element && cmpNodes.includes(node.id) && !node.isConnected) {
                    document.body.appendChild(node);
                }
            }
        }
    }).observe(document.body, { childList: true });
}`;

// In run order: the defaults before the loader.
export const CONSENT_SCRIPTS = [
    { id: 'consent-defaults', code: CONSENT_DEFAULTS },
    { id: 'usercentrics-cmp-loader', code: CMP_LOADER },
] as const;
