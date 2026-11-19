/**
 * `load.ts`: when the loader waits for a document still being built, and the
 * error it raises for each other failure, over a scripted fetch and clock.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    keyedLoads,
    LoadError,
    LOADING,
    loadDocument,
    loadFailure,
    loadNodeView,
    loadServed,
    NOT_HELD,
    NOT_SERVED,
    nodeViewUrl,
    ORIGIN_NOT_SERVED,
    NOT_ADVANCING,
    TOO_LARGE,
    RETRY_WAIT_MS,
    retryDelay,
    settled as isSettled,
    sharedLoad,
    waitText,
    type NotHeld,
    type NotServed,
    type Refusal,
    type Servable,
    type WaitCause,
} from '../load.ts';
import { readSchema, readTerms } from '../wire.ts';
import { schemaBody, termsBody } from './fixtures.ts';

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

const building = () =>
    json(
        {
            code: 'service_unavailable',
            title: 'Service unavailable',
            retryable: true,
            cause: { code: 'schema_building' },
        },
        503,
        { 'retry-after': '5' },
    );

const busy = () => json({ title: 'Too Many Requests' }, 429, { 'retry-after': '12' });

test('the loader waits out a build and a spent allowance, then reads the document', async () => {
    const { options, waits, causes, urls } = rig([building, busy, () => json(schemaBody())]);
    const document = await loadDocument('The model', '/api/graph/schema', readSchema, options);
    assert.ok(document.nodes.length > 0);
    assert.deepEqual(waits, [5000, 12_000]);
    assert.deepEqual(causes, ['schema_building', 'busy']);
    assert.equal(urls.length, 3);
});

test('a 404 naming origin_not_served reads as not served, with no retry; any other 404 fails', async () => {
    const UN_URL = '/api/graph/schema/terms/un_system';
    const refusal = () =>
        json(
            {
                code: 'not_found',
                title: 'Not found',
                retryable: false,
                cause: { code: 'origin_not_served' },
            },
            404,
        );
    const { options, waits, urls } = rig([refusal]);
    assert.equal(await loadServed('UN terms', UN_URL, readTerms, options), NOT_SERVED);
    assert.deepEqual(waits, []);
    assert.equal(urls.length, 1);

    const { options: served } = rig([() => json(termsBody())]);
    assert.deepEqual(
        await loadServed('UN terms', UN_URL, readTerms, served),
        readTerms(termsBody()),
    );

    // An API without the route, or an old revision, answers a bare 404: a failure a retry can clear.
    const bare = () => new Response('Not Found', { status: 404 });
    for (const answer of [bare, () => json({ title: 'Bad gateway' }, 502)]) {
        await assert.rejects(loadServed('UN terms', UN_URL, readTerms, rig([answer]).options), {
            name: 'LoadError',
            reason: 'status',
        });
    }
    await assert.rejects(loadDocument('The model', '/x', readSchema, rig([refusal]).options), {
        name: 'LoadError',
        reason: 'status',
        status: 404,
    });
});

test('each wait cause reads as its own line, and an unknown cause as a neutral wait', () => {
    assert.equal(
        waitText(4200, 'schema_building'),
        'The Graph API is still building the schema for this graph. Trying again in 5 s.',
    );
    assert.equal(
        waitText(3000, 'check_busy'),
        'The Graph API is busy with other checks. Trying again in 3 s.',
    );
    assert.equal(
        waitText(3000, 'unavailable'),
        'The Graph API is not ready to answer. Trying again in 3 s.',
    );
});

test('a build still running after a minute fails and says so', async () => {
    const { options, waits } = rig(Array.from({ length: 20 }, () => building));
    await assert.rejects(
        loadDocument('The model', '/api/graph/schema', readSchema, options),
        (error: unknown) =>
            error instanceof LoadError &&
            error.reason === 'build_timeout' &&
            error.status === 503 &&
            error.message.includes('still building the schema for this graph'),
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
        loadDocument('The datasets', '/api/graph/schema/usage', readSchema, options),
        { name: 'LoadError', reason: 'status', status: 502, detail: 'The graph did not answer' },
    );
    assert.deepEqual(waits, []);
});

test('a failure explains what went wrong without naming the document the heading names', async () => {
    const failures = [
        rig([() => json({ title: 'Server error', detail: 'boom' }, 500)]),
        rig([
            () => {
                throw new TypeError('fetch failed');
            },
        ]),
    ];
    for (const { options } of failures) {
        const state = await loadDocument(
            'The model',
            '/api/graph/schema',
            readSchema,
            options,
        ).then(
            () => assert.fail('the load should fail'),
            (error: unknown) => loadFailure(error, 'The model'),
        );
        assert.equal(state.status, 'failed');
        if (state.status !== 'failed') return;
        assert.ok(state.message.startsWith('The model '));
        assert.ok(!state.explanation.includes('The model'), state.explanation);
        assert.ok(state.message.toLowerCase().endsWith(state.explanation.toLowerCase()));
    }
});

test('an unexpected failure names the document that failed', () => {
    const original = console.error;
    console.error = () => {};
    try {
        const state = loadFailure(new TypeError('boom'), 'UN System Data Commons terms');
        assert.equal(state.status, 'failed');
        if (state.status !== 'failed') return;
        assert.equal(state.reason, 'unexpected');
        assert.ok(state.message.startsWith('UN System Data Commons terms '), state.message);
    } finally {
        console.error = original;
    }
});

test('a changed wire shape fails with the guard error', async () => {
    const body = schemaBody() as { nodes: Record<string, unknown>[] };
    delete body.nodes[0]!.declared_by;
    const { options } = rig([() => json(body)]);
    await assert.rejects(
        loadDocument('The model', '/api/graph/schema', readSchema, options),
        (error: unknown) =>
            error instanceof LoadError &&
            error.reason === 'shape' &&
            error.detail?.startsWith('schema.nodes[0].declared_by') === true,
    );
});

test('a body that is not JSON and a request that fails each give their reason', async () => {
    const notJson = rig([() => new Response('<html>', { status: 200 })]);
    await assert.rejects(
        loadDocument('The model', '/api/graph/schema', readSchema, notJson.options),
        { name: 'LoadError', reason: 'not_json' },
    );

    const offline = rig([
        () => {
            throw new TypeError('fetch failed');
        },
    ]);
    await assert.rejects(
        loadDocument('The model', '/api/graph/schema', readSchema, offline.options),
        { name: 'LoadError', reason: 'unreachable' },
    );
});

test('an abort rejects with the signal reason, not a LoadError', async () => {
    const controller = new AbortController();
    const reason = new DOMException('stopped', 'AbortError');
    const { options } = rig([building, building]);
    const waiting = loadDocument('The model', '/api/graph/schema', readSchema, {
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
        loadDocument('The model', '/api/graph/schema', readSchema, {
            fetch: stalled,
            requestTimeoutMs: 10,
        }),
        { name: 'LoadError', reason: 'timeout' },
    );
});

test('a load that outlasts its overall bound fails as a timeout', async () => {
    let calls = 0;
    await assert.rejects(
        loadDocument('The model', '/api/graph/schema', readSchema, {
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

/** A node view whose centre and neighbour are nodes of the schema fixture. */
const nodeViewBody = () => {
    const [centre, neighbour] = (schemaBody() as { nodes: unknown[] }).nodes;
    return { generation: 'g', centre, nodes: [neighbour], capped: [] };
};

