/**
 * Requests to the Graph API through the site's proxy, with one rule for
 * waiting and one mapping of failures. The Graph API builds the schema
 * documents once per graph generation and answers 503 with `Retry-After`
 * while a build runs (`cause.code` `schema_building`) or while the check's
 * workers are busy (`check_busy`), and the proxy answers 429 with
 * `Retry-After` once a reader's allowance of calls is spent. Either is
 * waited out for up to a minute, unless the problem says `retryable: false`.
 * Every other failure becomes an error naming the request and what went
 * wrong, including a response whose shape the guard refuses.
 */
import { asRecord } from '../asRecord.ts';
import { WireShapeError } from './wire.ts';

/** How long one request keeps asking while the Graph API is building or the proxy refuses. */
export const RETRY_WAIT_MS = 60_000;

/** The wait when `Retry-After` is present but unreadable. */
const FALLBACK_RETRY_MS = 5_000;

/** The shortest wait between two requests. */
const MIN_RETRY_MS = 1_000;

/** How long one request may take, its body included. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** How long loading one document may take, waits included. */
export const LOAD_LIMIT_MS = 2 * 60_000;

/** What the Graph API is doing while it answers 503 with `cause.code` `schema_building`. */
export const BUILDING = 'building the schema for this graph';

/**
 * Why a request is waiting: the Graph API is building the schema
 * (`schema_building`), its check workers are busy (`check_busy`), it is
 * unavailable for a cause this page does not know (`unavailable`), or the
 * site's proxy has had too many calls from this address (`busy`, a 429).
 */
export type WaitCause = 'schema_building' | 'check_busy' | 'unavailable' | 'busy';

/** The statuses that are waited out when they carry `Retry-After`. */
const WAITED: ReadonlySet<number> = new Set([503, 429]);

/** What the Graph API is doing, by the cause of its 503. */
const UNAVAILABLE: Readonly<Record<Exclude<WaitCause, 'busy'>, string>> = {
    schema_building: `still ${BUILDING}`,
    check_busy: 'busy with other checks',
    unavailable: 'not ready to answer',
};

/** The wait cause a 503's `cause.code` names. A code this page does not know reads as `unavailable`. */
const unavailableCause = (code: string | null): Exclude<WaitCause, 'busy'> =>
    code === 'schema_building' || code === 'check_busy' ? code : 'unavailable';

/** The line shown while a request waits. */
export const waitText = (retryInMs: number, cause: WaitCause): string => {
    const seconds = Math.ceil(retryInMs / 1000);
    const lead =
        cause === 'busy'
            ? 'This site has had many requests from your address in the last minute.'
            : `The Graph API is ${UNAVAILABLE[cause]}.`;
    return `${lead} Trying again in ${seconds} s.`;
};

/**
 * Why a request to the Graph API failed: it could not be sent, it took too
 * long, its body was not JSON or out of shape, it answered a failing status,
 * the schema was still being built when the wait ran out, or the Graph API
 * was still unavailable for another cause when the wait ran out.
 */
export type FailureReason =
    'unreachable' | 'timeout' | 'not_json' | 'shape' | 'status' | 'build_timeout' | 'unavailable';

export type FailureDetails<TReason extends string> = {
    readonly reason: TReason;
    /** The failing status, for `status`, `build_timeout` and `unavailable`. */
    readonly status?: number;
    /** The problem's detail or the guard's complaint, when there is one. */
    readonly detail?: string | null;
    /**
     * What went wrong as a sentence of its own, without the message's
     * opening that names the request: "The Graph API answered 500.". The
     * message stands in when there is none.
     */
    readonly explanation?: string;
    readonly cause?: unknown;
};

/** A failed Graph API request. `message` is for the reader, the rest for code. */
export class GraphFailure<TReason extends string> extends Error {
    readonly reason: TReason;
    readonly status: number | null;
    readonly detail: string | null;
    /** What went wrong, for a screen whose heading already names the request. */
    readonly explanation: string;

    constructor(
        message: string,
        { reason, status, detail, explanation, cause }: FailureDetails<TReason>,
    ) {
        super(message, cause === undefined ? undefined : { cause });
        this.reason = reason;
        this.status = status ?? null;
        this.detail = detail ?? null;
        this.explanation = explanation ?? message;
    }
}

/** A document that could not be loaded. `message` says which and why. */
export class LoadError extends GraphFailure<FailureReason> {
    override name = 'LoadError';
}

