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

/** A document that could not be loaded; `message` says which and why. */
export class LoadError extends Error {
    override name = 'LoadError';
}

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
 * ("The ontology"). An abort rejects with the signal's reason, untouched.
 */
export async function loadDocument<TDocument>(
    what: string,
    url: string,
    read: (body: unknown) => TDocument,
    options: LoadOptions = {},
): Promise<TDocument> {
    const { signal, onWait, fetch: get = fetch, sleep = abortable, now = Date.now } = options;
    const started = now();

    for (;;) {
        let response: Response;
        try {
            response = await get(url, { signal, headers: { accept: 'application/json' } });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new LoadError(`${what} could not be requested: the Graph API did not answer.`, {
                cause: error,
            });
        }

        if (response.ok) {
            let body: unknown;
            try {
                body = await response.json();
            } catch (error) {
                if (signal?.aborted) throw error;
                throw new LoadError(`${what} arrived, but not as JSON.`, { cause: error });
            }
            try {
                return read(body);
            } catch (error) {
                if (error instanceof WireShapeError) {
                    throw new LoadError(
                        `${what} has a shape this page does not read: ${error.message}.`,
                        { cause: error },
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
            await sleep(delay, signal);
            continue;
        }

        const problem = await problemText(response);
        const building = response.status === 503 && response.headers.has('retry-after');
        const reason = building
            ? 'it was still being built after a minute'
            : `the Graph API answered ${response.status}${problem ? ` (${problem})` : ''}`;
        throw new LoadError(`${what} could not be loaded: ${reason}.`);
    }
}