const notFound = (cause: string | null) => () =>
    json(
        {
            code: 'not_found',
            title: 'Not found',
            retryable: false,
            ...(cause === null ? {} : { cause: { code: cause } }),
        },
        404,
    );

test('a node view refused with node_not_held, origin_not_served, a bare 404, node_view_too_large or graph_not_advancing is final, with no retry', async () => {
    const internal = (code: string) => () =>
        json(
            {
                code: 'internal_error',
                title: 'Internal error',
                retryable: false,
                cause: { code },
            },
            500,
        );
    const rows: [() => Response, Refusal][] = [
        [notFound('node_not_held'), NOT_HELD],
        [notFound('origin_not_served'), ORIGIN_NOT_SERVED],
        [notFound(null), NOT_SERVED],
        [() => new Response('Not Found', { status: 404 }), NOT_SERVED],
        [internal('node_view_too_large'), TOO_LARGE],
        [internal('graph_not_advancing'), NOT_ADVANCING],
    ];
    for (const [refusal, expected] of rows) {
        // A view scripted after the refusal is what a retry would read.
        const { options, waits, urls } = rig([refusal, () => json(nodeViewBody())]);
        assert.equal(await loadNodeView('Person', options), expected);
        assert.deepEqual(waits, []);
        assert.deepEqual(urls, ['/api/graph/schema/node/Person']);
    }
});

test('a node view waits out a 503 and then reads the view', async () => {
    const { options, waits, urls } = rig([building, () => json(nodeViewBody())]);
    const view = await loadNodeView('Person', options);
    assert.ok(typeof view === 'object' && 'centre' in view);
    assert.equal(view.generation, 'g');
    assert.deepEqual(waits, [5000]);
    assert.equal(urls.length, 2);
});

