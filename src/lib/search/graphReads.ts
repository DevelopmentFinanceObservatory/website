/**
 * Reads from the graph for the search menus' info icons: graph nodes
 * (through the batch door, `POST /api/graph/nodes`) and source documentation (`/api/source-doc/{dcid}`). The graph admits a few
 * concurrent reads (dfo-apis `GRAPH_NODE_POOL_SIZE`, 4 on dev) and answers
 * the rest 503 at once. So every request goes through one queue with
 * `MAX_IN_FLIGHT` out at a time, a request the graph refused (a 502, 503 or
 * 504, or a failed request) is retried once, and the node reads asked for
 * in the same tick go out together, in batches of `MAX_NODE_BATCH`, so the
 * rows of a menu that mount in one render share one request.
 *
 * Each URL is read once and the promise shared by every caller, so a
 * component that re-renders while a read is in flight gets the same promise.
 * A node is cached under its own dcid, so a later read of it makes no
 * request. A 404 (the graph does not hold the node, or
 * the catalogue has no page for the source) and a batch's `not_held` entry
 * are cached as null. A read that still fails also resolves to null but
 * leaves the cache, so the next menu open asks again. A failed batch leaves
 * the cache for every node it asked for.
 *
 * This module has no DOM dependency, so `node --test` can import it directly.
 */

export type GraphResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
export type GraphRequest = { method: 'POST'; headers: Record<string, string>; body: string };
export type GraphFetch = (url: string, init?: GraphRequest) => Promise<GraphResponse>;

export const MAX_IN_FLIGHT = 2;
export const RETRY_DELAY_MS = 500;
// The batch door's ceiling (`caps.max_node_batch_dcids`).
export const MAX_NODE_BATCH = 50;

const NODES_URL = '/api/graph/nodes';
// A node's cache key, apart from the URLs `read` caches under.
const nodeKey = (dcid: string) => `node:${dcid}`;

// The source-doc route answers 502 when its graph read fails, and the proxy
// answers 502 or 504 when the API is out of reach.
const RETRYABLE = new Set([502, 503, 504]);

class GraphReadError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`graph read answered ${status}`);
        this.status = status;
    }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type GraphReader = {
    /** The JSON at a graph URL, null for a 404 or a failed read. */
    read: <T>(url: string) => Promise<T | null>;
    /** A node's body from the batch door, null when the graph does not
     *  hold it or the read failed. Reads asked for in the same tick share
     *  one request. */
    readNode: (dcid: string) => Promise<unknown>;
};

export function graphReader({
    fetchImpl,
    sleep = wait,
    maxInFlight = MAX_IN_FLIGHT,
}: {
    fetchImpl: GraphFetch;
    sleep?: (ms: number) => Promise<void>;
    maxInFlight?: number;
}): GraphReader {
    let active = 0;
    const waiting: (() => void)[] = [];
    const cache = new Map<string, Promise<unknown>>();

    // A freed slot passes straight to the next read in line, so `active`
    // drops only when nobody waits.
    const inSlot = async <T>(task: () => Promise<T>): Promise<T> => {
        if (active < maxInFlight) {
            active++;
        } else {
            await new Promise<void>((resolve) => waiting.push(resolve));
        }

        try {
            return await task();
        } finally {
            const next = waiting.shift();

            if (next) {
                next();
            } else {
                active--;
            }
        }
    };

    const attempt = (request: () => Promise<GraphResponse>) =>
        inSlot(async () => {
            const res = await request();

            if (res.status === 404) return null;
            if (!res.ok) throw new GraphReadError(res.status);

            return res.json();
        });

    // The retry waits outside the queue, so it holds no slot while it waits.
    const load = async (request: () => Promise<GraphResponse>) => {
        try {
            return await attempt(request);
        } catch (error) {
            if (error instanceof GraphReadError && !RETRYABLE.has(error.status)) throw error;

            await sleep(RETRY_DELAY_MS);

            return attempt(request);
        }
    };

    const remember = (url: string, pending: Promise<unknown>) => {
        const held = pending.catch(() => {
            cache.delete(url);

            return null;
        });

        cache.set(url, held);

        return held;
    };

    // The body is the graph's JSON, which each caller narrows.
    const read = <T>(url: string): Promise<T | null> =>
        (cache.get(url) ??
            remember(
                url,
                load(() => fetchImpl(url)),
            )) as Promise<T | null>;

    // Node reads asked for in the same tick wait here and go out together,
    // so the rows of a menu that mount in one render share one request.
    let queued: string[] = [];
    const settle = new Map<string, (node: Promise<unknown>) => void>();

    const askBatch = (chunk: string[]) => {
        const body = JSON.stringify({ dcids: chunk });
        const nodes = load(() =>
            fetchImpl(NODES_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
            }),
        ).then((answer): unknown[] => {
            const list = (answer as { nodes?: unknown } | null)?.nodes;

            // Index-aligned with the dcids asked for, or the whole batch fails.
            if (!Array.isArray(list) || list.length !== chunk.length) {
                throw new Error('graph batch answered no node list for its dcids');
            }

            return list;
        });

        chunk.forEach((dcid, index) => {
            const resolve = settle.get(dcid);

            settle.delete(dcid);
            resolve?.(
                nodes.then((list) => {
                    const node = list[index] as { shape?: unknown } | null;

                    return node?.shape === 'not_held' ? null : node;
                }),
            );
        });
    };

    const flush = () => {
        const dcids = queued;

        queued = [];

        for (let at = 0; at < dcids.length; at += MAX_NODE_BATCH) {
            askBatch(dcids.slice(at, at + MAX_NODE_BATCH));
        }
    };

    const readNode = (dcid: string): Promise<unknown> => {
        const key = nodeKey(dcid);
        const held = cache.get(key);

        if (held) return held;

        if (queued.length === 0) queueMicrotask(flush);
        queued.push(dcid);

        return remember(key, new Promise<unknown>((resolve) => settle.set(dcid, resolve)));
    };

    return { read, readNode };
}
