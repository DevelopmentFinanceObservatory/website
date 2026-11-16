/**
 * Consent as the Usercentrics CMP (loaded in src/app/layout.tsx) reports it,
 * through its public v3 browser API: `window.__ucCmp` and the `UC_CONSENT`
 * window event (usercentrics.com/docs/web/features/api/control-functionality,
 * …/events/uc-consent). Do not read Usercentrics' own localStorage keys, which
 * are internal to it.
 */

import { IS_SITE } from './site.ts';

// The CMP's loader and DFO's settings id in the Usercentrics admin.
export const CMP_LOADER_SRC = 'https://web.cmp.usercentrics.eu/ui/loader.js';
export const CMP_SETTINGS_ID = 'yv5DSuw_0kFrRJ';

// Template id of the "DFO usage statistics" service (Analytics category) in
// the Usercentrics admin, settings yv5DSuw_0kFrRJ.
export const USAGE_STATS_SERVICE = 'L3eMCSMT3WELG7';

type ConsentDetails = {
    services?: Record<string, { consent?: { given?: boolean } } | undefined>;
};

type UcCmp = {
    isInitialized: () => Promise<boolean>;
    getConsentDetails: () => Promise<ConsentDetails>;
    showSecondLayer: () => Promise<void>;
};

declare global {
    interface Window {
        __ucCmp?: UcCmp;
    }
}

const given = (details: ConsentDetails | null | undefined, templateId: string) =>
    details?.services?.[templateId]?.consent?.given === true;

/**
 * Whether the visitor has consented to the service. False when the CMP is
 * missing (still loading or blocked), uninitialised, or throws.
 */
export const hasServiceConsent = async (templateId: string): Promise<boolean> => {
    try {
        const cmp = window.__ucCmp;

        if (!cmp || !(await cmp.isInitialized())) return false;

        return given(await cmp.getConsentDetails(), templateId);
    } catch {
        return false;
    }
};

/**
 * Calls `listener` with the service's consent each time the CMP applies a
 * consent state, at start-up (stored consent included) and on every change in
 * the banner. Returns the unsubscribe function.
 */
export const onServiceConsent = (templateId: string, listener: (given: boolean) => void) => {
    const handle = (event: Event) =>
        listener(given((event as CustomEvent<ConsentDetails>).detail, templateId));

    window.addEventListener('UC_CONSENT', handle);

    return () => window.removeEventListener('UC_CONSENT', handle);
};

// How long loadCmp waits for the CMP's interface.
const CMP_WAIT_MS = 10_000;

let cmpLoad: Promise<UcCmp | null> | null = null;

/**
 * Loads the CMP once and resolves to it when its interface is ready, or to
 * null when the loader fails or the interface is not up within CMP_WAIT_MS.
 * Ready means the `UC_UI_INITIALIZED` event: `isInitialized()` turns true
 * earlier, and a `showSecondLayer()` called then is dropped.
 */
const loadCmp = (): Promise<UcCmp | null> => {
    cmpLoad ??= new Promise((resolve) => {
        const settle = (cmp: UcCmp | null) => {
            window.clearTimeout(timer);
            window.removeEventListener('UC_UI_INITIALIZED', ready);

            if (!cmp) {
                cmpLoad = null;
            }

            resolve(cmp);
        };
        const ready = () => settle(window.__ucCmp ?? null);
        const timer = window.setTimeout(() => settle(null), CMP_WAIT_MS);
        const script = document.createElement('script');

        window.addEventListener('UC_UI_INITIALIZED', ready);
        script.id = 'usercentrics-cmp';
        script.src = CMP_LOADER_SRC;
        script.setAttribute('data-settings-id', CMP_SETTINGS_ID);
        script.async = true;
        script.onerror = () => settle(null);
        document.head.appendChild(script);
    });

    return cmpLoad;
};

/**
 * Open the CMP's settings layer so the visitor can change their choices after
 * the first banner. On the website it does nothing while the CMP hasn't
 * loaded. The prototypes app loads no CMP with its pages, so the first call
 * loads it; it is served on the site's origin, so the CMP shows and stores the
 * visitor's site-wide choices.
 */
export const showPrivacySettings = () => {
    if (IS_SITE || window.__ucCmp) {
        void window.__ucCmp?.showSecondLayer().catch(() => {});

        return;
    }

    void loadCmp()
        .then((cmp) => cmp?.showSecondLayer())
        .catch(() => {});
};
