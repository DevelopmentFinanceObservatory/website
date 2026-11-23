import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { DatasetRef, recipe } from '@developmentfinance/client';

import {
    BUILD_TIMEOUT_MS,
    buildFetch,
    PENDING_BOUND_MS,
    PENDING_RETRY_MS,
    readAtBuild,
    readSettled,
} from './buildRead.ts';
import { ANALYSIS_CONCURRENCY, type Fetcher, READ_CONCURRENCY } from './liveRead.ts';
import { createLane } from './pacing.ts';

const SPEC = `spec_${'a'.repeat(32)}`;
const ROOT = `spec_${'e'.repeat(32)}`;
const VERSION = `cv_${'b'.repeat(32)}`;
const ROOT_VERSION = `cv_${'f'.repeat(32)}`;

const refJson = {
    format_version: 1,
    members: [
        {
            parts: [],
            sentence: 'Germany ODA to Kenya',
            spec: { spec_id: SPEC, definition: { schema_version: 1, spec_id: SPEC, identity: {} } },
            content_version: VERSION,
            artifact: {
                digest: `sha256:${'c'.repeat(64)}`,
                rendering: { format: 'parquet', bundle: false },
            },
        },
    ],
};
const ref = DatasetRef.fromJSON(refJson);

type Freshness = 'current' | 'pending' | 'stale' | null;

/** A dataset stub of the ref's member, whose one row holds `value`. */
const dataset = (value: number, freshness: Freshness = 'current') => ({
    ref,
    freshness,
    toRows: async () => [{ time_period: 2024, value }],
});

/** A dataset stub of a derived member whose recipe ran on ROOT, read twice. */
const derived = (value: number, freshness: Freshness = 'current') => ({
    ref: {
        members: [
            {
                spec: { spec_id: 'ops_1', recipe: { normal_form_hash: 'n', replay_key: 'r' } },
                contentVersion: 'ocv_1',
                outputDigest: 'out_1',
                roots: [
                    { specId: ROOT, contentVersion: ROOT_VERSION, rendering: {} },
                    { specId: ROOT, contentVersion: ROOT_VERSION, rendering: {}, groupby: {} },
                ],
            },
        ],
    },
    freshness,
    toRows: async () => [{ time_period: '2024', value }],
});

/** A stand-in client whose fetches answer in turn from `answers`, a dataset stub or an error. */
const stubClient = (...answers: unknown[]) => {
    const calls: { latest?: unknown; timeout?: number }[] = [];
    const client = {
        fetch: async (_target: unknown, options: { latest?: unknown; timeout?: number }) => {
            calls.push(options);
            const answer = answers[calls.length - 1];

            if (answer instanceof Error) {
                throw answer;
            }

            return answer;
        },
    };

    // The stand-in implements only `fetch`, and returns dataset stubs.
    return { calls, client: client as unknown as Fetcher };
};

/** A clock the stand-in sleep moves forward, and the waits it was asked for. */
const fakeTime = () => {
    let at = 0;
    const slept: number[] = [];

    return {
        slept,
        now: () => at,
        sleep: async (ms: number) => {
            slept.push(ms);
            at += ms;
        },
    };
};

const valueOf = (rows: Record<string, { value?: unknown }[]>) =>
    Object.values(rows).map((read) => read[0]?.value);

const freshLanes = () => ({
    reads: createLane(READ_CONCURRENCY),
    recipes: createLane(ANALYSIS_CONCURRENCY),
});

test("reads at DFO's newest stored versions with the build's time limit, and records what it read", async () => {
    const { calls, client } = stubClient(derived(3), dataset(2));
    const time = fakeTime();

    const read = await readSettled(
        'p',
        { a: { ref: refJson }, b: { recipe: recipe(ref) } },
        valueOf,
        { client, lanes: freshLanes(), ...time },
    );

    assert.deepEqual(read.value, [2, 3]);
    assert.equal(read.retrieved, '1970-01-01T00:00:00.000Z');
    assert.deepEqual(read.sources, {
        a: { versions: [{ specId: SPEC, contentVersion: VERSION }], freshness: 'current' },
        b: { versions: [{ specId: ROOT, contentVersion: ROOT_VERSION }], freshness: 'current' },
    });
    assert.deepEqual(
        calls.map(({ latest, timeout }) => [latest, timeout]),
        [
            ['stored', BUILD_TIMEOUT_MS],
            ['stored', BUILD_TIMEOUT_MS],
        ],
    );
    assert.deepEqual(time.slept, []);
});

