import 'server-only';

import {
    APIConnectionError,
    APIError,
    APITimeoutError,
    APIUserAbortError,
    TypeSafeClient,
    type TypeSafeClientConfig,
} from '@typesafe-ai/sdk';

import { problem } from '@/lib/proxy/problem';

import {
    type Candidate,
    EVERGREEN_FIX,
    type EvergreenDoubt,
    type EvergreenRefusal,
    type EvergreenText,
    MODEL,
    batchesOf,
    candidatesOf,
    decide,
    evergreenRequest,
} from './evergreenRule';

export { KIND_MIN, MODEL, T_HIGH, T_LOW } from './evergreenRule';

/*
 * The evergreen check the publish and edit routes run on an artifact's text
 * (./evergreenRule.ts has the rule and the questions). It fails closed. When
 * TypeSafe cannot answer, the route answers 503 `evergreen_check_unavailable`
 * and nothing is stored, since a publish that skipped the check would show
 * the stale text the check exists to stop. LIBRARY_EVERGREEN_CHECK=off is the
 * operator's switch for an outage. No line logged here carries the text.
 * TypeSafe's own errors echo their input, so neither their message nor the
 * SDK's logger is used.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

const KEY_PROBLEM =
    'TYPESAFE_API_KEY is not set, so the Library cannot check that published text is evergreen and refuses every publish and text edit. Set it, or set LIBRARY_EVERGREEN_CHECK=off to publish unchecked.';

/** False when LIBRARY_EVERGREEN_CHECK is `off`, which publishes text
 *  unchecked. Read per call, so a test can flip it. */
export const evergreenCheckOn = (): boolean =>
    process.env.LIBRARY_EVERGREEN_CHECK?.trim().toLowerCase() !== 'off';

/**
 * Throws in production when the check is on and TYPESAFE_API_KEY is unset,
 * so the server refuses to start (src/instrumentation.ts). Elsewhere it logs
 * the problem, and each publish answers 503.
 */
export const checkEvergreenKey = (
    production: boolean,
    log: (message: string) => void = console.warn,
): void => {
    if (!evergreenCheckOn() || process.env.TYPESAFE_API_KEY?.trim()) {
        return;
    }

    if (production) {
        throw new Error(KEY_PROBLEM);
    }

    log(KEY_PROBLEM);
};

/**
 * The client's settings. Each attempt is capped at 5 s and the model is
 * pinned. A 429, a 5xx or a dropped connection gets one retry after the
 * SDK's backoff of under a second, whatever Retry-After the answer asks for,
 * and a timeout gets none. The SDK's logger is off, since its lines can
 * carry the request.
 */
export const CLIENT_CONFIG = {
    defaultModel: MODEL,
    timeout: 5_000,
    retry: { maxRetries: 1, apiTimeoutError: false, respectRetryAfter: false },
    logLevel: 'off',
} as const satisfies TypeSafeClientConfig;

/** Requests in flight at once for one text. The longest text makes about
 *  15 batches, so it takes two rounds. */
export const BATCH_CONCURRENCY = 8;

/** The most a check waits for all its batches, across retries and rounds.
 *  The batches still running then are cancelled and the check is
 *  unavailable. */
export const CHECK_DEADLINE_MS = 12_000;

let shared: TypeSafeClient | undefined;

// The constructor throws without an API key, which the check reads as
// unavailable, so a key set later is picked up by the next call.
const sharedClient = (): TypeSafeClient => (shared ??= new TypeSafeClient(CLIENT_CONFIG));

/** What the log lines name the artifact by. That is its id on an edit and
 *  its publish key on a publish, which has no id yet. */
export type EvergreenSubject = { artifact: string } | { publishKey: string };

const warn = (message: string, fields: Record<string, unknown>) =>
    console.warn(JSON.stringify({ severity: 'WARNING', message, ...fields }));

// A failure of the check that is not the SDK's own error.
class CheckFailure extends Error {
    readonly reason: 'unanswered' | 'model';

    constructor(reason: 'unanswered' | 'model') {
        super(reason);
        this.reason = reason;
    }
}

// Statuses of a request TypeSafe refuses for what it holds, such as its
// size or shape, which a retry would send again unchanged. Auth failures,
// 408 and 429 are left out.
const refusedRequest = (error: unknown): error is APIError =>
    error instanceof APIError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 402, 403, 408, 429].includes(error.status);

// Why the check could not run, as a word for the log line. The SDK's error
// messages can carry the request, so only its classes are named.
const causeOf = (error: unknown): string => {
    if (error instanceof CheckFailure) {
        return error.reason;
    }

    if (error instanceof APITimeoutError || error instanceof APIUserAbortError) {
        return 'timeout';
    }

    if (error instanceof APIConnectionError) {
        return 'connection';
    }

    // Otherwise a missing key or a request the SDK refused to send.
    return error instanceof APIError ? 'http' : 'client';
};

