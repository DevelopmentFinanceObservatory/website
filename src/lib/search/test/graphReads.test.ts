import assert from 'node:assert/strict';
import test from 'node:test';

import {
    graphReader,
    MAX_IN_FLIGHT,
    MAX_NODE_BATCH,
    RETRY_DELAY_MS,
    type GraphRequest,
    type GraphResponse,
} from '../graphReads.ts';

const response = (status: number, body: unknown = null): GraphResponse => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

// A fetch that answers each URL from its own list of outcomes in turn (an
// Error stands for a failed request) and records every call.
const scripted = (outcomes: Record<string, (number | Error)[]>) => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
        calls.push(url);
        const next = outcomes[url]!.shift();

        if (next === undefined) throw new Error(`no answer left for ${url}`);
        if (next instanceof Error) throw next;

        return response(next, { dcid: url });
    };

    return { calls, fetchImpl };
};

const noSleep = async () => {};

test('graphReader keeps at most MAX_IN_FLIGHT reads out and shares an in-flight read', async () => {
    let inFlight = 0;
    let peak = 0;
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
        calls.push(url);
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;

        return response(200, { dcid: url });
    };
    const { read } = graphReader({ fetchImpl });
    const urls = ['a', 'b', 'c', 'd', 'e', 'a'];

    const bodies = await Promise.all(urls.map((url) => read(url)));

    assert.equal(peak, MAX_IN_FLIGHT);
    assert.deepEqual(calls, ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(
        bodies,
        urls.map((dcid) => ({ dcid })),
    );
});

for (const [name, first] of [
    ['a 503', 503],
    ['a 502', 502],
    ['a failed request', new TypeError('fetch failed')],
] as const) {
    test(`graphReader retries once after ${name}`, async () => {
        const { calls, fetchImpl } = scripted({ n: [first, 200] });
        const delays: number[] = [];
        const { read } = graphReader({ fetchImpl, sleep: async (ms) => void delays.push(ms) });

        assert.deepEqual(await read('n'), { dcid: 'n' });
        assert.deepEqual(calls, ['n', 'n']);
        assert.deepEqual(delays, [RETRY_DELAY_MS]);
    });
}

test('graphReader does not retry a 500', async () => {
    const { calls, fetchImpl } = scripted({ n: [500] });
    const { read } = graphReader({ fetchImpl, sleep: noSleep });

    assert.equal(await read('n'), null);
    assert.deepEqual(calls, ['n']);
});

test('graphReader does not cache a failed read, so the next read asks again', async () => {
    const { calls, fetchImpl } = scripted({ n: [503, 503, 200] });
    const { read } = graphReader({ fetchImpl, sleep: noSleep });

    assert.equal(await read('n'), null);
    assert.deepEqual(await read('n'), { dcid: 'n' });
    assert.deepEqual(calls, ['n', 'n', 'n']);
});

test('graphReader caches a 404 as null', async () => {
    const { calls, fetchImpl } = scripted({ n: [404] });
    const { read } = graphReader({ fetchImpl, sleep: noSleep });

    assert.equal(await read('n'), null);
    assert.equal(await read('n'), null);
    assert.deepEqual(calls, ['n']);
});

// A node entry as the batch door serves one, trimmed to what the reader reads.
const held = (ref: string) => ({ ref, kind: 'other' });

// A fetch that answers the batch door from a list of outcomes in turn (a
// status, or an Error for a failed request), holding each dcid's node except
// those in `notHeld`, and answering `entry` for a dcid it names. It records the
// dcids each batch asked for.
const batchDoor = (
    outcomes: (number | Error)[],
    notHeld: string[] = [],
    entry: Record<string, unknown> = {},
) => {
    const calls: { url: string; dcids: string[] }[] = [];
    const fetchImpl = async (url: string, init?: GraphRequest) => {
        const { dcids } = JSON.parse(init!.body) as { dcids: string[] };
        calls.push({ url, dcids });
        const next = outcomes.shift();

        if (next === undefined) throw new Error('no answer left for the batch');
        if (next instanceof Error) throw next;

        return response(next, {
            nodes: dcids.map((dcid) =>
                dcid in entry
                    ? entry[dcid]
                    : notHeld.includes(dcid)
                      ? { ref: dcid, status: 'not_held' }
                      : held(dcid),
            ),
        });
    };

    return { calls, fetchImpl };
};

test('node reads asked for in the same tick share one request', async () => {
    const { calls, fetchImpl } = batchDoor([200], ['b']);
    const { readNode } = graphReader({ fetchImpl, sleep: noSleep });

    const nodes = await Promise.all(['a', 'b', 'c', 'a'].map((dcid) => readNode(dcid)));

    // not_held is cached as null, like a 404.
    assert.deepEqual(nodes, [held('a'), null, held('c'), held('a')]);
    assert.equal(await readNode('b'), null);
    assert.deepEqual(calls, [{ url: '/api/graph/nodes', dcids: ['a', 'b', 'c'] }]);
});

test('an entry that is neither a node nor not_held reads as null and leaves the cache', async () => {
    // An entry with `shape: 'not_held'` and neither `status` nor `kind`.
    const { calls, fetchImpl } = batchDoor([200, 200], [], { b: { dcid: 'b', shape: 'not_held' } });
    const { readNode } = graphReader({ fetchImpl, sleep: noSleep });

    assert.deepEqual(await Promise.all([readNode('a'), readNode('b')]), [held('a'), null]);
    assert.equal(await readNode('b'), null);
    assert.deepEqual(
        calls.map((call) => call.dcids),
        [['a', 'b'], ['b']],
    );
});

test('reads asked for in one tick split into batches of MAX_NODE_BATCH', async () => {
    const { calls, fetchImpl } = batchDoor([200, 200]);
    const { readNode } = graphReader({ fetchImpl, sleep: noSleep });
    const dcids = Array.from({ length: MAX_NODE_BATCH + 1 }, (_, at) => `n${at}`);

    dcids.forEach(readNode);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(
        calls.map((call) => call.dcids),
        [dcids.slice(0, MAX_NODE_BATCH), dcids.slice(MAX_NODE_BATCH)],
    );
});

test('a node already cached or in flight is left out of later batches', async () => {
    const { calls, fetchImpl } = batchDoor([200, 200]);
    const { readNode } = graphReader({ fetchImpl, sleep: noSleep });

    await readNode('a');
    void readNode('b');
    await Promise.all([readNode('a'), readNode('b'), readNode('c')]);

    assert.deepEqual(
        calls.map((call) => call.dcids),
        [['a'], ['b', 'c']],
    );
});

test('a failed batch leaves the cache for every node in it, so the next open asks again', async () => {
    // A 503 retried into a 503, then a 400 that is not retried.
    const { calls, fetchImpl } = batchDoor([503, 503, 400, 200]);
    const { readNode } = graphReader({ fetchImpl, sleep: noSleep });
    const open = () => Promise.all([readNode('a'), readNode('b')]);

    assert.deepEqual(await open(), [null, null]);
    assert.deepEqual(await open(), [null, null]);
    assert.deepEqual(await open(), [held('a'), held('b')]);
    assert.deepEqual(
        calls.map((call) => call.dcids),
        [
            ['a', 'b'],
            ['a', 'b'],
            ['a', 'b'],
            ['a', 'b'],
        ],
    );
});
