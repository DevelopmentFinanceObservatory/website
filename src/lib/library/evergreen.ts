import 'server-only';

import {
    APIConnectionError,
    APIError,
    APITimeoutError,
    APIUserAbortError,
    TypeSafeClient,
    type TypeSafeClientConfig,
} from '@typesafe-ai/sdk';

import { SharesError } from '@/lib/chat/apisShares';
import { problem } from '@/lib/proxy/problem';
import { BackendError } from '@/lib/studio/liveBackend';

import {
    CHECK_DEADLINE_MS,
    type Candidate,
    EVERGREEN_FIX,
    type EvergreenDecision,
    type EvergreenRefusal,
    type EvergreenText,
    type EvergreenWarning,
    MAX_CANDIDATES,
    MODEL,
    REQUEST_CONCURRENCY,
    candidatesOf,
    decide,
    evergreenRequest,
    namesYear,
    overBudget,
} from './evergreenRule';
import { PERIOD_DEADLINE_MS, type PeriodsFound } from './periods';

export { MODEL, T_HIGH, T_KIND, T_LOW } from './evergreenRule';

/*
 * The evergreen check the publish and edit routes run on an artifact's text
 * (./evergreenRule.ts has the rule and the questions). It fails closed. When
 * TypeSafe cannot answer, the route answers 503 `evergreen_check_unavailable`
 * and nothing is stored, since a publish that skipped the check would show
 * the stale text the check exists to stop. Publishing stays closed until
 * TypeSafe answers again. Pages and other routes never call TypeSafe, so a
 * missing key or an outage touches only these two routes. No line logged
 * here carries the text.
 * TypeSafe's own errors echo their input, so neither their message nor the
 * SDK's logger is used.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

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

export { CHECK_DEADLINE_MS, MAX_CANDIDATES, REQUEST_CONCURRENCY } from './evergreenRule';

let shared: TypeSafeClient | undefined;

// The client for TYPESAFE_API_KEY, made at the first check that has a key.
// Without one the check is unavailable, logged as `missing_key`.
const sharedClient = (): TypeSafeClient => {
    const apiKey = process.env.TYPESAFE_API_KEY?.trim();

    if (!apiKey) {
        throw new CheckFailure('missing_key');
    }

    return (shared ??= new TypeSafeClient({ ...CLIENT_CONFIG, apiKey }));
};

/** What the log lines name the artifact by. That is its id on an edit and
 *  its publish key on a publish, which has no id yet. */
export type EvergreenSubject = { artifact: string } | { publishKey: string };

const warn = (message: string, fields: Record<string, unknown>) =>
    console.warn(JSON.stringify({ severity: 'WARNING', message, ...fields }));

// A failure of the check that is not the SDK's own error.
class CheckFailure extends Error {
    readonly reason: 'unanswered' | 'model' | 'missing_key' | 'timeout';

    constructor(reason: 'unanswered' | 'model' | 'missing_key' | 'timeout') {
        super(reason);
        this.reason = reason;
    }
}

// A request TypeSafe refuses for the text it holds, as malformed (400) or
// too large (413), which a retry would send again unchanged. Every other
// status means the check could not run.
const refusedRequest = (error: unknown): error is APIError =>
    error instanceof APIError && (error.status === 400 || error.status === 413);

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

// Asks about one sentence, and answers what TypeSafe said.
const judge = async (client: TypeSafeClient, candidate: Candidate, signal: AbortSignal) => {
    const { model, answers } = await client.systemOne(
        { ...evergreenRequest(candidate), model: MODEL },
        { signal },
    );

    if (model !== MODEL) {
        throw new CheckFailure('model');
    }

    return answers;
};

/** What the modes of the data cards the artifact shows come to
 *  (./periods.ts), asked only when some checked sentence names a year
 *  (`namesYear`). It ends when `signal` does. */
export type PeriodLookup = (signal: AbortSignal) => Promise<PeriodsFound>;

