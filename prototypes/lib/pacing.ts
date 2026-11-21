// How a page's requests to DFO share one pace: a bound on the reads in flight, and the
// allowance the website's gateway reports. The gateway counts every request that reaches it
// against one allowance per address, 120 a minute on /api/v1 (src/lib/proxy/rateLimit.ts at the
// repository root), and reports what is left on each response as `x-ratelimit-remaining`, with
// `x-ratelimit-reset` the seconds until the count starts again. A response it served while its
// counter was down carries neither, and leaves the last reading in place.
//
// `readLive`'s reads run in the `pacer`'s lane and oda-counts' Search resolve requests in
// `pickLane`, so a reader's pick does not wait behind stored reads. Both go out through
// `liveClient`, whose every request, retries included, passes the pacer's `fetch`, so the
// allowance a page sees counts both.
import { Client } from '@developmentfinance/client';

/**
 * How many reads run at once. A stored read is two GETs: the spec's newest stored version, then
 * its file. oda-counts' 19 stored reads, run all at once against production, drew 11 retried
 * 503s from dfo-apis (49 requests, 1.7 s). Four at a time drew none (38 requests, 1.0 s).
 */
export const READ_CONCURRENCY = 4;

/**
 * How many oda-counts resolve requests run at once, the nine one-entry requests of a pick.
 * Search answers them together in about 2.3 s cold. Behind the stored reads' bound of four, the same
 * nine took 3.6 to 3.9 s.
 */
export const PICK_CONCURRENCY = 9;

/** What the gateway last said is left of the address's allowance, and until when, in
 *  milliseconds since the epoch. */
export type Allowance = { remaining: number; until: number };

/** A bound on the tasks that run at once. */
export type Lane = {
    /**
     * Runs `task` once fewer than the lane's limit of tasks run, in the order they came. Aborting
     * `signal` while the task waits takes it out of the queue and rejects with the signal's
     * reason at once. A task that has started handles `signal` itself.
     */
    run: <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>;
};

/** A lane that runs at most `limit` tasks at once. */
export const createLane = (limit: number): Lane => {
    let running = 0;
    const waiting: (() => void)[] = [];

    const release = () => {
        const next = waiting.shift();

        if (next === undefined) {
            running -= 1;
        } else {
            next();
        }
    };

    const slot = (signal: AbortSignal | undefined): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
                reject(signal.reason);

                return;
            }

            const onAbort = () => {
                const at = waiting.indexOf(start);

                if (at !== -1) {
                    waiting.splice(at, 1);
                }

                reject(signal?.reason);
            };
            const start = () => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            };

            signal?.addEventListener('abort', onAbort, { once: true });
            waiting.push(start);
        });

    return {
        run: async (task, signal) => {
            if (signal?.aborted) {
                throw signal.reason;
            }

            if (running < limit) {
                running += 1;
            } else {
                // A released slot passes straight to the next waiting task, so `running` holds.
                await slot(signal);
            }

            try {
                return await task();
            } finally {
                release();
            }
        },
    };
};

export type Pacer = Lane & {
    /** The platform's `fetch`, reading the allowance off each response, as a client's `fetch`. */
    fetch: typeof globalThis.fetch;
    /** The allowance the gateway last reported, or null before any report or once its window
     *  has passed. */
    allowance: () => Allowance | null;
};

/**
 * A pacer whose lane runs at most `limit` tasks at once and which reads the gateway's allowance
 * off every response its `fetch` receives. `fetch` and `now` stand in for the platform's, as a
 * test does. The platform's `fetch` is looked up on each request.
 */
export const createPacer = ({
    limit,
    fetch = (input, init) => globalThis.fetch(input, init),
    now = Date.now,
}: {
    limit: number;
    fetch?: typeof globalThis.fetch;
    now?: () => number;
}): Pacer => {
    let last: Allowance | null = null;

    const paced: typeof globalThis.fetch = async (input, init) => {
        const response = await fetch(input, init);
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');

        const next = { remaining: Number(remaining), until: now() + Number(reset) * 1000 };

        // A missing or malformed header leaves the last reading in place.
        if (
            remaining !== null &&
            reset !== null &&
            Number.isFinite(next.remaining) &&
            Number.isFinite(next.until)
        ) {
            // Responses to requests sent together arrive in any order, so within one window
            // the lowest count stands.
            if (last === null || last.until <= now() || next.remaining < last.remaining) {
                last = next;
            }
        }

        return response;
    };

    return {
        ...createLane(limit),
        fetch: paced,
        allowance: () => (last !== null && last.until > now() ? last : null),
    };
};

/** The page's one pacer, whose lane `readLive` runs in and whose `fetch` every request takes. */
export const pacer = createPacer({ limit: READ_CONCURRENCY });

/** oda-counts' lane for its resolve requests, whose allowance `pacer` reads. */
export const pickLane = createLane(PICK_CONCURRENCY);

let client: Client | undefined;

/** The page's anonymous client on the production API, whose requests go through `pacer`'s
 *  `fetch`. DFO serves these reads to DFO pages with no key. Built on first use. */
export const liveClient = (): Client => {
    client ??= new Client({ apiKey: false, fetch: pacer.fetch });

    return client;
};
