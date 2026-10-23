import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/auth';
import { clientIpHandlers } from '@/lib/auth/clientIp';
import { trustedHops } from '@/lib/proxy/caller';

// Better Auth's endpoints (sign-in, callback, session, sign-out, email
// codes), all under /api/auth/*. Each request first gets the client IP
// header Better Auth keys its limits on (see lib/auth/clientIp).
export const { GET, POST } = clientIpHandlers(toNextJsHandler(auth), trustedHops(process.env));