// Whether every data card is known to be fixed. A card whose periods are not
// known to be fixed may roll, so a failed lookup, one past its deadline, or
// one that found no mode counts as rolling, and is logged by its
// machine-readable cause alone.
const periodsFixed = async (
    lookup: PeriodLookup,
    deadline: number,
    subject: EvergreenSubject,
): Promise<boolean> => {
    const signal = AbortSignal.timeout(deadline);
    const expired = new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(new CheckFailure('timeout')), {
            once: true,
        }),
    );

    try {
        const found = await Promise.race([lookup(signal), expired]);

        if (found !== 'fixed' && found !== 'rolling') {
            warn('library_period_mode_unknown', { ...subject, cause: found });
        }

        return found === 'fixed';
    } catch (error) {
        const cause =
            error instanceof CheckFailure
                ? error.reason
                : error instanceof BackendError || error instanceof SharesError
                  ? error.code
                  : 'client';

        warn('library_period_mode_unknown', { ...subject, cause });

        return false;
    }
};

/** How `evergreenCheck` runs: the artifact's `mode`, the TypeSafe client,
 *  the whole check's deadline in milliseconds, and the live artifact's
 *  `periods` lookup. */
export type CheckOptions = {
    mode?: 'live' | 'snapshot';
    client?: () => TypeSafeClient;
    deadline?: number;
    periods?: PeriodLookup;
};

// Runs `work` on every candidate, `REQUEST_CONCURRENCY` at a time, in order.
// The first failure cancels the rest and is thrown. When `deadline` passes
// first, the check fails as a timeout, even where a request that ignored
// the cancellation still answered.
const everyCandidate = async <TResult>(
    candidates: readonly Candidate[],
    work: (candidate: Candidate, signal: AbortSignal) => Promise<TResult>,
    deadline: number,
): Promise<TResult[]> => {
    const stop = new AbortController();
    const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(deadline)]);
    const results: TResult[] = new Array(candidates.length);
    let next = 0;
    let done = 0;

    const worker = async () => {
        while (next < candidates.length && !signal.aborted) {
            const at = next++;

            try {
                results[at] = await work(candidates[at], signal);
                done += 1;
            } catch (error) {
                stop.abort();

                throw error;
            }
        }
    };

    const runs = await Promise.allSettled(
        Array.from({ length: Math.min(REQUEST_CONCURRENCY, candidates.length) }, worker),
    );
    const rejected = runs.flatMap((run) => (run.status === 'rejected' ? [run.reason] : []));

    // The failure that cancelled the rest, else the deadline's cancellation.
    if (rejected.length > 0) {
        throw rejected.find((reason) => !(reason instanceof APIUserAbortError)) ?? rejected[0];
    }

    if (signal.aborted || done < candidates.length) {
        throw new CheckFailure('timeout');
    }

    return results;
};

/** A sentence that passed with a warning, as the routes return it. */
export type EvergreenNotice = Omit<EvergreenWarning, 'noul'>;

/** The check's result. `refusal` is the answer to send; `warnings` go out
 *  with the route's own answer. */
export type EvergreenCheck = { refusal: Response } | { warnings: EvergreenNotice[] };

const notices = (warnings: readonly EvergreenWarning[]): EvergreenNotice[] =>
    warnings.map(({ pointer, start, end, quote, kind }) => ({ pointer, start, end, quote, kind }));

