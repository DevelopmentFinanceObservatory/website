/**
 * `load.ts`: when the loader waits for a document still being built, and the
 * error it raises for each other failure, over a scripted fetch and clock.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LoadError,
    loadDocument,
    RETRY_WAIT_MS,
    retryDelay,
    sharedLoad,
    type Loadable,
    type WaitCause,
} from '../load.ts';
import { readOntology } from '../wire.ts';
import { ontologyBody } from './fixtures.ts';

test('a 503 with Retry-After in seconds waits that long', () => {
    assert.equal(retryDelay({ status: 503, retryAfter: '5', waitedMs: 0, nowMs: 0 }), 5000);
});

test('a 503 with Retry-After as a date waits until then', () => {
    const nowMs = Date.parse('2026-11-13T12:00:00Z');
    assert.equal(
        retryDelay({
            status: 503,
            retryAfter: 'Fri, 13 Nov 2026 12:00:07 GMT',
            waitedMs: 0,
            nowMs,
        }),
        7000,
    );
});

test('the wait is at least a second and never runs past the minute', () => {
    assert.equal(retryDelay({ status: 503, retryAfter: '0', waitedMs: 0, nowMs: 0 }), 1000);
    assert.equal(
        retryDelay({ status: 503, retryAfter: '30', waitedMs: RETRY_WAIT_MS - 2000, nowMs: 0 }),
        2000,
    );
    assert.equal(
        retryDelay({ status: 503, retryAfter: '5', waitedMs: RETRY_WAIT_MS, nowMs: 0 }),
        null,
    );
});

test('an unreadable Retry-After still waits', () => {
    assert.equal(retryDelay({ status: 503, retryAfter: 'soon', waitedMs: 0, nowMs: 0 }), 5000);
});

test('only a 503 or a 429 that carries Retry-After is retried', () => {
    assert.equal(retryDelay({ status: 429, retryAfter: '12', waitedMs: 0, nowMs: 0 }), 12_000);
    assert.equal(retryDelay({ status: 429, retryAfter: null, waitedMs: 0, nowMs: 0 }), null);
    assert.equal(retryDelay({ status: 503, retryAfter: null, waitedMs: 0, nowMs: 0 }), null);
    assert.equal(retryDelay({ status: 504, retryAfter: '5', waitedMs: 0, nowMs: 0 }), null);
    assert.equal(retryDelay({ status: 500, retryAfter: null, waitedMs: 0, nowMs: 0 }), null);
});

/** A fetch answering from a script, a clock the sleeps advance, and the waits it saw. */
const rig = (answers: (() => Response)[]) => {
    let clock = 0;
    const waits: number[] = [];
    const causes: WaitCause[] = [];
    const urls: string[] = [];
    const options = {
        fetch: async (url: string | URL | Request) => {
            urls.push(String(url));
            const next = answers.shift();
            if (!next) throw new Error('no scripted answer left');
            return next();
        },
        sleep: async (ms: number) => {
            clock += ms;
        },
        now: () => clock,
        onWait: (ms: number, cause: WaitCause) => {
            waits.push(ms);
            causes.push(cause);
        },
    };
    return { options, waits, causes, urls };
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
    });

const building = () => json({ title: 'Service unavailable' }, 503, { 'retry-after': '5' });

const busy = () => json({ title: 'Too Many Requests' }, 429, { 'retry-after': '12' });

test('the loader waits out a build and a spent allowance, then reads the document', async () => {
    const { options, waits, causes, urls } = rig([building, busy, () => json(ontologyBody())]);
    const document = await loadDocument(
        'The ontology',
        '/api/graph/ontology',
        readOntology,
        options,
    );
    assert.ok(document.nodes.length > 0);
    assert.deepEqual(waits, [5000, 12_000]);
    assert.deepEqual(causes, ['building', 'busy']);
    assert.equal(urls.length, 3);
});

test('a build still running after a minute fails and says so', async () => {
    const { options, waits } = rig(Array.from({ length: 20 }, () => building));
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, options),
        (error: unknown) =>
            error instanceof LoadError && error.reason === 'build_timeout' && error.status === 503,
    );
    assert.equal(
        waits.reduce((sum, ms) => sum + ms, 0),
        RETRY_WAIT_MS,
    );
});

test('another failing status names the status and the problem detail', async () => {
    const { options, waits } = rig([
        () => json({ title: 'Bad gateway', detail: 'The graph did not answer' }, 502),
    ]);
    await assert.rejects(
        loadDocument('The datasets', '/api/graph/ontology/provenances', readOntology, options),
        { name: 'LoadError', reason: 'status', status: 502, detail: 'The graph did not answer' },
    );
    assert.deepEqual(waits, []);
});

