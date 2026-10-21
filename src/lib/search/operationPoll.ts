/**
 * Polling for the Datasets API's operation envelope (dfo-apis
 * src/datasets_api/schema.py OperationEnvelope/OperationResource). A mint
 * or definition request whose estimate exceeds the sync budget answers
 * `202` with an operation envelope instead of a manifest; `GET
 * /api/datasets/operations/{operation_id}` (dfo-apis
 * src/datasets_api/doors/meta.py) then reports `pending`/`running` with
 * `progress` (rows written against the estimate), `done` with the same
 * manifest a synchronous mint returns, or refuses with a bare RFC 9457
 * body — `operation_failed` for a failed operation, `operation_not_found`
 * for an unknown or dormant one — never a 200 carrying a nested `error`
 * (see OperationResource.error's own docstring server-side for why).
 *
 * This module has no DOM/Node dependency, so `node --test` can import it
 * directly. It takes no base URL and reads no env: a caller supplies
 * `fetchImpl`, a thin wrapper that resolves the envelope's own relative
 * `poll` path against wherever it needs to go (see searchClient.ts's
 * `mintDataset`, which polls through the site's own same-origin proxy,
 * and snapshot.ts's `captureSnapshot`, which polls the Datasets API directly, since
 * a done poll needs no principal header, unlike the `pin` call next to it).
 */

import type {
    Manifest,
    OperationEnvelope,
    OperationProgress,
    OperationResource,
    ProblemDetails,
} from '@developmentfinance/client/wire';

import { datasetsFetch } from './datasetsFetch.ts';

export type { OperationEnvelope, OperationProgress };

export type PollResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
export type PollFetch = (url: string, signal?: AbortSignal) => Promise<PollResponse>;

/** Comfortably above the worker's own 30-minute task limit, so the default
 *  deadline outlasts any operation still running. */
const DEFAULT_DEADLINE_MS = 35 * 60 * 1000;

/** The `code` of the error pollOperation throws once its deadline passes,
 *  so a caller can tell a slow operation from a failed one. */
export const OPERATION_DEADLINE = 'operation_deadline';

/** Floor for a server-supplied `retry_after_ms`. A hint of 0 (or anything
 *  smaller) would otherwise poll back-to-back, paced only by round-trip
 *  time rather than the server's own intended interval. */
const MIN_RETRY_AFTER_MS = 250;

export type PollOperationOptions = {
    /** Defaults to `datasetsFetch` (the global `fetch`, repeating a
     *  refusal the API marks retryable), called with the envelope's own
     *  relative `poll` path verbatim — override to resolve a base URL
     *  and/or attach headers (see module docstring). */
    fetchImpl?: PollFetch;
    onProgress?: (progress: OperationProgress) => void;
    /** ms slept before each poll absent the server's own
     *  `retry_after_ms`; doubles (x1.5) every attempt, capped at
     *  `maxDelayMs`. */
    initialDelayMs?: number;
    maxDelayMs?: number;
    /** Wall-clock budget from the first poll (not an attempt count, so a
     *  server that keeps answering `retry_after_ms` slower than the
     *  module's own backoff can't outlast it); refuses (throws) once
     *  exceeded, so a caller never spins forever on a stuck operation.
     *  Defaults to `DEFAULT_DEADLINE_MS`. */
    deadlineMs?: number;
    sleep?: (ms: number) => Promise<void>;
    /** Defaults to `Date.now` — override in tests to advance the clock
     *  without sleeping in real time. */
    now?: () => number;
    /** Aborts the poll's current sleep and fetch and rejects with an
     *  `AbortError`. A fetch gets its own signal, which aborts on this one
     *  or at the deadline. Checked before the first sleep too, so an
     *  already-aborted signal never issues a poll at all. */
    signal?: AbortSignal;
};

const defaultFetch: PollFetch = (url, signal) => datasetsFetch(url, { cache: 'no-store', signal });
const defaultSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const abortError = (): Error => new DOMException('operation polling aborted', 'AbortError');

/** A server-supplied `retry_after_ms` that isn't a finite number >= 0 (an
 *  absent field decodes as `undefined`, but a malformed one could still
 *  arrive as `null`, negative, or `NaN`) is ignored in favour of the
 *  module's own backoff; a valid one is floored at `MIN_RETRY_AFTER_MS` so
 *  a hint of 0 can't drive the loop into a hot poll. */
const sanitizeRetryAfterMs = (retryAfterMs: number | null | undefined): number | null => {
    if (typeof retryAfterMs !== 'number' || !Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
        return null;
    }

    return Math.max(retryAfterMs, MIN_RETRY_AFTER_MS);
};

