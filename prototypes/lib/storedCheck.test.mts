import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { DatasetRef, StoredVersions } from '@developmentfinance/client';

import type { LiveSource } from './liveRead.ts';
import { createLane } from './pacing.ts';
import { refreshIfNewer, retrievedParts, settledState, type StoredChecker } from './storedCheck.ts';

const SPEC = `spec_${'a'.repeat(32)}`;
const OTHER = `spec_${'e'.repeat(32)}`;
const VERSION = `cv_${'b'.repeat(32)}`;
const NEWER = `cv_${'d'.repeat(32)}`;

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

/** The build's check: SPEC and OTHER at VERSION. */
const BUILT = {
    format_version: 1 as const,
    heads: [
        { spec_id: SPEC, content_version: VERSION },
        { spec_id: OTHER, content_version: VERSION },
    ],
};

/** A check whose SPEC holds `version`. */
const checkWith = (version: string | null) =>
    StoredVersions.fromJSON({
        ...BUILT,
        heads: [
            { spec_id: SPEC, content_version: version },
            { spec_id: OTHER, content_version: VERSION },
        ],
    });

/** A ref of SPEC at `version`, as a read returns it. */
const refAt = (version: string) =>
    DatasetRef.fromJSON({
        ...refJson,
        members: [{ ...refJson.members[0]!, content_version: version }],
    });

/** A stand-in client whose check answers `check`, or throws it when it is an Error, and whose
 *  reads answer one row holding `value`, or throw `value` when it is an Error. The nth read
 *  takes SPEC at `versions[n]`, VERSION once they run out. */
const stubClient = (
    check: StoredVersions | Error,
    value: number | Error = 7,
    versions: readonly string[] = [],
) => {
    const checked: unknown[][] = [];
    const fetched: unknown[] = [];
    const options: { latest?: unknown }[] = [];
    const client = {
        storedVersions: async (targets: unknown[]) => {
            checked.push(targets);

            if (check instanceof Error) {
                throw check;
            }

            return check;
        },
        fetch: async (target: unknown, given: { latest?: unknown }) => {
            fetched.push(target);
            options.push(given);

            if (value instanceof Error) {
                throw value;
            }

            return {
                ref: refAt(versions[fetched.length - 1] ?? VERSION),
                freshness: 'current',
                toRows: async () => [{ time_period: 2024, value }],
            };
        },
    };

    // The stand-in implements only `storedVersions` and `fetch`, and returns dataset stubs.
    return { checked, fetched, options, client: client as unknown as StoredChecker };
};

const sources: Record<'a' | 'b', LiveSource> = { a: { ref: refJson }, b: { ref: refJson } };
const sum = (rows: Record<'a' | 'b', { value?: unknown }[]>) =>
    Number(rows.a[0]?.value) + Number(rows.b[0]?.value);

/** A load that counts its calls. */
const counted = (derive = sum) => {
    const calls = { count: 0 };

    return {
        calls,
        load: async () => {
            calls.count += 1;

            return { sources, derive };
        },
    };
};

/** Runs `body` with console.debug stubbed, and returns how many times it was called. */
const quietly = async (body: () => Promise<void>): Promise<number> => {
    const debug = mock.method(console, 'debug', () => {});

    try {
        await body();

        return debug.mock.callCount();
    } finally {
        debug.mock.restore();
    }
};

test('reads nothing when DFO stores the versions the build recorded', async () => {
    const { checked, fetched, client } = stubClient(checkWith(VERSION));
    const { calls, load } = counted();

    const result = await refreshIfNewer({ stored: BUILT, load, client, lane: createLane(4) });

    assert.deepEqual(result, { status: 'unchanged' });
    assert.equal(fetched.length, 0);
    assert.equal(calls.count, 0);
    assert.deepEqual(
        (checked[0] as { spec_id: string }[]).map(({ spec_id }) => spec_id),
        [SPEC, OTHER],
    );
});