/**
 * The signals for one bounded run: `run` aborts when the caller aborts or
 * `limitMs` passes, and `request()` adds a bound of `requestMs` for one
 * request. `timedOut()` is true when a bound, not the caller, stopped it.
 */
export const bounded = (
    signal: AbortSignal | undefined,
    { limitMs, requestMs }: { limitMs: number; requestMs: number },
) => {
    const limit = AbortSignal.timeout(limitMs);
    const run = signal ? AbortSignal.any([signal, limit]) : limit;
    let current = run;
    return {
        signal,
        run,
        request: (): AbortSignal => {
            current = AbortSignal.any([run, AbortSignal.timeout(requestMs)]);
            return current;
        },
        timedOut: (): boolean => !signal?.aborted && (run.aborted || current.aborted),
    };
};

export type Bounds = ReturnType<typeof bounded>;

/** Milliseconds a `Retry-After` value asks for: delta seconds or an HTTP date. */
const retryAfterMs = (header: string, nowMs: number): number => {
    const trimmed = header.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
    const date = Date.parse(trimmed);
    return Number.isNaN(date) ? FALLBACK_RETRY_MS : date - nowMs;
};

/**
 * How long to wait before asking again, or null to stop. Only a 503 or a
 * 429 that carries `Retry-After` is retried, and not past RETRY_WAIT_MS
 * after the first wait.
 */
export const retryDelay = ({
    status,
    retryAfter,
    waitedMs,
    nowMs,
}: {
    status: number;
    retryAfter: string | null;
    waitedMs: number;
    nowMs: number;
}): number | null => {
    if (!WAITED.has(status) || retryAfter === null) return null;
    const remaining = RETRY_WAIT_MS - waitedMs;
    if (remaining <= 0) return null;
    return Math.min(Math.max(retryAfterMs(retryAfter, nowMs), MIN_RETRY_MS), remaining);
};

/** Resolves after `ms`, or rejects with the signal's reason when it aborts first. */
export const abortable = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);
                reject(signal.reason);
            },
            { once: true },
        );
    });

/** What an error body says. Each member is null when the body does not say it. */
export type Problem = {
    /** Its detail, else its title. */
    readonly text: string | null;
    /** The pointer into the request it names. */
    readonly pointer: string | null;
    /** `cause.code`: why the Graph API is unavailable, on a 503. */
    readonly cause: string | null;
    /** False when asking again cannot help. */
    readonly retryable: boolean | null;
};

const NO_PROBLEM: Problem = { text: null, pointer: null, cause: null, retryable: null };

const nonEmpty = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

/** The problem of an error body. Every member is null when the body is not a problem. */
export const readProblem = async (response: Response): Promise<Problem> => {
    try {
        const body = asRecord(await response.json());
        return {
            text: nonEmpty(body?.detail) ?? nonEmpty(body?.title),
            pointer: nonEmpty(body?.pointer),
            cause: nonEmpty(asRecord(body?.cause)?.code),
            retryable: typeof body?.retryable === 'boolean' ? body.retryable : null,
        };
    } catch {
        return NO_PROBLEM;
    }
};

/** How a request's failures name it. */
export type RequestWords = {
    /** Heads a failure after the request went out: "The check stopped". */
    readonly stopped: string;
    /** Heads a request that could not go out: "The check could not be sent". */
    readonly unsent: string;
    /** Heads an answer the page cannot read: "The check answered". */
    readonly answered: string;
};

/** One request, with where it goes and how its answers are read. */
export type GraphRequest<TAnswer> = {
    readonly url: string;
    readonly init?: Omit<RequestInit, 'signal'>;
    /** The answer a 200's body gives. A WireShapeError is a `shape` failure. */
    readonly read: (body: unknown) => TAnswer;
    /** The answer a failing status gives, or null to fail with it. */
    readonly refusal?: (status: number, problem: Problem) => TAnswer | null;
};

export type RequestOptions = {
    readonly bounds: Bounds;
    readonly words: RequestWords;
    /** The error to raise for a failure. */
    readonly fail: (message: string, details: FailureDetails<FailureReason>) => Error;
    /** Called before each wait, with what the wait is for. */
    readonly onWait?: (retryInMs: number, cause: WaitCause) => void;
    readonly fetch?: typeof fetch;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly now?: () => number;
};

