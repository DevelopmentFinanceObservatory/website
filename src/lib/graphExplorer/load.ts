/**
 * Requests to the Graph API through the site's proxy, with one rule for
 * waiting and one mapping of failures. The Graph API builds the ontology
 * documents once per graph generation and answers 503 with `Retry-After`
 * while a build runs, and the proxy answers 429 with `Retry-After` once a
 * reader's allowance of calls is spent. Either is waited out for up to a
 * minute. Every other failure becomes an error naming the request and what
 * went wrong, including a response whose shape the guard refuses.
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

/** What the Graph API is doing while it answers 503 with `Retry-After`. */
export const BUILDING = 'building the model for this graph';

/**
 * Why a request is waiting: the Graph API is building its model (503), or
 * the site's proxy has had too many calls from this address (429).
 */
export type WaitCause = 'building' | 'busy';

/** The statuses that are waited out when they carry `Retry-After`, and why. */
const WAITED: ReadonlyMap<number, WaitCause> = new Map([
    [503, 'building'],
    [429, 'busy'],
]);

/** The line shown while a request waits. */
export const waitText = (retryInMs: number, cause: WaitCause): string => {
    const seconds = Math.ceil(retryInMs / 1000);
    const lead =
        cause === 'building'
            ? `The Graph API is still ${BUILDING}.`
            : 'This site has had many requests from your address in the last minute.';
    return `${lead} Trying again in ${seconds} s.`;
};

/**
 * Why a request to the Graph API failed: it could not be sent, it took too
 * long, its body was not JSON or out of shape, it answered a failing status,
 * or the model was still being built when the wait ran out.
 */
export type FailureReason =
    'unreachable' | 'timeout' | 'not_json' | 'shape' | 'status' | 'build_timeout';

export type FailureDetails<TReason extends string> = {
    readonly reason: TReason;
    /** The failing status, for `status` and `build_timeout`. */
    readonly status?: number;
    /** The problem's detail or the guard's complaint, when there is one. */
    readonly detail?: string | null;
    readonly cause?: unknown;
};

/** A failed Graph API request. `message` is for the reader, the rest for code. */
export class GraphFailure<TReason extends string> extends Error {
    readonly reason: TReason;
    readonly status: number | null;
    readonly detail: string | null;

    constructor(message: string, { reason, status, detail, cause }: FailureDetails<TReason>) {
        super(message, cause === undefined ? undefined : { cause });
        this.reason = reason;
        this.status = status ?? null;
        this.detail = detail ?? null;
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

/** The problem title or detail of an error body, when it has one. */
export const problemText = async (response: Response): Promise<string | null> => {
    try {
        const body = asRecord(await response.json());
        const text = body?.detail ?? body?.title;
        return typeof text === 'string' && text !== '' ? text : null;
    } catch {
        return null;
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
    readonly refusal?: (status: number, problem: string | null) => TAnswer | null;
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
 * RETRY_WAIT_MS after the first wait. Another failing status is read
 * through `refusal`, and fails when that gives null. A request past the
 * bounds, its failing body included, fails with reason `timeout`. An abort
 * rejects with the caller's signal's reason, untouched.
 */
export async function requestGraph<TAnswer>(
    request: GraphRequest<TAnswer>,
    options: RequestOptions,
): Promise<TAnswer> {
    const { bounds, words, fail, onWait, fetch: send = fetch, sleep = abortable } = options;
    const now = options.now ?? Date.now;
    const timeout = (cause?: unknown) =>
        fail(`${words.stopped}: the Graph API did not answer in time.`, {
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
                fail(`${words.unsent}: the Graph API did not answer.`, {
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
                    { reason: 'shape', detail: error.message, cause: error },
                );
            }
        }

        const at = now();
        firstWait ??= at;
        const { status } = response;
        const delay = retryDelay({
            status,
            retryAfter: response.headers.get('retry-after'),
            waitedMs: at - firstWait,
            nowMs: at,
        });
        if (delay !== null) {
            onWait?.(delay, WAITED.get(status) ?? 'building');
            try {
                await sleep(delay, bounds.run);
            } catch (error) {
                throw failed(error, () => error);
            }
            continue;
        }

        const problem = await problemText(response);
        if (problem === null && bounds.timedOut()) throw timeout();
        const answer = request.refusal?.(status, problem) ?? null;
        if (answer !== null) return answer;
        const waited = response.headers.has('retry-after') ? WAITED.get(status) : undefined;
        if (waited === 'building') {
            throw fail(`${words.stopped}: the Graph API was still ${BUILDING} after a minute.`, {
                reason: 'build_timeout',
                status,
                detail: problem,
            });
        }
        if (waited === 'busy') {
            throw fail(
                `${words.stopped}: this site was still refusing requests from your address after a minute.`,
                { reason: 'status', status, detail: problem },
            );
        }
        throw fail(
            `${words.stopped}: the Graph API answered ${status}${problem ? ` (${problem})` : ''}.`,
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
 * ("The ontology"). A request past `requestTimeoutMs`, or a load past
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
