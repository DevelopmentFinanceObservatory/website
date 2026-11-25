import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from './src/lib/sentryOptions';

// Node runtime Sentry (route handlers, server components, the proxies to
// the DFO APIs and the Studio harness). Inert without SENTRY_DSN. No
// request headers are sent (src/lib/sentryOptions).
Sentry.init(sentryOptions(Sentry));
