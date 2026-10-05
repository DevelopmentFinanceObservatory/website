import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/auth';

// Better Auth's endpoints (sign-in, callback, session, sign-out) — all under
// /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth);
