/**
 * The Sentry options shared by the Node and Edge configs
 * (sentry.server.config.ts, sentry.edge.config.ts), kept here so a test can
 * run them through a fake transport (src/lib/test/sentryHeaders.test.ts).
 *
 * Request headers stay off every event and span. Sentry's request data
 * integration copies every request header except cookies and IP headers onto
 * error and transaction events, whatever `sendDefaultPii` says, and those
 * headers carry API keys (`Authorization: Bearer dfo_…`, `X-API-Key`).
 * `beforeSend` sees only errors, so the headers are dropped at the
 * integration. The user agent alone is put back, since it helps triage and
 * holds no secret.
 */
import type { Event, requestDataIntegration } from '@sentry/nextjs';

type Integration = Omit<ReturnType<typeof requestDataIntegration>, 'name'> & { name: string };

type SentryRuntime = {
    requestDataIntegration(options: { include: { headers: boolean } }): Integration;
};

const USER_AGENT = 'user-agent';

/** The request's user agent, read from the SDK's copy of the request. */
const userAgentOf = (event: Event): string | undefined => {
    const headers = (
        event.sdkProcessingMetadata?.normalizedRequest as
            { headers?: Record<string, string | string[] | undefined> } | undefined
    )?.headers;
    const value = headers?.[USER_AGENT];

    return Array.isArray(value) ? value[0] : value;
};

/** Puts the user agent, and no other header, back on an event's request. */
export const userAgentIntegration = (): Integration => ({
    name: 'UserAgentOnly',
    processEvent(event: Event) {
        const userAgent = userAgentOf(event);

        if (userAgent && event.request) {
            event.request.headers = { [USER_AGENT]: userAgent };
        }

        return event;
    },
});

export const sentryOptions = (sentry: SentryRuntime, env: NodeJS.ProcessEnv = process.env) => ({
    dsn: env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    integrations: [
        sentry.requestDataIntegration({ include: { headers: false } }),
        userAgentIntegration(),
    ],
});
