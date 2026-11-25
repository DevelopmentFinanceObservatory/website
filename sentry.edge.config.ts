import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from './src/lib/sentryOptions';

// Edge runtime Sentry (proxy.ts). Inert without SENTRY_DSN. No request
// headers are sent (src/lib/sentryOptions).
Sentry.init(sentryOptions(Sentry));