test('reads every source again and derives the figures when a spec changed', async () => {
    const { checked, fetched, options, client } = stubClient(checkWith(NEWER), 5);
    const { calls, load } = counted();

    const result = await refreshIfNewer({
        stored: BUILT,
        load,
        client,
        lane: createLane(4),
        now: () => Date.UTC(2026, 10, 24, 9, 41, 30),
    });

    assert.deepEqual(result, {
        status: 'refreshed',
        value: 10,
        retrieved: '2026-11-24T09:41:30.000Z',
    });
    assert.equal(checked.length, 1);
    assert.equal(fetched.length, 2);
    assert.deepEqual(
        options.map(({ latest }) => latest),
        ['stored', 'stored'],
    );
    assert.equal(calls.count, 1);
});

test('reads nothing when a spec held no stored version at the build and holds none now', async () => {
    const none = {
        ...BUILT,
        heads: [
            { spec_id: SPEC, content_version: null },
            { spec_id: OTHER, content_version: VERSION },
        ],
    };
    const { fetched, client } = stubClient(checkWith(null));
    const { calls, load } = counted();

    const result = await refreshIfNewer({ stored: none, load, client, lane: createLane(4) });

    assert.deepEqual(result, { status: 'unchanged' });
    assert.equal(fetched.length, 0);
    assert.equal(calls.count, 0);
});

test('fails, keeping the built figures, when the reads again took one spec at two versions', async () => {
    const { client } = stubClient(checkWith(NEWER), 5, [VERSION, NEWER]);
    let result: unknown;

    const logged = await quietly(async () => {
        result = await refreshIfNewer({
            stored: BUILT,
            load: counted().load,
            client,
            lane: createLane(4),
        });
    });

    assert.deepEqual(result, { status: 'failed' });
    assert.equal(logged, 1);
});

for (const [label, make] of [
    ['the check fails', () => stubClient(new Error('network')).client],
    ['a read again fails', () => stubClient(checkWith(NEWER), new Error('503')).client],
] as const) {
    test(`fails, keeping the built figures, when ${label}`, async () => {
        let result: unknown;
        const logged = await quietly(async () => {
            result = await refreshIfNewer({
                stored: BUILT,
                load: counted().load,
                client: make(),
                lane: createLane(4),
            });
        });

        assert.deepEqual(result, { status: 'failed' });
        assert.equal(logged, 1);
    });
}

test('fails, keeping the built figures, when the rows read again break a figure check', async () => {
    const { client } = stubClient(checkWith(null));
    const { load } = counted(() => {
        throw new Error('contexts_without_aid');
    });
    let result: unknown;

    await quietly(async () => {
        result = await refreshIfNewer({ stored: BUILT, load, client, lane: createLane(4) });
    });

    assert.deepEqual(result, { status: 'failed' });
});

test('fails, reading nothing, when the page aborts the check', async () => {
    const { checked, fetched, client } = stubClient(checkWith(NEWER));
    let result: unknown;

    await quietly(async () => {
        result = await refreshIfNewer({
            stored: BUILT,
            load: counted().load,
            client,
            lane: createLane(4),
            signal: AbortSignal.abort(),
        });
    });

    assert.deepEqual(result, { status: 'failed' });
    assert.equal(checked.length, 0);
    assert.equal(fetched.length, 0);
});

test('a refreshed page shows the read again and its time; any other outcome the build and its', () => {
    const built = { value: 1, retrieved: '2026-11-23T06:12:00.000Z' };
    const refreshed = settledState(built, {
        status: 'refreshed',
        value: 2,
        retrieved: '2026-11-24T09:41:30.000Z',
    });

    assert.deepEqual(refreshed, {
        value: 2,
        retrieved: '2026-11-24T09:41:30.000Z',
        check: 'refreshed',
    });
    assert.deepEqual(retrievedParts(refreshed.retrieved), { day: '2026-11-24', time: '09:41' });

    for (const status of ['unchanged', 'failed'] as const) {
        assert.deepEqual(settledState(built, { status }), { ...built, check: status });
    }
});
