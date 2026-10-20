'use client';

import { hasServiceConsent, onServiceConsent, USAGE_STATS_SERVICE } from '@/lib/consent';
import { uuid } from '@/lib/uuid';

import type { EventName, EventProps } from './track';

// A random id per browser so a visitor's events string together without an
// account or a cookie. Not an identity: clearing site data makes a new one.
// Stored only with consent to "DFO usage statistics". Events sent without it
// carry a null id.
const VISITOR_KEY = 'dfo-visitor';

// The consent the CMP last reported, cached so track() stays synchronous for
// events sent as a page unloads. False until the CMP reports.
let consented = false;

if (typeof window !== 'undefined') {
    let heard = false;

    onServiceConsent(USAGE_STATS_SERVICE, (given) => {
        heard = true;
        consented = given;

        if (!given) {
            try {
                localStorage.removeItem(VISITOR_KEY);
            } catch {
                // Storage is blocked, so nothing was stored.
            }
        }
    });

    // UC_CONSENT may have fired before this module loaded, so ask once.
    void hasServiceConsent(USAGE_STATS_SERVICE).then((given) => {
        if (!heard) consented = given;
    });
}

const visitorId = (): string | null => {
    if (!consented) return null;

    try {
        let id = localStorage.getItem(VISITOR_KEY);

        if (!id) {
            id = uuid();
            localStorage.setItem(VISITOR_KEY, id);
        }

        return id;
    } catch {
        return null;
    }
};

/**
 * Record a usage event from the browser (POST /api/events). Fire-and-forget
 * with `keepalive`, so an event sent on the way out of a page still lands.
 * `page` defaults to the current path; an event sent after a navigation passes
 * the page it describes.
 */
export const track = (
    name: EventName,
    props: EventProps = {},
    page: string = location.pathname,
) => {
    try {
        void fetch('/api/events', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name,
                props,
                visitorId: visitorId(),
                page,
            }),
            keepalive: true,
        }).catch(() => undefined);
    } catch {
        // Analytics never break the page.
    }
};
