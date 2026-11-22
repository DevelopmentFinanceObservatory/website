'use client';

import Script from 'next/script';
import { useSyncExternalStore } from 'react';

import { isEmbedPath } from '@/lib/embed';

const MEASUREMENT_ID = 'G-NCWQ8XTXG1';

// Dev and production build the same Dockerfile with the same build-time env
// vars. The host name tells them apart.
const PRODUCTION_HOSTS = ['developmentfinance.org', 'www.developmentfinance.org'];

declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
    }
}

const noSubscribe = () => () => {};
const isEnabled = () =>
    PRODUCTION_HOSTS.includes(window.location.hostname) &&
    !isEmbedPath(window.location.pathname) &&
    typeof window.gtag === 'function';

// GA4 on the production hosts, except in embeds, which run inside other
// sites and load no consent manager. The root layout's inline script defines
// gtag and sets the consent defaults (all denied) before Usercentrics loads,
// and Usercentrics sends the updates. When React renders the root layout on the
// client (an error shell, a hydration recovery), the inline scripts it inserts
// do not run, so gtag is missing and GA4 stays off: it never loads without
// the defaults.
// Enhanced measurement records App Router navigations, so this sends only the
// config call.
const GoogleAnalytics = () => {
    const enabled = useSyncExternalStore(noSubscribe, isEnabled, () => false);

    if (!enabled) return null;

    return (
        <>
            <Script
                id="ga-gtag"
                src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
            />
            <Script id="ga-config">
                {`gtag('js', new Date()); gtag('config', '${MEASUREMENT_ID}');`}
            </Script>
        </>
    );
};

export default GoogleAnalytics;
