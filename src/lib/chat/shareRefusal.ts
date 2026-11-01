import { problem } from '../proxy/problem.ts';
import type { SharesError } from './apisShares.ts';

/**
 * The problem documents the share routes answer when dfo-apis refuses or
 * fails a call. No path-alias dependency, so `node --test` imports it.
 */

// Whether asking again can succeed: dfo-apis said so, or it gave no answer.
const isRetryable = (error: SharesError): boolean => error.retryable || error.status === undefined;

/**
 * What `POST /api/share` answers when dfo-apis refuses a share create. A
 * spent share allowance (counted by dfo-apis per network address) is 429
 * `share_limit`, with dfo-apis' Retry-After. A payload over dfo-apis' bound
 * (10 MiB) is 413 `payload_too_large`, the code the route gives a request
 * body over its own bound. A refusal dfo-apis marks retryable, and a call it
 * never answered, is 502 `transient_unavailable`. Any other refusal, such as
 * `frame_unavailable` or `binding_invalid`, would meet the same answer
 * again, so it is `share_refused` with dfo-apis' code in `upstream_code`:
 * 422 for a refusal of the request, 502 for a fault of dfo-apis' own.
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

    if (error.code === 'account_deleting') {
        return problem({
            status: 403,
            code: 'account_deleting',
            detail: 'This account is being deleted, so it cannot make shares.',
            retryable: false,
        });
    }

    console.error('share: dfo-apis refused the share', { code: error.code, status: error.status });

    if (isRetryable(error)) {
        return problem({
            status: 502,
            code: 'transient_unavailable',
            detail: 'The share could not be made right now. Try again in a minute.',
            retryable: true,
        });
    }

    return problem({
        status: error.status !== undefined && error.status >= 500 ? 502 : 422,
        code: 'share_refused',
        detail: 'This share cannot be made as it stands.',
        retryable: false,
        extra: { upstream_code: error.code },
    });
};

/** What a share read answers when dfo-apis fails it: 502 with dfo-apis'
 *  code, retryable when dfo-apis said so or gave no answer. */
export const sharesReadFailure = (error: SharesError): Response => {
    console.error('share: dfo-apis failed a share read', {
        code: error.code,
        status: error.status,
    });

    const retryable = isRetryable(error);

    return problem({
        status: 502,
        code: error.code,
        detail: retryable
            ? 'The share could not be read right now. Try again in a minute.'
            : 'The share could not be read.',
        retryable,
    });
};
