'use client';

import Script from 'next/script';
import { useSyncExternalStore } from 'react';

import { isEmbedPath } from '@/lib/embed';

const MEASUREMENT_ID = 'G-NCWQ8XTXG1';

// Production promotes the image built on dev, so every build-time env
// var is the same on both. The host name tells them apart.
const PRODUCTION_HOSTS = ['developmentfinance.org', 'www.developmentfinance.org'];

const noSubscribe = () => () => {};
const isEnabled = () =>
    PRODUCTION_HOSTS.includes(window.location.hostname) && !isEmbedPath(window.location.pathname);

// GA4 on the production hosts, except in embeds, which run inside other
// sites and load no consent manager. The root layout sets the consent defaults
// (all denied) before Usercentrics loads, and Usercentrics sends the updates.
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
