/**
 * Sends one error and one transaction from a keyed request through Sentry,
 * set up with the site's options and a fake transport, and prints every
 * envelope it would have sent as JSON. Run in its own process per runtime by
 * src/lib/test/sentryHeaders.test.ts: plain `node` loads the Node SDK, and
 * `node --conditions=edge-light` loads the Edge one.
 *
 * SENTRY_EMIT_DEFAULTS=1 leaves the site's integrations out, so the test can
 * show that the probe catches the leak it guards against.
 */
import { createRequire } from 'node:module';

import type * as SentryModule from '@sentry/nextjs';

import { sentryOptions } from '../../sentryOptions.ts';

// Loaded with require, as Next's bundles do, so `--conditions=edge-light`
// picks the Edge build and its imports resolve without file extensions.
const Sentry = createRequire(import.meta.url)('@sentry/nextjs') as typeof SentryModule;

const sent: unknown[] = [];

const options = sentryOptions(Sentry, {
    SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
    NODE_ENV: 'test',
});

Sentry.init({
    ...options,
    ...(process.env.SENTRY_EMIT_DEFAULTS === '1' && { integrations: [] }),
    tracesSampleRate: 1,
    transport: () => ({
        send: async (envelope: unknown) => {
            sent.push(envelope);

            return { statusCode: 200 };
        },
        flush: async () => true,
    }),
});

const headers = {
    authorization: `Bearer ${process.env.PROBE_BEARER}`,
    'x-api-key': process.env.PROBE_ALIAS ?? '',
    'user-agent': 'sentry-probe/1',
};

// The error path: onRequestError in src/instrumentation.ts.
Sentry.captureRequestError(
    new Error('probe error'),
    { path: '/api/v1/probe', method: 'GET', headers },
    { routerKind: 'App Router', routePath: '/api/v1/[...path]', routeType: 'route' },
);

// The transaction path: a sampled request with no error.
Sentry.withIsolationScope((scope) => {
    scope.setSDKProcessingMetadata({
        normalizedRequest: { url: 'http://localhost/api/v1/probe', method: 'GET', headers },
    });
    Sentry.startSpan({ name: 'GET /api/v1/probe', forceTransaction: true }, () => {
        Sentry.startSpan({ name: 'child' }, () => {});
    });
});

await Sentry.flush(2000);
process.stdout.write(JSON.stringify(sent));
