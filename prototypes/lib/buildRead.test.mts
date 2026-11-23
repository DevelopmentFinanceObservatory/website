import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { DatasetRef, recipe, StoredVersions } from '@developmentfinance/client';

import {
    BUILD_TIMEOUT_MS,
    CHECK_TIMEOUT_MS,
    CHECKED_READS,
    type Checker,
    checkOneVersionPerSpec,
    pendingBoundOf,
    PENDING_RETRY_MS,
    readChecked,
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

/** The bound the scheduled build sets, ten minutes. */
const PENDING_BOUND_MS = 600_000;

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
        pendingBound: PENDING_BOUND_MS,
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
    const log = mock.method(console, 'log', () => {});
    const actions = process.env.GITHUB_ACTIONS;

    process.env.GITHUB_ACTIONS = 'true';

    try {
        const pending = Array.from({ length: 100 }, (_, index) => dataset(index, 'pending'));
        const { calls, client } = stubClient(...pending);
        const time = fakeTime();

        const read = await readSettled('p', { a: { ref: refJson } }, valueOf, {
            client,
            lanes: freshLanes(),
            pendingBound: PENDING_BOUND_MS,
            ...time,
        });
        // A read again starts only with at least PENDING_RETRY_MS left to the bound.
        const reads = PENDING_BOUND_MS / PENDING_RETRY_MS;

        assert.equal(calls.length, reads);
        assert.deepEqual(read.value, [reads - 1]);
        assert.equal(read.sources.a.freshness, 'pending');
        assert.ok(time.now() <= PENDING_BOUND_MS);
        assert.equal(warn.mock.callCount(), 1);
        assert.deepEqual(
            log.mock.calls.map(({ arguments: [line] }) => String(line).split(' ')[0]),
            ['::warning::p:'],
        );
        assert.match(String(log.mock.calls[0]?.arguments[0]), /\ba still pending\b/);
    } finally {
        if (actions === undefined) {
            delete process.env.GITHUB_ACTIONS;
        } else {
            process.env.GITHUB_ACTIONS = actions;
        }

        warn.mock.restore();
        log.mock.restore();
    }
});

/** Runs `body` with console.warn and console.log stubbed and GITHUB_ACTIONS set, and returns
 *  the warning lines it printed. */
const withWarnings = async (body: () => Promise<void>): Promise<string[]> => {
    const warn = mock.method(console, 'warn', () => {});
    const log = mock.method(console, 'log', () => {});
    const actions = process.env.GITHUB_ACTIONS;

    process.env.GITHUB_ACTIONS = 'true';

    try {
        await body();

        return log.mock.calls.map(({ arguments: [line] }) => String(line));
    } finally {
        if (actions === undefined) {
            delete process.env.GITHUB_ACTIONS;
        } else {
            process.env.GITHUB_ACTIONS = actions;
        }

        warn.mock.restore();
        log.mock.restore();
    }
};

test('a read again late in the bound gets only the time left, and one that times out leaves the last complete read', async () => {
    const time = fakeTime();
    const timeouts: number[] = [];
    // The first read takes 520 s and finds the dataset pending. The read again starts at 550 s
    // and runs to its timeout.
    const client = {
        fetch: async (_target: unknown, { timeout = 0 }: { timeout?: number }) => {
            timeouts.push(timeout);

            if (timeouts.length === 1) {
                await time.sleep(520_000);

                return dataset(1, 'pending');
            }

            await time.sleep(timeout);
            throw new Error('timed out');
        },
    } as unknown as Fetcher;
    let read: Awaited<ReturnType<typeof readSettled<'a', unknown[]>>> | undefined;

    const lines = await withWarnings(async () => {
        read = await readSettled('p', { a: { ref: refJson } }, valueOf, {
            client,
            lanes: freshLanes(),
            pendingBound: PENDING_BOUND_MS,
            ...time,
        });
    });

    assert.deepEqual(timeouts, [BUILD_TIMEOUT_MS, PENDING_BOUND_MS - 550_000]);
    assert.ok(time.now() <= PENDING_BOUND_MS + PENDING_RETRY_MS);
    assert.deepEqual(read?.value, [1]);
    assert.equal(read?.sources.a.freshness, 'pending');
    assert.equal(read?.retrieved, new Date(520_000).toISOString());
    assert.equal(lines.length, 1);
    assert.match(
        lines[0] ?? '',
        /^::warning::p: a still pending .*read again failed \(timed out\)/,
    );
});

