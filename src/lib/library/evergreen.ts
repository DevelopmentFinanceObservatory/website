import 'server-only';

import {
    APIConnectionError,
    APIError,
    APITimeoutError,
    TypeSafeClient,
    type TypeSafeClientConfig,
} from '@typesafe-ai/sdk';

import { problem } from '@/lib/proxy/problem';

import {
    EVERGREEN_FIX,
    type EvergreenText,
    MODEL,
    candidatesOf,
    decide,
    evergreenRequest,
} from './evergreenRule';

export { KIND_MIN, MODEL, T_HIGH, T_LOW } from './evergreenRule';

/*
 * The evergreen check the publish and edit routes run on an artifact's text
 * (./evergreenRule.ts has the rule and the questions). It fails closed: when
 * TypeSafe cannot answer, the route answers 503 `evergreen_check_unavailable`
 * and nothing is stored, since a publish that skipped the check would show
 * the stale text the check exists to stop. LIBRARY_EVERGREEN_CHECK=off is the
 * operator's switch for an outage. No line logged here carries the text:
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
 * The client's settings: the pinned model, a 5 s cap on each attempt and one
 * retry on a 429, a 5xx or a dropped connection, but none after a timeout,
 * so a stalled check answers within about 10 s. The SDK's logger is off,
 * since its lines can carry the request.
 */
export const CLIENT_CONFIG = {
    defaultModel: MODEL,
    timeout: 5_000,
    retry: { maxRetries: 1, apiTimeoutError: false },
    logLevel: 'off',
} as const satisfies TypeSafeClientConfig;

let shared: TypeSafeClient | undefined;

// The constructor throws without an API key, which the check reads as
// unavailable, so a key set later is picked up by the next call.
const sharedClient = (): TypeSafeClient => (shared ??= new TypeSafeClient(CLIENT_CONFIG));

const warn = (message: string, fields: Record<string, unknown> = {}) =>
    console.warn(JSON.stringify({ severity: 'WARNING', message, ...fields }));

// Why the check could not run, as a word for the log line: the SDK's error
// classes, whose messages can carry the request, or `unanswered`.
const causeOf = (error: unknown): string => {
    if (error === 'unanswered') {
        return error;
    }

    if (error instanceof APITimeoutError) {
        return 'timeout';
    }

    if (error instanceof APIConnectionError) {
        return 'connection';
    }

    // A missing key or a request the SDK refused to send.
    return error instanceof APIError ? 'http' : 'client';
};

const unavailable = (error: unknown): Response => {
    console.error(
        JSON.stringify({
            severity: 'ERROR',
            message: 'library_evergreen_unavailable',
            cause: causeOf(error),
            status: error instanceof APIError ? error.status : null,
        }),
    );

    return problem({
        status: 503,
        code: 'evergreen_check_unavailable',
        detail: 'The check that the text is evergreen could not run. Try again in a moment.',
        retryable: true,
        headers: { ...NO_STORE, 'Retry-After': '5' },
    });
};

/**
 * Checks `text` against the evergreen rule, in one TypeSafe request. Null
 * when every sentence passes, when there is no text to check, or when the
 * check is switched off. Otherwise the answer to send: 400 `not_evergreen`
 * with one entry in `errors` per refused sentence, and `pointer` naming the
 * first one's field, or 503 `evergreen_check_unavailable` with Retry-After
 * when TypeSafe cannot answer (no key, a timeout, a 429, a 5xx, an auth
 * error or an unanswered question).
 */
export const evergreenRefusal = async (
    text: EvergreenText,
    client: () => TypeSafeClient = sharedClient,
): Promise<Response | null> => {
    if (!evergreenCheckOn()) {
        warn('library_evergreen_check_off');

        return null;
    }

    const candidates = candidatesOf(text);

    if (candidates.length === 0) {
        return null;
    }

    let answers: Record<string, unknown>;

    try {
        ({ answers } = await client().systemOne({
            ...evergreenRequest(candidates),
            model: MODEL,
        }));
    } catch (error) {
        return unavailable(error);
    }

    const decision = decide(candidates, answers);

    if (!decision.answered) {
        return unavailable('unanswered');
    }

    for (const doubt of decision.doubts) {
        warn('library_evergreen_doubt', doubt);
    }

    const [first] = decision.refusals;

    if (!first) {
        return null;
    }

    return problem({
        status: 400,
        code: 'not_evergreen',
        detail: EVERGREEN_FIX,
        retryable: false,
        headers: NO_STORE,
        extra: { pointer: first.pointer, errors: decision.refusals },
    });
};