/**
 * Sends `request` until it is answered. A 200 is read through `read`. A
 * 503 or 429 with `Retry-After` waits and asks again, for up to
 * RETRY_WAIT_MS after the first wait, with the 503's `cause.code` as the
 * wait's cause. A problem saying `retryable: false` is never waited on.
 * Another failing status is read through `refusal`, and fails with the
 * problem's detail when that gives null. A request past the
 * bounds, its failing body included, fails with reason `timeout`. An abort
 * rejects with the caller's signal's reason, untouched.
 */
export async function requestGraph<TAnswer>(
    request: GraphRequest<TAnswer>,
    options: RequestOptions,
): Promise<TAnswer> {
    const { bounds, words, fail, onWait, fetch: send = fetch, sleep = abortable } = options;
    const now = options.now ?? Date.now;
    /** Fails with "<head>: <what>." as the message and "<What>." as the explanation. */
    const failAs = (
        head: string,
        what: string,
        details: Omit<FailureDetails<FailureReason>, 'explanation'>,
    ) =>
        fail(`${head}: ${what}.`, {
            ...details,
            explanation: `${what.charAt(0).toUpperCase()}${what.slice(1)}.`,
        });
    const timeout = (cause?: unknown) =>
        failAs(words.stopped, 'the Graph API did not answer in time', {
            reason: 'timeout',
            cause,
        });
    /** The error to raise for `error`: the caller's abort untouched, a bound as `timeout`, else `fallback`. */
    const failed = (error: unknown, fallback: () => unknown): unknown => {
        if (bounds.signal?.aborted) return error;
        return bounds.timedOut() ? timeout(error) : fallback();
    };

    let firstWait: number | null = null;
    for (;;) {
        let response: Response;
        try {
            response = await send(request.url, { ...request.init, signal: bounds.request() });
        } catch (error) {
            throw failed(error, () =>
                failAs(words.unsent, 'the Graph API did not answer', {
                    reason: 'unreachable',
                    cause: error,
                }),
            );
        }

        if (response.ok) {
            let body: unknown;
            try {
                body = await response.json();
            } catch (error) {
                throw failed(error, () =>
                    fail(`${words.answered} with a body that is not JSON.`, {
                        reason: 'not_json',
                        explanation: 'The Graph API answered with a body that is not JSON.',
                        cause: error,
                    }),
                );
            }
            try {
                return request.read(body);
            } catch (error) {
                if (!(error instanceof WireShapeError)) throw error;
                throw fail(
                    `${words.answered} with a shape this page does not read: ${error.message}.`,
                    {
                        reason: 'shape',
                        detail: error.message,
                        explanation: `The Graph API answered with a shape this page does not read: ${error.message}.`,
                        cause: error,
                    },
                );
            }
        }

        const { status } = response;
        const read = await readProblem(response);
        const problem = read.text;
        if (problem === null && bounds.timedOut()) throw timeout();

        const retryAfter = response.headers.get('retry-after');
        const waited = retryAfter !== null && WAITED.has(status) && read.retryable !== false;
        const at = now();
        if (waited) firstWait ??= at;
        const delay = waited
            ? retryDelay({ status, retryAfter, waitedMs: at - (firstWait ?? at), nowMs: at })
            : null;
        const cause = status === 429 ? 'busy' : unavailableCause(read.cause);
        if (delay !== null) {
            onWait?.(delay, cause);
            try {
                await sleep(delay, bounds.run);
            } catch (error) {
                throw failed(error, () => error);
            }
            continue;
        }

        const answer = request.refusal?.(status, read) ?? null;
        if (answer !== null) return answer;
        if (waited && cause !== 'busy') {
            throw failAs(
                words.stopped,
                `the Graph API was ${cause === 'check_busy' ? 'still ' : ''}${UNAVAILABLE[cause]} after a minute`,
                {
                    reason: cause === 'schema_building' ? 'build_timeout' : 'unavailable',
                    status,
                    detail: problem,
                },
            );
        }
        if (waited) {
            throw failAs(
                words.stopped,
                'this site was still refusing requests from your address after a minute',
                { reason: 'status', status, detail: problem },
            );
        }
        throw failAs(
            words.stopped,
            `the Graph API answered ${status}${problem ? ` (${problem})` : ''}`,
            { reason: 'status', status, detail: problem },
        );
    }
}

