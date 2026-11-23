import assert from 'node:assert/strict';
import test from 'node:test';

import { createLane, createPacer, surfaceOf } from './pacing.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

test('runs at most its limit of tasks at once, in the order they came, past a failure', async () => {
    const pacer = createPacer({ limit: 2 });
    let running = 0;
    let most = 0;
    const started: number[] = [];
    const task = (index: number) => async () => {
        started.push(index);
        running += 1;
        most = Math.max(most, running);
        await tick();
        running -= 1;

        if (index === 0) {
            throw new Error('first task failed');
        }

        return index;
    };

    const results = await Promise.allSettled(
        Array.from({ length: 7 }, (_, index) => pacer.run(task(index))),
    );

    assert.equal(most, 2);
    assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(results[0]?.status, 'rejected');
    assert.deepEqual(
        results.slice(1).map((result) => (result.status === 'fulfilled' ? result.value : null)),
        [1, 2, 3, 4, 5, 6],
    );

    // Every slot is free again.
    const after = await Promise.all([pacer.run(async () => running), pacer.run(async () => 0)]);

    assert.deepEqual(after, [0, 0]);
});

test('an aborted waiting task leaves the queue and rejects at once, and the next takes its slot', async () => {
    const lane = createLane(1);
    let release = () => {};
    const held = lane.run(
        () =>
            new Promise<void>((resolve) => {
                release = resolve;
            }),
    );
    const controller = new AbortController();
    const started: string[] = [];
    const dropped = lane.run(async () => started.push('dropped'), controller.signal);
    const next = lane.run(async () => started.push('next'));
    const reason = new Error('superseded');

    controller.abort(reason);
    // It rejects while the first task still holds the slot.
    await assert.rejects(dropped, (error) => error === reason);

    release();
    await Promise.all([held, next]);
    assert.deepEqual(started, ['next']);

    // A task whose signal is already aborted does not run, even with a slot free.
    await assert.rejects(
        lane.run(async () => started.push('late'), controller.signal),
        (error) => error === reason,
    );
    assert.deepEqual(started, ['next']);
});

test('a malformed allowance header leaves the last reading in place', async () => {
    const now = 1_000_000;
    const answers = [
        new Response('{}', {
            headers: { 'x-ratelimit-remaining': '37', 'x-ratelimit-reset': '20' },
        }),
        new Response('{}', {
            headers: { 'x-ratelimit-remaining': 'many', 'x-ratelimit-reset': '20' },
        }),
        new Response('{}', {
            headers: { 'x-ratelimit-remaining': '30', 'x-ratelimit-reset': 'soon' },
        }),
    ];
    const pacer = createPacer({
        limit: 4,
        fetch: async () => answers.shift() ?? new Response('{}'),
        now: () => now,
    });

    for (let request = 0; request < 3; request += 1) {
        await pacer.fetch('https://developmentfinance.org/api/v1/x');
    }

    assert.deepEqual(pacer.allowance('api'), { remaining: 37, until: now + 20_000 });
});

test('reads the allowance off each response, keeps the lowest in a window and past a response without, and drops it once reset', async () => {
    let now = 1_000_000;
    const answers = [
        new Response('{}', {
            headers: { 'x-ratelimit-remaining': '37', 'x-ratelimit-reset': '20' },
        }),
        new Response('{}'),
        new Response('{}', {
            headers: { 'x-ratelimit-remaining': '36', 'x-ratelimit-reset': '19' },
        }),
        // A response to an earlier request, arriving late.
        new Response('{}', {
            headers: { 'x-ratelimit-remaining': '38', 'x-ratelimit-reset': '19' },
        }),
        new Response('{}', {
            headers: { 'x-ratelimit-remaining': '119', 'x-ratelimit-reset': '60' },
        }),
    ];
    const pacer = createPacer({
        limit: 4,
        fetch: async () => answers.shift() ?? new Response('{}'),
        now: () => now,
    });

    assert.equal(pacer.allowance('api'), null);

    const response = await pacer.fetch('https://developmentfinance.org/api/v1/x');

    assert.equal(response.status, 200);
    assert.deepEqual(pacer.allowance('api'), { remaining: 37, until: now + 20_000 });

    await pacer.fetch('https://developmentfinance.org/api/v1/x');
    assert.deepEqual(pacer.allowance('api'), { remaining: 37, until: now + 20_000 });

    now += 1_000;
    await pacer.fetch('https://developmentfinance.org/api/v1/x');
    assert.deepEqual(pacer.allowance('api'), { remaining: 36, until: now + 19_000 });

    await pacer.fetch('https://developmentfinance.org/api/v1/x');
    assert.deepEqual(pacer.allowance('api'), { remaining: 36, until: now + 19_000 });

    now += 19_000;
    assert.equal(pacer.allowance('api'), null);

    // The next window's first response starts a new reading.
    await pacer.fetch('https://developmentfinance.org/api/v1/x');
    assert.deepEqual(pacer.allowance('api'), { remaining: 119, until: now + 60_000 });
});

test('a request below /api/v1/datasets/ or /api/datasets/ counts against datasets, any other against api', () => {
    const origin = 'https://developmentfinance.org';

    for (const path of [
        '/api/v1/datasets/ds_x',
        '/api/v1/datasets/analysis',
        '/api/v1/datasets/derived/ops_a/ocv_b/files/abc',
        '/api/datasets/ds_x/versions/latest',
    ]) {
        assert.equal(surfaceOf(`${origin}${path}`), 'datasets', path);
    }

    for (const path of [
        '/api/v1/datasets/',
        '/api/v1/datasets',
        '/api/v1/search/resolve',
        '/api/v1/codes/x',
        '/api/v2/datasets/ds_x',
    ]) {
        assert.equal(surfaceOf(`${origin}${path}`), 'api', path);
    }

    assert.equal(surfaceOf(new URL(`${origin}/api/v1/datasets/ds_x`)), 'datasets');
    assert.equal(
        surfaceOf(new Request(`${origin}/api/v1/search/resolve`, { method: 'POST' })),
        'api',
    );
});

test('a datasets response with little left leaves the api reading as it was, and the other way round', async () => {
    const now = 1_000_000;
    const pacer = createPacer({
        limit: 4,
        fetch: async (input) =>
            new Response('{}', {
                headers: new URL(String(input)).pathname.startsWith('/api/v1/datasets/')
                    ? { 'x-ratelimit-remaining': '3', 'x-ratelimit-reset': '10' }
                    : { 'x-ratelimit-remaining': '90', 'x-ratelimit-reset': '40' },
            }),
        now: () => now,
    });

    await pacer.fetch('https://developmentfinance.org/api/v1/search/resolve');
    assert.equal(pacer.allowance('datasets'), null);

    await pacer.fetch('https://developmentfinance.org/api/v1/datasets/analysis');
    assert.deepEqual(pacer.allowance('api'), { remaining: 90, until: now + 40_000 });
    assert.deepEqual(pacer.allowance('datasets'), { remaining: 3, until: now + 10_000 });
});
