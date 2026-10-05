import * as Sentry from '@sentry/nextjs';

// Browser-side Sentry: unhandled errors and a sample of page transitions.
// Inert without NEXT_PUBLIC_SENTRY_DSN. No PII, no replay — essential
// error monitoring only, so it needs no cookie consent.
Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Same-origin tunnel (src/app/api/monitoring) — see its note.
    tunnel: '/api/monitoring',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
