import * as Sentry from '@sentry/nextjs';

// Node runtime Sentry (route handlers, server components, the proxies to
// the DFO APIs and the Studio harness). Inert without SENTRY_DSN.
Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
});
