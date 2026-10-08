import type { EventName, EventProps, Who } from './track';

// The PostHog half of src/lib/events, in its own module (no db or server-only imports) so src/lib/test/events-posthog.test.ts can exercise it under plain node.

export const posthogConfigured = (): boolean =>
    Boolean(process.env.POSTHOG_KEY && process.env.POSTHOG_HOST);

/**
 * Forward one event to PostHog's capture endpoint. One project serves every
 * environment, so each event carries ENVIRONMENT (set by dfo-infra) to say
 * where it came from. distinct_id is the consent-gated random visitor id
 * when the browser sent one, else the account id (pseudonymous, the same
 * value the event table stores), else a shared bucket for server-only
 * events; signed_in lets dashboards split guests from account holders
 * without either id.
 */
export const sendEventToPosthog = async (name: EventName, props: EventProps, who: Who) => {
    const response = await fetch(`${process.env.POSTHOG_HOST}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: process.env.POSTHOG_KEY,
            event: name,
            distinct_id: who.visitorId ?? who.userId ?? 'anonymous',
            properties: {
                ...props,
                environment: process.env.ENVIRONMENT ?? 'unknown',
                page: who.page ?? null,
                signed_in: Boolean(who.userId),
            },
            timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
        throw new Error(`PostHog answered ${response.status}`);
    }
};
