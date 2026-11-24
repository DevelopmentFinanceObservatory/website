/**
 * Consent as the Usercentrics CMP (loaded by src/components/atoms/Analytics)
 * reports it,
 * through its public v3 browser API: `window.__ucCmp` and the `UC_CONSENT`
 * window event (usercentrics.com/docs/web/features/api/control-functionality,
 * …/events/uc-consent). Do not read Usercentrics' own localStorage keys, which
 * are internal to it.
 */

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

// How long a click made before the CMP loaded waits for it.
const CMP_WAIT_MS = 10_000;

/**
 * Open the CMP's settings layer so the visitor can change their choices after
 * the first banner. A click before the CMP has loaded opens the layer once its
 * interface is up (the `UC_UI_INITIALIZED` event), or is dropped after
 * CMP_WAIT_MS, as when a blocker stops the loader.
 */
export const showPrivacySettings = () => {
    if (window.__ucCmp) {
        void window.__ucCmp.showSecondLayer().catch(() => {});

        return;
    }

    const open = () => {
        window.clearTimeout(timer);
        void window.__ucCmp?.showSecondLayer().catch(() => {});
    };
    const timer = window.setTimeout(
        () => window.removeEventListener('UC_UI_INITIALIZED', open),
        CMP_WAIT_MS,
    );

    window.addEventListener('UC_UI_INITIALIZED', open, { once: true });
};