test("a node view's path encodes each segment of the dcid and keeps its slashes", () => {
    assert.equal(
        nodeViewUrl('undata/eclac/SERIES-INSUF PENSION?#'),
        '/api/graph/schema/node/undata/eclac/SERIES-INSUF%20PENSION%3F%23',
    );
});

test('a dcid with a dot segment, which a URL would resolve away, is not held, with no request', async () => {
    for (const dcid of ['../usage', 'dc/..', './x', 'dc/./x']) {
        const { options, urls } = rig([() => json(nodeViewBody())]);
        assert.equal(nodeViewUrl(dcid), null);
        assert.equal(await loadNodeView(dcid, options), NOT_HELD);
        assert.deepEqual(urls, []);
    }
    assert.equal(nodeViewUrl('dc/x.y..z'), '/api/graph/schema/node/dc/x.y..z');
});

/** A shared load over a load the test settles by hand, and every state it published. */
const sharedRig = () => {
    const runs: {
        signal: AbortSignal;
        settle: (value: string | NotServed) => void;
        fail: () => void;
    }[] = [];
    const states: (Servable<string> | null)[] = [];
    const shared = sharedLoad<string>({
        what: 'The terms',
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

test('a shared load answered not served publishes it, and a retry leaves it alone', async () => {
    const { runs, states, shared } = sharedRig();
    shared.start();
    runs[0]?.settle(NOT_SERVED);
    await settled();
    assert.deepEqual(states.at(-1), { status: 'notServed' });
    shared.start(true);
    assert.equal(runs.length, 1);
});

test('a document is settled once loaded, not served or failed, and not while absent or loading', () => {
    const rows: [Servable<unknown> | null, boolean][] = [
        [null, false],
        [LOADING, false],
        [{ status: 'loading', waiting: { retryInMs: 5000, cause: 'schema_building' } }, false],
        [{ status: 'ready', value: {} }, true],
        [NOT_SERVED, true],
        [{ status: 'failed', reason: 'unexpected', message: 'm', explanation: 'e' }, true],
    ];
    assert.deepEqual(
        rows.map(([state]) => isSettled(state)),
        rows.map(([, expected]) => expected),
    );
});

test('a shared load answered not held publishes it, and a retry leaves it alone', async () => {
    const runs: ((value: string | NotHeld) => void)[] = [];
    const states: (Servable<string> | NotHeld | null)[] = [];
    const shared = sharedLoad<string, NotHeld>({
        what: 'The view',
        load: () => new Promise((resolve) => runs.push(resolve)),
        publish: (state) => states.push(state),
    });
    shared.start();
    runs[0]?.(NOT_HELD);
    await settled();
    assert.equal(states.at(-1), NOT_HELD);
    shared.start(true);
    assert.equal(runs.length, 1);
});

/** Keyed loads the test settles by hand, with every key's runs and published states. */
const keyedRig = () => {
    const runs: { key: string; signal: AbortSignal; settle: (value: string) => void }[] = [];
    const states: [string, Servable<string> | null][] = [];
    const loads = keyedLoads<string>({
        what: (key) => `The view of ${key}`,
        load: (key, { signal }) =>
            new Promise((resolve) => runs.push({ key, signal, settle: resolve })),
        publish: (key, state) => states.push([key, state]),
    });
    return { runs, states, loads };
};

test('keyed loads run once per key however many hold it, and stop when the last lets go', () => {
    const { runs, states, loads } = keyedRig();
    const first = loads.hold('Person');
    const second = loads.hold('Person');
    loads.hold('Place');
    assert.deepEqual(
        runs.map((run) => run.key),
        ['Person', 'Place'],
    );
    first();
    first();
    assert.equal(runs[0]?.signal.aborted, false);
    second();
    assert.equal(runs[0]?.signal.aborted, true);
    assert.deepEqual(states.at(-1), ['Person', null]);
    assert.equal(runs[1]?.signal.aborted, false);

    loads.hold('Person');
    assert.equal(runs.length, 3);
});

test('a keyed load that finished survives every release and is never asked for again', async () => {
    const { runs, states, loads } = keyedRig();
    const release = loads.hold('Person');
    runs[0]?.settle('view');
    await settled();
    release();
    loads.hold('Person');
    loads.retry('Person');
    assert.equal(runs.length, 1);
    assert.deepEqual(states.at(-1), ['Person', { status: 'ready', value: 'view' }]);
});