export type LoadOptions = {
    readonly signal?: AbortSignal;
    /** The bound on one request. REQUEST_TIMEOUT_MS by default. */
    readonly requestTimeoutMs?: number;
    /** The bound on the whole load. LOAD_LIMIT_MS by default. */
    readonly limitMs?: number;
    /** Called before each wait, with what the wait is for. */
    readonly onWait?: (retryInMs: number, cause: WaitCause) => void;
    readonly fetch?: typeof fetch;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly now?: () => number;
};

/**
 * The document at `url`, read through `read`. `what` names it in errors
 * ("The model"). A request past `requestTimeoutMs`, or a load past
 * `limitMs`, fails with reason `timeout`. An abort rejects with the
 * signal's reason, untouched.
 */
export async function loadDocument<TDocument>(
    what: string,
    url: string,
    read: (body: unknown) => TDocument,
    options: LoadOptions = {},
): Promise<TDocument> {
    const bounds = bounded(options.signal, {
        limitMs: options.limitMs ?? LOAD_LIMIT_MS,
        requestMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    });
    return requestGraph(
        { url, init: { headers: { accept: 'application/json' } }, read },
        {
            ...options,
            bounds,
            words: {
                stopped: `${what} could not be loaded`,
                unsent: `${what} could not be requested`,
                answered: `${what} arrived`,
            },
            fail: (message, details) => new LoadError(message, details),
        },
    );
}

/** A wait before the next try: how long, and why the Graph API or the site asked for it. */
export type Waiting = { readonly retryInMs: number; readonly cause: WaitCause };

/** Loading, waiting before a retry (`waiting` set), loaded, or failed with a message and why. */
export type Loadable<TValue> =
    | { readonly status: 'loading'; readonly waiting: Waiting | null }
    | { readonly status: 'ready'; readonly value: TValue }
    | {
          readonly status: 'failed';
          readonly reason: FailureReason | 'unexpected';
          /** The failure in full, naming the document: "The model could not be loaded: ...". */
          readonly message: string;
          /** What went wrong, for a screen whose heading names the document already. */
          readonly explanation: string;
      };

export const LOADING = { status: 'loading', waiting: null } as const;

/** A load failure as the screens show it. An error that is not a LoadError is logged with its cause. */
export const loadFailure = (error: unknown): Loadable<never> => {
    if (error instanceof LoadError) {
        return {
            status: 'failed',
            reason: error.reason,
            message: error.message,
            explanation: error.explanation,
        };
    }
    console.error('Graph Explorer: loading the model failed', error);
    return {
        status: 'failed',
        reason: 'unexpected',
        message: 'Something went wrong reading the model.',
        explanation: 'Something went wrong reading the model.',
    };
};

/** One load shared by every screen that asks for it. */
export type SharedLoad = {
    /** Begins the load unless it is running or done; `retry` also begins it again after a failure. */
    readonly start: (retry?: boolean) => void;
    /** Stops a running load and forgets it, so the next `start` begins it again. */
    readonly abort: () => void;
};

/**
 * A load that runs once for every caller of `start`, publishing each state
 * it passes through. `abort` forgets a load still running, publishing null,
 * so a caller that aborts and starts again (as React's StrictMode does with
 * an effect) gets a fresh load. A finished or failed load stays as it is.
 */
export function sharedLoad<TValue>({
    load,
    publish,
}: {
    load: (options: {
        signal: AbortSignal;
        onWait: (retryInMs: number, cause: WaitCause) => void;
    }) => Promise<TValue>;
    publish: (state: Loadable<TValue> | null) => void;
}): SharedLoad {
    let state: Loadable<TValue> | null = null;
    let running: AbortController | null = null;
    const set = (next: Loadable<TValue> | null) => {
        state = next;
        publish(next);
    };

    return {
        start: (retry = false) => {
            if (state !== null && !(retry && state.status === 'failed')) return;
            const controller = new AbortController();
            running = controller;
            const update = (next: Loadable<TValue>) => {
                if (controller.signal.aborted) return;
                if (next.status !== 'loading') running = null;
                set(next);
            };
            update(LOADING);
            load({
                signal: controller.signal,
                onWait: (retryInMs, cause) =>
                    update({ status: 'loading', waiting: { retryInMs, cause } }),
            }).then(
                (value) => update({ status: 'ready', value }),
                (error: unknown) => update(loadFailure(error)),
            );
        },
        abort: () => {
            if (running === null) return;
            running.abort();
            running = null;
            set(null);
        },
    };
}