/** Races `promise` against `signal` firing `abort`, so a sleep or fetch that
 *  never settles on its own (the real `setTimeout`/`fetch` this module
 *  defaults to) still returns once the caller aborts. */
const raceAbort = <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
    if (!signal) {
        return promise;
    }

    if (signal.aborted) {
        return Promise.reject(abortError());
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortError());

        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
};

/** A poll response's own non-2xx body, thrown as an ordinary Error carrying
 *  the refusal's `code` (`operation_failed`, `operation_not_found`, …) so
 *  callers can key UI copy off it the same way they already do for
 *  ApiError (searchClient.ts's own apiError; this module is dependency-free
 *  of searchClient so it grows its own minimal instance rather than import
 *  a browser-oriented module into a shared Node/browser one). */
export type OperationPollError = Error & {
    status: number;
    code: string | null;
};

const pollError = (body: unknown, status: number): OperationPollError => {
    const record = (body ?? {}) as Partial<ProblemDetails>;
    const message = record.detail ?? record.title ?? `operations poll failed with status ${status}`;
    const err = new Error(message) as OperationPollError;

    err.status = status;
    err.code = record.code ?? null;
    return err;
};

/**
 * Polls one operation to a terminal state, starting from the envelope a
 * `202` (or a prior poll) returned. Resolves with the done manifest (null
 * when the done poll carries none), or throws an `OperationPollError` on `failed`, on any non-2xx poll
 * response, or once `deadlineMs` has elapsed without reaching a terminal
 * state (an Error whose `code` is OPERATION_DEADLINE).
 */
export async function pollOperation(
    envelope: OperationEnvelope,
    options: PollOperationOptions = {},
): Promise<Manifest | null> {
    const {
        fetchImpl = defaultFetch,
        onProgress,
        initialDelayMs = 1000,
        maxDelayMs = 8000,
        deadlineMs = DEFAULT_DEADLINE_MS,
        sleep = defaultSleep,
        now = Date.now,
        signal,
    } = options;

    if (signal?.aborted) {
        throw abortError();
    }

    let current = envelope;
    let delay = initialDelayMs;
    const deadline = now() + deadlineMs;
    const pastDeadline = () =>
        Object.assign(
            new Error(
                `operation ${envelope.operation_id} did not reach a terminal state within ${deadlineMs}ms`,
            ),
            { code: OPERATION_DEADLINE },
        );

    while (now() < deadline) {
        if (current.progress) {
            onProgress?.(current.progress);
        }

        if (!current.poll) {
            throw new Error(`operation ${current.operation_id} carries no poll path to follow`);
        }

        // Clamps every sleep to the time left before the deadline: a
        // server-supplied retry_after_ms (or the module's own backoff)
        // longer than the time left would otherwise hold the loop asleep
        // well past `deadlineMs`, since the `while` condition is only
        // re-checked once the sleep resolves.
        const timeLeftMs = Math.max(deadline - now(), 0);
        const sleepMs = Math.min(sanitizeRetryAfterMs(current.retry_after_ms) ?? delay, timeLeftMs);

        await raceAbort(sleep(sleepMs), signal);
        delay = Math.min(delay * 1.5, maxDelayMs);

        // The fetch and its body read get the time left too, so a stalled
        // response ends at the deadline the way a long sleep does. Their
        // signal aborts on the caller's signal or on that timer.
        const attempt = new AbortController();
        const stop = () => attempt.abort();
        const timer = setTimeout(stop, Math.max(deadline - now(), 0));
        let res: PollResponse;
        let body: unknown;

        signal?.addEventListener('abort', stop, { once: true });

        try {
            res = await raceAbort(fetchImpl(current.poll, attempt.signal), attempt.signal);
            body = await raceAbort(
                res.json().catch(() => null),
                attempt.signal,
            );
        } catch (error) {
            throw attempt.signal.aborted && !signal?.aborted ? pastDeadline() : error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', stop);
        }

        if (!res.ok) {
            throw pollError(body, res.status);
        }

        const resource = body as Partial<OperationResource> | null;
        const operation = resource?.operation;

        if (!operation) {
            throw new Error(
                `operation ${current.operation_id}'s poll response carried no operation`,
            );
        }

        if (operation.status === 'done') {
            // The resource types the manifest as an open object; a done poll
            // returns the manifest a synchronous mint does.
            return (resource?.manifest ?? null) as Manifest | null;
        }

        current = operation;
    }

    throw pastDeadline();
}
