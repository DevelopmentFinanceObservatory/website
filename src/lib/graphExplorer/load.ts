/**
 * Fetching one ontology document through its guard. The Graph API builds the
 * documents once per graph generation and answers 503 with `Retry-After`
 * while a build runs; the loader waits and asks again for up to a minute.
 * Every other failure becomes a LoadError naming the document and what went
 * wrong, including a response whose shape the guard refuses.
 */
import { asRecord } from '../asRecord.ts';
import { WireShapeError } from './wire.ts';

/** How long the loader keeps asking while a document is being built. */
export const BUILD_WAIT_MS = 60_000;

/** The wait when `Retry-After` is present but unreadable. */
const FALLBACK_RETRY_MS = 5_000;

/** The shortest wait between two requests. */
const MIN_RETRY_MS = 1_000;

/** How long one request may take, its body included. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** How long loading one document may take, waits for a build included. */
export const LOAD_LIMIT_MS = 2 * 60_000;

/** What the Graph API is doing while it answers 503 with `Retry-After`. */
export const BUILDING = 'building the model for this graph';

/** The line shown while a build is waited out. */
export const waitText = (retryInMs: number): string =>
    `The Graph API is still ${BUILDING}. Trying again in ${Math.ceil(retryInMs / 1000)} s.`;

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

/** A failed Graph API request: `message` for the reader, the rest for code. */
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

/** A document that could not be loaded; `message` says which and why. */
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
        run,
        request: (): AbortSignal => {
            current = AbortSignal.any([run, AbortSignal.timeout(requestMs)]);
            return current;
        },
        timedOut: (): boolean => !signal?.aborted && (run.aborted || current.aborted),
    };
};

/** Milliseconds a `Retry-After` value asks for: delta seconds or an HTTP date. */
const retryAfterMs = (header: string, nowMs: number): number => {
    const trimmed = header.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
    const date = Date.parse(trimmed);
    return Number.isNaN(date) ? FALLBACK_RETRY_MS : date - nowMs;
};

/**
 * How long to wait before asking again, or null to stop: only a 503 that
 * carries `Retry-After` is retried, and never past BUILD_WAIT_MS after the
 * first request.
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
    if (status !== 503 || retryAfter === null) return null;
    const remaining = BUILD_WAIT_MS - waitedMs;
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

export type LoadOptions = {
    readonly signal?: AbortSignal;
    /** The bound on one request; REQUEST_TIMEOUT_MS by default. */
    readonly requestTimeoutMs?: number;
    /** The bound on the whole load; LOAD_LIMIT_MS by default. */
    readonly limitMs?: number;
    /** Called before each wait for a document still being built. */
    readonly onWait?: (retryInMs: number) => void;
    readonly fetch?: typeof fetch;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly now?: () => number;
};

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
    const { signal, onWait, fetch: get = fetch, sleep = abortable, now = Date.now } = options;
    const bounds = bounded(signal, {
        limitMs: options.limitMs ?? LOAD_LIMIT_MS,
        requestMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    });
    const started = now();
    /** The error to raise for `error`: the caller's abort untouched, a bound as `timeout`, else `fallback`. */
    const failed = (error: unknown, fallback: () => unknown): unknown => {
        if (signal?.aborted) return error;
        if (bounds.timedOut()) {
            return new LoadError(
                `${what} could not be loaded: the Graph API did not answer in time.`,
                {
                    reason: 'timeout',
                    cause: error,
                },
            );
        }
        return fallback();
    };

    for (;;) {
        let response: Response;
        try {
            response = await get(url, {
                signal: bounds.request(),
                headers: { accept: 'application/json' },
            });
        } catch (error) {
            throw failed(
                error,
                () =>
                    new LoadError(`${what} could not be requested: the Graph API did not answer.`, {
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
                throw failed(
                    error,
                    () =>
                        new LoadError(`${what} arrived, but not as JSON.`, {
                            reason: 'not_json',
                            cause: error,
                        }),
                );
            }
            try {
                return read(body);
            } catch (error) {
                if (error instanceof WireShapeError) {
                    throw new LoadError(
                        `${what} has a shape this page does not read: ${error.message}.`,
                        { reason: 'shape', detail: error.message, cause: error },
                    );
                }
                throw error;
            }
        }

        const delay = retryDelay({
            status: response.status,
            retryAfter: response.headers.get('retry-after'),
            waitedMs: now() - started,
            nowMs: now(),
        });
        if (delay !== null) {
            onWait?.(delay);
            try {
                await sleep(delay, bounds.run);
            } catch (error) {
                throw failed(error, () => error);
            }
            continue;
        }

        const problem = await problemText(response);
        if (response.status === 503 && response.headers.has('retry-after')) {
            throw new LoadError(
                `${what} could not be loaded: the Graph API was still ${BUILDING} after a minute.`,
                { reason: 'build_timeout', status: response.status, detail: problem },
            );
        }
        throw new LoadError(
            `${what} could not be loaded: the Graph API answered ${response.status}${problem ? ` (${problem})` : ''}.`,
            { reason: 'status', status: response.status, detail: problem },
        );
    }
}
