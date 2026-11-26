import { problem } from '@/lib/proxy/problem';

/**
 * Whether a request came from a page of this site. The `Origin` header must
 * be present and name the host the request was sent to: the first
 * `X-Forwarded-Host` entry behind a proxy, else `Host`. A browser sets
 * `Origin` on every cross-site POST and DELETE and a page cannot forge it, so
 * a missing, opaque (`null`) or foreign origin is refused. A server action
 * gets this check from Next.js; a route handler gets it here.
 */
export const isSameOrigin = (headers: Headers): boolean => {
    const origin = headers.get('origin');
    const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');

    if (!origin || !host || !URL.canParse(origin)) {
        return false;
    }

    return new URL(origin).host === host;
};

/** A 403 problem document for a request that did not come from this site, else null. */
export const refuseCrossOrigin = (request: Request): Response | null =>
    isSameOrigin(request.headers)
        ? null
        : problem({
              status: 403,
              code: 'cross_origin',
              detail: 'This request must come from a page of this site.',
              retryable: false,
              headers: { 'Cache-Control': 'no-store' },
          });