test('a read again that fails leaves the last complete read, with a warning', async () => {
    const { calls, client } = stubClient(dataset(1, 'pending'), new Error('503'), dataset(3));
    const time = fakeTime();
    let read: Awaited<ReturnType<typeof readSettled<'a', unknown[]>>> | undefined;

    const lines = await withWarnings(async () => {
        read = await readSettled('p', { a: { ref: refJson } }, valueOf, {
            client,
            lanes: freshLanes(),
            pendingBound: PENDING_BOUND_MS,
            ...time,
        });
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(read?.value, [1]);
    assert.equal(read?.sources.a.freshness, 'pending');
    assert.equal(read?.retrieved, new Date(0).toISOString());
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /^::warning::p: a still pending .*read again failed \(503\)/);
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

test('the pending bound comes from BUILD_PENDING_BOUND_S, 0 when unset', () => {
    assert.equal(pendingBoundOf({}), 0);
    assert.equal(pendingBoundOf({ BUILD_PENDING_BOUND_S: '' }), 0);
    assert.equal(pendingBoundOf({ BUILD_PENDING_BOUND_S: '600' }), 600_000);
    assert.throws(() => pendingBoundOf({ BUILD_PENDING_BOUND_S: '10m' }), /whole number/);
});

test('with no bound set, a pending read is taken at once', async () => {
    const warn = mock.method(console, 'warn', () => {});
    // Keeps the warning annotation out of a test run in GitHub Actions.
    const log = mock.method(console, 'log', () => {});
    const set = process.env.BUILD_PENDING_BOUND_S;

    delete process.env.BUILD_PENDING_BOUND_S;

    try {
        const { calls, client } = stubClient(dataset(1, 'pending'), dataset(2));
        const time = fakeTime();

        const read = await readSettled('p', { a: { ref: refJson } }, valueOf, {
            client,
            lanes: freshLanes(),
            ...time,
        });

        assert.deepEqual(read.value, [1]);
        assert.equal(calls.length, 1);
        assert.deepEqual(time.slept, []);
    } finally {
        if (set !== undefined) {
            process.env.BUILD_PENDING_BOUND_S = set;
        }

        warn.mock.restore();
        log.mock.restore();
    }
});

test('checkOneVersionPerSpec refuses reads that took one spec at two versions, naming both', () => {
    const source = (specId: string, contentVersion: string) => ({
        versions: [{ specId, contentVersion }],
        freshness: 'current' as const,
    });

    checkOneVersionPerSpec('page', { a: source('s1', 'cv1') }, { b: source('s1', 'cv1') });
    assert.throws(
        () =>
            checkOneVersionPerSpec(
                'page',
                { a: source('s1', 'cv2'), b: source('s2', 'cv1') },
                { c: source('s1', 'cv1') },
            ),
        /page took one spec at two versions.*s1 at cv1 and cv2\./,
    );
});

/** A stored-versions check naming SPEC and ROOT at the versions given. */
const heads = (spec: string | null, root: string | null) =>
    StoredVersions.fromJSON({
        format_version: 1,
        heads: [
            { spec_id: SPEC, content_version: spec },
            { spec_id: ROOT, content_version: root },
        ].toSorted((a, b) => a.spec_id.localeCompare(b.spec_id)),
    });

const NEWER = `cv_${'d'.repeat(32)}`;

/** A stand-in client whose reads answer from `answers` in turn, as `stubClient`'s do, and
 *  whose checks answer from `checks` in turn, the last one again once they run out. */
const checkingClient = (answers: unknown[], checks: StoredVersions[]) => {
    const { calls, client } = stubClient(...answers);
    const checked: { targets: readonly unknown[]; timeout?: number }[] = [];
    const checking = {
        fetch: client.fetch,
        storedVersions: async (targets: readonly unknown[], { timeout }: { timeout?: number }) => {
            checked.push({ targets, timeout });

            return checks[checked.length - 1] ?? checks.at(-1)!;
        },
    };

    // The stand-in implements only `fetch` and `storedVersions`.
    return { calls, checked, client: checking as unknown as Checker };
};

const checkedSources = { a: { ref: refJson }, b: { recipe: recipe(ref) } };

test('records the stored-versions check taken before the reads and after, when the two agree', async () => {
    const { calls, checked, client } = checkingClient(
        [derived(1), dataset(0)],
        [heads(VERSION, ROOT_VERSION)],
    );

    const read = await readChecked('p', checkedSources, valueOf, {
        client,
        lanes: freshLanes(),
        ...fakeTime(),
    });

    assert.deepEqual(read.stored, heads(VERSION, ROOT_VERSION).toJSON());
    assert.deepEqual(read.value, [0, 1]);
    assert.equal(calls.length, 2);
    assert.equal(checked.length, 2);
    assert.equal(checked[0]?.timeout, CHECK_TIMEOUT_MS);
    assert.ok(checked[0]?.targets[0] instanceof DatasetRef);
    assert.equal(checked[0]?.targets.length, 2);
});

test('reads again when the check moved during the reads, and records the check that held', async () => {
    const info = mock.method(console, 'info', () => {});

    try {
        const { calls, checked, client } = checkingClient(
            [dataset(1), dataset(2)],
            [heads(VERSION, ROOT_VERSION), heads(NEWER, ROOT_VERSION)],
        );

        const read = await readChecked('p', { a: { ref: refJson } }, valueOf, {
            client,
            lanes: freshLanes(),
            pendingBound: 0,
            ...fakeTime(),
        });

        assert.deepEqual(read.value, [2]);
        assert.equal(calls.length, 2);
        assert.equal(checked.length, 3);
        assert.deepEqual(read.stored, heads(NEWER, ROOT_VERSION).toJSON());
        assert.match(String(info.mock.calls[0]?.arguments[0]), new RegExp(SPEC));
    } finally {
        info.mock.restore();
    }
});

for (const [label, pendingBound, reads] of [
    ['with no pending bound, after one read again', 0, 2],
    ['within the pending bound, after CHECKED_READS reads', PENDING_BOUND_MS, CHECKED_READS],
] as const) {
    test(`takes the last read and records the check before it when the check moves during every read: ${label}`, async () => {
        const info = mock.method(console, 'info', () => {});

        try {
            const checks = Array.from({ length: 10 }, (_, index) =>
                heads(index % 2 === 0 ? VERSION : NEWER, ROOT_VERSION),
            );
            const { calls, client } = checkingClient(
                Array.from({ length: 10 }, (_, index) => dataset(index)),
                checks,
            );
            let read: Awaited<ReturnType<typeof readChecked<'a', unknown[]>>> | undefined;

            const lines = await withWarnings(async () => {
                read = await readChecked('fragility-finance', { a: { ref: refJson } }, valueOf, {
                    client,
                    lanes: freshLanes(),
                    pendingBound,
                    ...fakeTime(),
                });
            });

            assert.equal(calls.length, reads);
            assert.deepEqual(read?.value, [reads - 1]);
            // The check taken before the last read: the older heads, so a visitor's check differs.
            assert.deepEqual(read?.stored, checks[reads - 1]?.toJSON());
            assert.equal(lines.length, 1);
            assert.match(lines[0] ?? '', /^::warning::fragility-finance: /);
            assert.ok(lines[0]?.includes(SPEC));
        } finally {
            info.mock.restore();
        }
    });
}

test('fails the build, naming the page, when the check fails', async () => {
    const { client } = checkingClient([], []);
    const failing = {
        ...client,
        storedVersions: async () => {
            throw new Error('503');
        },
    } as unknown as Checker;

    await assert.rejects(
        readChecked('p', checkedSources, valueOf, {
            client: failing,
            lanes: freshLanes(),
            ...fakeTime(),
        }),
        (error: Error) =>
            /stored-versions check of p/.test(error.message) &&
            error.cause instanceof Error &&
            error.cause.message === '503',
    );
});