for (const [label, client, derive] of [
    ['a read fails', stubClient(new Error('analysis refused')).client, valueOf],
    [
        'the derivation refuses the rows',
        stubClient(dataset(2)).client,
        () => {
            throw new Error('62 contexts expected');
        },
    ],
] as const) {
    test(`throws, naming the page, when ${label}`, async () => {
        await assert.rejects(
            readSettled('fragility-finance', { a: { ref: refJson } }, derive, {
                client,
                lanes: freshLanes(),
                ...fakeTime(),
            }),
            (error: Error) =>
                /fragility-finance/.test(error.message) &&
                error.cause instanceof Error &&
                /analysis refused|62 contexts/.test(error.cause.message),
        );
    });
}

test('reads again while a dataset is pending, and takes the first read with none pending', async () => {
    const { calls, client } = stubClient(dataset(1, 'pending'), dataset(2, 'pending'), dataset(3));
    const time = fakeTime();

    const read = await readSettled('p', { a: { ref: refJson } }, valueOf, {
        client,
        lanes: freshLanes(),
        ...time,
    });

    assert.deepEqual(read.value, [3]);
    assert.equal(read.sources.a.freshness, 'current');
    assert.equal(calls.length, 3);
    assert.deepEqual(time.slept, [PENDING_RETRY_MS, PENDING_RETRY_MS]);
    assert.equal(read.retrieved, new Date(2 * PENDING_RETRY_MS).toISOString());
});

test('stops reading again at the bound and takes the pending read it has', async () => {
    const warn = mock.method(console, 'warn', () => {});

    try {
        const pending = Array.from({ length: 100 }, (_, index) => dataset(index, 'pending'));
        const { calls, client } = stubClient(...pending);
        const time = fakeTime();

        const read = await readSettled('p', { a: { ref: refJson } }, valueOf, {
            client,
            lanes: freshLanes(),
            ...time,
        });
        const reads = Math.floor(PENDING_BOUND_MS / PENDING_RETRY_MS) + 1;

        assert.equal(calls.length, reads);
        assert.deepEqual(read.value, [reads - 1]);
        assert.equal(read.sources.a.freshness, 'pending');
        assert.ok(time.now() <= PENDING_BOUND_MS);
        assert.equal(warn.mock.callCount(), 1);
    } finally {
        warn.mock.restore();
    }
});

test('runs at most ANALYSIS_CONCURRENCY recipes and READ_CONCURRENCY reads at once', async () => {
    const seen = { recipes: 0, reads: 0, mostRecipes: 0, mostReads: 0 };
    const client = {
        fetch: async (target: unknown) => {
            const isRecipe = !(target instanceof DatasetRef);

            seen.reads += 1;
            seen.mostReads = Math.max(seen.mostReads, seen.reads);

            if (isRecipe) {
                seen.recipes += 1;
                seen.mostRecipes = Math.max(seen.mostRecipes, seen.recipes);
            }

            await new Promise((resolve) => setTimeout(resolve, 2));
            seen.reads -= 1;

            if (isRecipe) {
                seen.recipes -= 1;
            }

            return dataset(1);
        },
    } as unknown as Fetcher;
    const count = READ_CONCURRENCY * 2;
    const sources = Object.fromEntries([
        ...Array.from({ length: count }, (_, index) => [`r${index}`, { recipe: recipe(ref) }]),
        ...Array.from({ length: count }, (_, index) => [`d${index}`, { ref: refJson }]),
    ]);

    await readSettled('p', sources, valueOf, { client, lanes: freshLanes(), ...fakeTime() });

    assert.equal(seen.mostRecipes, ANALYSIS_CONCURRENCY);
    assert.equal(seen.mostReads, READ_CONCURRENCY);
});

test('readAtBuild reads a page once per process, and again after a failure', async () => {
    const failing = stubClient(new Error('down'));

    await assert.rejects(
        readAtBuild('memo', { a: { ref: refJson } }, valueOf, {
            client: failing.client,
            lanes: freshLanes(),
        }),
    );

    const { calls, client } = stubClient(dataset(5), dataset(6));
    const options = { client, lanes: freshLanes(), ...fakeTime() };

    const first = await readAtBuild('memo', { a: { ref: refJson } }, valueOf, options);
    const second = await readAtBuild('memo', { a: { ref: refJson } }, valueOf, options);

    assert.deepEqual(first.value, [5]);
    assert.equal(second, first);
    assert.equal(calls.length, 1);
});

test("the build's fetch asks for no cached response, keeping the caller's options", async () => {
    const real = globalThis.fetch;
    const seen: RequestInit[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {});

        return new Response('{}');
    }) as typeof fetch;

    try {
        await buildFetch('https://developmentfinance.org/api/v1/datasets/x', { method: 'POST' });
    } finally {
        globalThis.fetch = real;
    }

    assert.equal(seen[0]?.cache, 'no-store');
    assert.equal(seen[0]?.method, 'POST');
});
