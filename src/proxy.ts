import type { NextRequest } from 'next/server';

import { logRequest } from './lib/proxy/requestLog.ts';

/**
 * Next.js Proxy (formerly middleware), on the Node.js runtime: it logs each
 * visitor request (src/lib/proxy/requestLog.ts) and lets it through
 * unchanged.
 */
export function proxy(request: NextRequest): void {
    logRequest(request);
}

export const config = {
    // Static files and images skip the proxy entirely (requestLog.ts repeats
    // this list, since a matcher must be a literal).
    matcher: ['/((?!_next/|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$).*)'],
};