/**
 * The answer when TypeSafe gave none. A request TypeSafe refused for its
 * content is 502 `evergreen_check_refused`, which a retry would not mend,
 * and anything else is 503 `evergreen_check_unavailable` with Retry-After.
 */
const unavailable = (error: unknown, subject: EvergreenSubject): Response => {
    const refused = refusedRequest(error);

    console.error(
        JSON.stringify({
            severity: 'ERROR',
            message: refused ? 'library_evergreen_refused' : 'library_evergreen_unavailable',
            ...subject,
            cause: causeOf(error),
            status: error instanceof APIError ? error.status : null,
        }),
    );

    return refused
        ? problem({
              status: 502,
              code: 'evergreen_check_refused',
              detail: 'The check that the text is evergreen refused this text. Trying again will not help.',
              retryable: false,
              headers: NO_STORE,
          })
        : problem({
              status: 503,
              code: 'evergreen_check_unavailable',
              detail: 'The check that the text is evergreen could not run. Try again in a moment.',
              retryable: true,
              headers: { ...NO_STORE, 'Retry-After': '5' },
          });
};

// Asks about one batch, and decides it.
const judge = async (
    client: TypeSafeClient,
    batch: readonly Candidate[],
    signal: AbortSignal,
): Promise<{ refusals: EvergreenRefusal[]; doubts: EvergreenDoubt[] }> => {
    const { model, answers } = await client.systemOne(
        { ...evergreenRequest(batch), model: MODEL },
        { signal },
    );

    if (model !== MODEL) {
        throw new CheckFailure('model');
    }

    const decision = decide(batch, answers);

    if (!decision.answered) {
        throw new CheckFailure('unanswered');
    }

    return decision;
};

// Runs `work` on every batch, `BATCH_CONCURRENCY` at a time, in order.
// The first failure cancels the rest and is thrown.
const everyBatch = async <TResult>(
    batches: readonly Candidate[][],
    work: (batch: readonly Candidate[], signal: AbortSignal) => Promise<TResult>,
): Promise<TResult[]> => {
    const stop = new AbortController();
    const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(CHECK_DEADLINE_MS)]);
    const results: TResult[] = new Array(batches.length);
    let next = 0;

    const worker = async () => {
        while (next < batches.length && !signal.aborted) {
            const at = next++;

            try {
                results[at] = await work(batches[at], signal);
            } catch (error) {
                stop.abort();

                throw error;
            }
        }
    };

    const runs = await Promise.allSettled(
        Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, worker),
    );
    const rejected = runs.flatMap((run) => (run.status === 'rejected' ? [run.reason] : []));

    // The failure that cancelled the rest, else the deadline's cancellation.
    if (rejected.length > 0) {
        throw rejected.find((reason) => !(reason instanceof APIUserAbortError)) ?? rejected[0];
    }

    return results;
};

/**
 * Checks `text` against the evergreen rule, in batches of `GROUP_SIZE`
 * sentences sent in parallel. Null when every sentence passes, when there is
 * no text to check, or when the check is switched off. Otherwise it is the
 * answer to send. That is 400 `not_evergreen` with one entry in `errors`
 * per refused sentence and `pointer` naming the first one's field, or 503
 * `evergreen_check_unavailable` with Retry-After when TypeSafe cannot answer
 * (no key, a timeout, a 429, a 5xx, an auth error, an unanswered question or
 * another model), or 502 `evergreen_check_refused` when TypeSafe refuses the
 * request itself. `subject` names the artifact in the log lines.
 */
export const evergreenRefusal = async (
    text: EvergreenText,
    subject: EvergreenSubject,
    client: () => TypeSafeClient = sharedClient,
): Promise<Response | null> => {
    if (!evergreenCheckOn()) {
        warn('library_evergreen_check_off', subject);

        return null;
    }

    const candidates = candidatesOf(text);

    if (candidates.length === 0) {
        return null;
    }

    let decisions: Awaited<ReturnType<typeof judge>>[];

    try {
        const typesafe = client();

        decisions = await everyBatch(batchesOf(candidates), (batch, signal) =>
            judge(typesafe, batch, signal),
        );
    } catch (error) {
        return unavailable(error, subject);
    }

    for (const doubt of decisions.flatMap((decision) => decision.doubts)) {
        warn('library_evergreen_doubt', { ...subject, ...doubt });
    }

    const refusals = decisions.flatMap((decision) => decision.refusals);
    const [first] = refusals;

    if (!first) {
        return null;
    }

    return problem({
        status: 400,
        code: 'not_evergreen',
        detail: EVERGREEN_FIX,
        retryable: false,
        headers: NO_STORE,
        extra: { pointer: first.pointer, errors: refusals },
    });
};
