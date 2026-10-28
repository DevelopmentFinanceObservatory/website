import { problem } from '../proxy/problem.ts';
import type { SharesError } from './apisShares.ts';

/**
 * What `POST /api/share` answers when dfo-apis refuses a share create. A
 * spent share allowance (counted by dfo-apis per network address) is 429
 * `share_limit`, with dfo-apis' Retry-After. A payload over dfo-apis' bound
 * (10 MiB) is 413 `payload_too_large`, the code the route gives a request
 * body over its own bound. Everything else is a fault the sharer cannot fix,
 * 502, retryable when dfo-apis said so.
 *
 * No path-alias dependency, so `node --test` imports it.
 */
export const sharesRefusal = (error: SharesError): Response => {
    if (error.code === 'payload_too_large') {
        return problem({
            status: 413,
            code: 'payload_too_large',
            detail: 'The share is over the 10 MiB a share holds.',
            retryable: false,
        });
    }

    if (error.code === 'allowance_exhausted') {
        return problem({
            status: 429,
            code: 'share_limit',
            detail: "This network has made today's shares. Try again tomorrow.",
            retryable: true,
            headers: error.retryAfterS ? { 'Retry-After': String(error.retryAfterS) } : undefined,
        });
    }

    console.error('share: dfo-apis refused the share', { code: error.code, status: error.status });

    return problem({
        status: 502,
        code: 'transient_unavailable',
        detail: 'The share could not be made right now. Try again in a minute.',
        retryable: error.retryable || error.status === undefined || error.status >= 500,
    });
};