/**
 * Checks `text` against the evergreen rule, one request per sentence, up to
 * `REQUEST_CONCURRENCY` at once. When nothing is refused the result is the
 * warnings, one per sentence `decide` passed with a warning, and none when
 * there is no text to check or the artifact is a snapshot, whose text is not
 * checked. Otherwise it is the refusal to send. That is 400
 * `evergreen_too_long` at the field that takes the text past
 * `MAX_CANDIDATES` sentences, with `limit`, before any call. It is 400
 * `not_evergreen` with one entry in `errors` per refused sentence, `pointer`
 * naming the first one's field and the `warnings`, or 503
 * `evergreen_check_unavailable` with Retry-After when TypeSafe cannot answer
 * (no key, a timeout, a 5xx, a 4xx other than 400 or 413, an unanswered
 * question or another model), or 502 `evergreen_check_refused` when TypeSafe
 * refuses the text with a 400 or a 413. The whole check stops after
 * `deadline`. When a sentence in any field names a year and `periods` says
 * every data card is fixed, the year rules spare the title and headings, and
 * a sentence passes unless its `value`, `ranking` or `change` Noul names a
 * claim (`decide`). The lookup starts once
 * there is a client and runs beside the requests, for at most
 * `PERIOD_DEADLINE_MS`. A failure, or a card whose mode it cannot name,
 * counts as rolling and is logged as `library_period_mode_unknown` with its
 * `cause`. `subject` names the
 * artifact in the log lines. `library_evergreen_not_evergreen` logs each
 * refused sentence and `library_evergreen_doubt` each warned one, with its
 * field, offsets, kind and all five Nouls, and without its text.
 */
export const evergreenCheck = async (
    text: EvergreenText,
    subject: EvergreenSubject,
    {
        mode = 'live',
        client = sharedClient,
        deadline = CHECK_DEADLINE_MS,
        periods,
    }: CheckOptions = {},
): Promise<EvergreenCheck> => {
    const candidates = candidatesOf(text);

    // A snapshot's data stays as published, so its text cannot go stale.
    if (mode === 'snapshot' || candidates.length === 0) {
        return { warnings: [] };
    }

    const over = overBudget(candidates);

    if (over) {
        return {
            refusal: problem({
                status: 400,
                code: 'evergreen_too_long',
                detail: `The text is too long to check. Keep it to ${MAX_CANDIDATES} sentences in all.`,
                retryable: false,
                headers: NO_STORE,
                extra: {
                    pointer: over.pointer,
                    limit: MAX_CANDIDATES,
                    sentences: candidates.length,
                },
            }),
        };
    }

    let decisions: EvergreenDecision[];

    try {
        const typesafe = client();
        // Started once there is a client, so a check that cannot run reads
        // no card.
        const fixedPeriods =
            periods && candidates.some(namesYear)
                ? periodsFixed(periods, Math.min(PERIOD_DEADLINE_MS, deadline), subject)
                : Promise.resolve(false);
        const answers = await everyCandidate(
            candidates,
            (candidate, signal) => judge(typesafe, candidate, signal),
            deadline,
        );
        const context = { fixedPeriods: await fixedPeriods };

        decisions = candidates.map((candidate, at) =>
            decide(candidate, answers[at], undefined, context),
        );

        if (decisions.some((decision) => decision.outcome === 'unanswered')) {
            throw new CheckFailure('unanswered');
        }
    } catch (error) {
        return { refusal: unavailable(error, subject) };
    }

    const refusals: EvergreenRefusal[] = [];
    const warnings: EvergreenWarning[] = [];

    for (const decision of decisions) {
        if (decision.outcome === 'refused') {
            refusals.push(decision.refusal);
        } else if (decision.outcome === 'warned') {
            warnings.push(decision.warning);
        }
    }

    for (const decision of decisions) {
        if (decision.outcome === 'refused') {
            const { pointer, start, end, kind } = decision.refusal;

            warn('library_evergreen_not_evergreen', {
                ...subject,
                pointer,
                start,
                end,
                kind,
                rule: decision.rule,
                nouls: decision.score.nouls,
            });
        } else if (decision.outcome === 'warned') {
            const { pointer, start, end, kind } = decision.warning;

            warn('library_evergreen_doubt', {
                ...subject,
                pointer,
                start,
                end,
                kind,
                noul: decision.score.stale,
                nouls: decision.score.nouls,
            });
        }
    }

    const [first] = refusals;

    if (!first) {
        return { warnings: notices(warnings) };
    }

    return {
        refusal: problem({
            status: 400,
            code: 'not_evergreen',
            detail: EVERGREEN_FIX,
            retryable: false,
            headers: NO_STORE,
            extra: { pointer: first.pointer, errors: refusals, warnings: notices(warnings) },
        }),
    };
};
