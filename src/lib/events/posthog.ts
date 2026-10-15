import { randomUUID } from 'node:crypto';

import { clientAddress, trustedHops } from '../proxy/caller.ts';
import type { EventName, EventProps, Who } from './track';

// The PostHog half of src/lib/events, in its own module (no db or server-only imports) so src/lib/test/events-posthog.test.ts can exercise it under plain node.

export const posthogConfigured = (): boolean =>
    Boolean(process.env.POSTHOG_KEY && process.env.POSTHOG_HOST);

// The visitor's address for a consented visitor (see clientAddress in
// src/lib/proxy/caller), else undefined. A malformed TRUSTED_PROXY_HOPS
// gives undefined rather than a guess.
const consentedAddress = (who: Who): string | undefined => {
    const hops = trustedHops(process.env);

    if (!who.visitorId || !who.headers || typeof hops !== 'number') {
        return undefined;
    }

    return clientAddress(who.headers.get('x-forwarded-for'), hops);
};

/**
 * Forward one event to PostHog's capture endpoint. One project serves every
 * environment, so each event carries ENVIRONMENT (set by dfo-infra) to say
 * where it came from; signed_in lets dashboards split guests from account
 * holders without either id.
 *
 * distinct_id is the consent-gated random visitor id when the browser sent
 * one, else the account id (pseudonymous, the same value the event table
 * stores). An event with neither gets a fresh random id and
 * $process_person_profile false, so it creates no person.
 *
 * $raw_user_agent is the request's User-Agent, which PostHog's bot filter
 * reads. $ip is the client address for a consented visitor only; every
 * other event sets $geoip_disable, since PostHog would otherwise locate the
 * server. An event with no browser request behind it (who.headers null)
 * carries neither. Event props cannot set PostHog's `$` properties.
 */
export const sendEventToPosthog = async (name: EventName, props: EventProps, who: Who) => {
    const person = who.visitorId ?? who.userId;
    const userAgent = who.headers?.get('user-agent');
    const ip = consentedAddress(who);
    const ownProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => !key.startsWith('$')),
    );

    const response = await fetch(`${process.env.POSTHOG_HOST}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: process.env.POSTHOG_KEY,
            event: name,
            distinct_id: person ?? randomUUID(),
            properties: {
                ...ownProps,
                environment: process.env.ENVIRONMENT ?? 'unknown',
                page: who.page ?? null,
                signed_in: Boolean(who.userId),
                ...(userAgent && { $raw_user_agent: userAgent }),
                ...(ip ? { $ip: ip } : { $geoip_disable: true }),
                ...(!person && { $process_person_profile: false }),
            },
            timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
        throw new Error(`PostHog answered ${response.status}`);
    }
};
