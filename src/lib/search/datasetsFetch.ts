/**
 * `fetch` for the Datasets API, repeating a refusal the API marks retryable.
 * The API refuses with 503 `service_unavailable` and `retryable: true` in its
 * problem-details body when an instance's read or work capacity is full (a
 * ninth simultaneous read, a fifth simultaneous mint or publish), sometimes
 * with `Retry-After`, and may mark a 429 retryable the same way. Such a
 * refusal is repeated up to MAX_RETRIES times, after the wait its
 * `Retry-After` names or else a backoff doubling from BASE_DELAY_MS. A
 * refusal that names a wait over MAX_RETRY_WAIT_MS (the pin budget names an
 * hour) goes back to the caller at once, as does every other answer and the
 * last refusal once the retries are spent.
 *
 * Only calls the API documents as safe to repeat are retried: every GET and
 * HEAD, a mint (`POST /api/datasets`, which keys its version and operation on
 * the spec identity), a pin (a repeat pin of a pinned artifact is exempt and
 * repairs its reference), and the options and members doors, which write
 * nothing. A register or publish refusal goes back at once.
 *
 * Each attempt goes through `apisFetch` (src/lib/apisAuth), which adds the
 * apis ID token on Cloud Run and leaves the browser's calls as they are.
 *
 * This module has no DOM or Node dependency, so `node --test` imports it, and
 * the browser client and the server routes share it.
 */

import type { ProblemDetails } from '@developmentfinance/client/wire';

import { apisFetch, type Fetch } from '../apisAuth.ts';

export type { Fetch };

export const MAX_RETRIES = 3;
export const BASE_DELAY_MS = 500;
export const MAX_RETRY_WAIT_MS = 10_000;

const RETRYABLE_STATUSES = new Set([429, 503]);
const REPEATABLE_METHODS = new Set(['GET', 'HEAD']);
// The POST routes the API documents as safe to repeat, matched on the path.
const REPEATABLE_POSTS = [
    /\/api\/datasets$/,
    /\/api\/datasets\/[^/]+\/(options|members)$/,
    /\/api\/datasets\/[^/]+\/[^/]+\/pin$/,
];

const isRepeatable = (input: string | URL | Request, init: RequestInit | undefined): boolean => {
    const request = input instanceof Request ? input : null;
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();

    if (REPEATABLE_METHODS.has(method)) {
        return true;
    }

    // A Request's own body is spent by the first attempt; a string body is not.
    if (method !== 'POST' || request || !(init?.body == null || typeof init.body === 'string')) {
        return false;
    }

    // A relative path (the browser's same-origin proxy) parses against any base.
    const { pathname } = new URL(String(input), 'http://relative.invalid');

    return REPEATABLE_POSTS.some((route) => route.test(pathname));
};

const isRetryableRefusal = async (res: Response): Promise<boolean> => {
    if (!RETRYABLE_STATUSES.has(res.status)) {
        return false;
    }

    const body: unknown = await res
        .clone()
        .json()
        .catch(() => null);

    return (body as Partial<ProblemDetails> | null)?.retryable === true;
};

/** The wait a `Retry-After` header names, in seconds or as a date, in ms;
 *  null when it is absent or unreadable. */
export const retryAfterMs = (header: string | null, now: number = Date.now()): number | null => {
    if (!header) {
        return null;
    }

    if (/^\d+$/.test(header.trim())) {
        return Number(header) * 1000;
    }

    const date = Date.parse(header);

    return Number.isNaN(date) ? null : Math.max(0, date - now);
};

const pause = (ms: number, signal?: AbortSignal | null): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);

            return;
        }

        const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);

        signal?.addEventListener('abort', onAbort, { once: true });
    });

/**
 * Wraps `fetchImpl` with the retry described above. `sleep` waits between
 * attempts and rejects once the call's own signal aborts.
 */
export const retryingFetch = ({
    fetchImpl = apisFetch,
    sleep = pause,
}: {
    fetchImpl?: Fetch;
    sleep?: (ms: number, signal?: AbortSignal | null) => Promise<void>;
} = {}): Fetch => {
    return async (input, init) => {
        const repeatable = isRepeatable(input, init);

        for (let retry = 0; ; retry++) {
            const res = await fetchImpl(input, init);

            if (!repeatable || retry === MAX_RETRIES || !(await isRetryableRefusal(res))) {
                return res;
            }

            const wait = retryAfterMs(res.headers.get('retry-after')) ?? BASE_DELAY_MS * 2 ** retry;

            if (wait > MAX_RETRY_WAIT_MS) {
                return res;
            }

            await res.body?.cancel();
            await sleep(wait, init?.signal);
        }
    };
};

/** `apisFetch` (the global `fetch`, read at call time) with the retry. */
export const datasetsFetch: Fetch = retryingFetch();