test('a changed wire shape fails with the guard error', async () => {
    const body = ontologyBody() as { nodes: Record<string, unknown>[] };
    delete body.nodes[0]!.declared_by;
    const { options } = rig([() => json(body)]);
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, options),
        (error: unknown) =>
            error instanceof LoadError &&
            error.reason === 'shape' &&
            error.detail?.startsWith('ontology.nodes[0].declared_by') === true,
    );
});

test('a body that is not JSON and a request that fails each give their reason', async () => {
    const notJson = rig([() => new Response('<html>', { status: 200 })]);
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, notJson.options),
        { name: 'LoadError', reason: 'not_json' },
    );

    const offline = rig([
        () => {
            throw new TypeError('fetch failed');
        },
    ]);
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, offline.options),
        { name: 'LoadError', reason: 'unreachable' },
    );
});

test('an abort rejects with the signal reason, not a LoadError', async () => {
    const controller = new AbortController();
    const reason = new DOMException('stopped', 'AbortError');
    const { options } = rig([building, building]);
    const waiting = loadDocument('The ontology', '/api/graph/ontology', readOntology, {
        ...options,
        signal: controller.signal,
        sleep: (_ms, signal) =>
            new Promise((_resolve, reject) => {
                if (signal?.aborted) return reject(signal.reason);
                signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
    });
    controller.abort(reason);
    await assert.rejects(waiting, (error: unknown) => error === reason);
});

/** A fetch that answers only when its signal aborts, rejecting with the signal's reason. */
const stalled = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) return reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });

test('a request with no answer fails as a timeout after the request bound', async () => {
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, {
            fetch: stalled,
            requestTimeoutMs: 10,
        }),
        { name: 'LoadError', reason: 'timeout' },
    );
});

test('a load that outlasts its overall bound fails as a timeout', async () => {
    let calls = 0;
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, {
            fetch: async () => {
                calls += 1;
                return building();
            },
            sleep: (ms, signal) =>
                new Promise((resolve, reject) => {
                    if (signal?.aborted) return reject(signal.reason);
                    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
                    setTimeout(resolve, ms / 1000);
                }),
            limitMs: 20,
        }),
        { name: 'LoadError', reason: 'timeout' },
    );
    assert.ok(calls >= 1);
});

/** A shared load over a load the test settles by hand, and every state it published. */
const sharedRig = () => {
    const runs: { signal: AbortSignal; settle: (value: string) => void; fail: () => void }[] = [];
    const states: (Loadable<string> | null)[] = [];
    const shared = sharedLoad<string>({
        load: ({ signal }) =>
            new Promise((resolve, reject) => {
                runs.push({
                    signal,
                    settle: resolve,
                    fail: () => reject(new LoadError('failed', { reason: 'unreachable' })),
                });
            }),
        publish: (state) => states.push(state),
    });
    return { runs, states, shared };
};

const settled = () => new Promise((resolve) => setImmediate(resolve));

test('a shared load runs once however often it is started', async () => {
    const { runs, states, shared } = sharedRig();
    shared.start();
    shared.start();
    assert.equal(runs.length, 1);
    runs[0]?.settle('terms');
    await settled();
    shared.start();
    assert.equal(runs.length, 1);
    assert.deepEqual(states.at(-1), { status: 'ready', value: 'terms' });
});

test('a shared load aborted while running starts again, and the aborted run publishes nothing', async () => {
    // StrictMode mounts, cleans up and mounts again: start, abort, start.
    const { runs, states, shared } = sharedRig();
    shared.start();
    shared.abort();
    assert.equal(runs[0]?.signal.aborted, true);
    assert.equal(states.at(-1), null);

    shared.start();
    assert.equal(runs.length, 2);
    runs[0]?.settle('stale');
    runs[1]?.settle('fresh');
    await settled();
    assert.deepEqual(states.at(-1), { status: 'ready', value: 'fresh' });
    assert.ok(!states.some((state) => state?.status === 'ready' && state.value === 'stale'));
});

test('a finished shared load survives an abort, and only a retry restarts a failed one', async () => {
    const { runs, states, shared } = sharedRig();
    shared.start();
    runs[0]?.fail();
    await settled();
    shared.abort();
    assert.equal(states.at(-1)?.status, 'failed');
    shared.start();
    assert.equal(runs.length, 1);
    shared.start(true);
    assert.equal(runs.length, 2);
});
