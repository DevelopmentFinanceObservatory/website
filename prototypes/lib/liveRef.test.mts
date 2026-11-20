import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { DatasetRef } from '@developmentfinance/client';
import { DfoTimeoutError } from '@developmentfinance/client/errors';

import { readLiveRefs, STORED_TIMEOUT_MS } from './liveRef.ts';

const SPEC_ID = `spec_${'a'.repeat(32)}`;
const VERSION = `cv_${'b'.repeat(32)}`;
const NEWER = `cv_${'d'.repeat(32)}`;

// The shape `DatasetRef.toJSON()` writes, which a step puts in live-refs.json.
const refAt = (version: string) => ({
    format_version: 1,
    members: [
        {
            parts: [],
            sentence: 'Germany ODA to Kenya',
            spec: {
                spec_id: SPEC_ID,
                definition: { schema_version: 1, spec_id: SPEC_ID, identity: {} },
            },
            content_version: version,
            artifact: {
                digest: `sha256:${'c'.repeat(64)}`,
                rendering: { format: 'parquet', bundle: false },
            },
        },
    ],
});
const ref = refAt(VERSION);

type Options = { latest?: unknown; signal?: AbortSignal; timeout?: number };
type Call = { target: unknown; options: Options };

/** A dataset stub at `version` whose one row holds `value`. */
const dataset = (value: number, version = VERSION) => ({
    ref: DatasetRef.fromJSON(refAt(version)),
    toRows: async () => [{ time_period: 2024, value }],
});

/** A stand-in client whose fetches answer in turn from `answers`, a dataset stub or an error. */
const stubClient = (...answers: unknown[]) => {
    const calls: Call[] = [];
    const client = {
        fetch: async (target: unknown, options: Options) => {
            calls.push({ target, options });
            const answer = answers[calls.length - 1];

            if (answer instanceof Error) {
                throw answer;
            }

            return answer;
        },
    };

    return { calls, client };
};

const valueOf = (rows: Record<string, { value?: unknown }[]>) =>
    Object.values(rows).map((read) => read[0]?.value);

const quietly = async (body: (warn: ReturnType<typeof mock.method>) => Promise<void>) => {
    const warn = mock.method(console, 'warn', () => {});

    try {
        await body(warn);
    } finally {
        warn.mock.restore();
    }
};

test('reads the newest stored versions within the time limit and derives the value', async () => {
    const { calls, client } = stubClient(dataset(2));

    // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
    const read = await readLiveRefs({ a: ref }, valueOf, { client });

    assert.deepEqual(read.value, [2]);
    assert.equal(read.asCommitted, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.options.latest, 'stored');
    assert.equal(calls[0]?.options.timeout, STORED_TIMEOUT_MS);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0]?.target)), ref);
});

test('a stored version newer than the ref is not as committed', async () => {
    const { client } = stubClient(dataset(2, NEWER));

    // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
    const read = await readLiveRefs({ a: ref }, valueOf, { client });

    assert.equal(read.asCommitted, false);
});

for (const [label, failure] of [
    ['fails', new Error('stored read failed')],
    ['times out', new DfoTimeoutError({ code: 'deadline_exceeded', status: null })],
] as const) {
    test(`a stored read that ${label} sends every ref to its pinned version, with no time limit`, async () => {
        await quietly(async (warn) => {
            const { calls, client } = stubClient(dataset(2), failure, dataset(1), dataset(1));

            // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
            const read = await readLiveRefs({ a: ref, b: ref }, valueOf, { client });

            assert.deepEqual(read.value, [1, 1]);
            assert.equal(read.asCommitted, true);
            assert.deepEqual(
                calls.map(({ options }) => [options.latest, options.timeout]),
                [
                    ['stored', STORED_TIMEOUT_MS],
                    ['stored', STORED_TIMEOUT_MS],
                    [undefined, undefined],
                    [undefined, undefined],
                ],
            );
            // The stored reads still running stop before the pinned reads start.
            assert.equal(calls[0]?.options.signal?.aborted, true);
            assert.equal(calls[2]?.options.signal, undefined);
            assert.equal(warn.mock.callCount(), 1);
        });
    });
}

test('stored rows the derivation refuses send the read to the pinned version', async () => {
    await quietly(async () => {
        const { client } = stubClient(dataset(2, NEWER), dataset(1));
        const derive = (rows: Record<string, { value?: unknown }[]>) => {
            const [value] = valueOf(rows);

            if (value === 2) {
                throw new Error('two rows for one year');
            }

            return value;
        };

        // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
        const read = await readLiveRefs({ a: ref }, derive, { client });

        assert.equal(read.value, 1);
        assert.equal(read.asCommitted, true);
    });
});

test('an aborted read rejects without reading the pinned versions', async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, client } = stubClient(new DOMException('aborted', 'AbortError'), dataset(1));

    await assert.rejects(
        // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
        readLiveRefs({ a: ref }, valueOf, { client, signal: controller.signal }),
        { name: 'AbortError' },
    );
    assert.equal(calls.length, 1);
});

test('rejects a ref the client cannot read, before any request', async () => {
    const real = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = (async () => {
        requests += 1;

        return new Response('{}');
    }) as typeof fetch;

    try {
        await assert.rejects(readLiveRefs({ a: { format_version: 1 } }, valueOf), {
            code: 'format_invalid',
        });
        assert.equal(requests, 0);
    } finally {
        globalThis.fetch = real;
    }
});

test('the default client reads the spec, then the pinned version, from the production API anonymously', async () => {
    const real = globalThis.fetch;
    const seen: { url: URL; headers: Headers }[] = [];
    globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
        const request = new Request(input, init);
        seen.push({ url: new URL(request.url), headers: request.headers });

        return new Response(JSON.stringify({ error: { code: 'not_found' } }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        await quietly(async () => {
            await assert.rejects(readLiveRefs({ a: ref }, valueOf));
        });
        assert.equal(
            `${seen[0]?.url.origin}${seen[0]?.url.pathname}`,
            `https://developmentfinance.org/api/v1/datasets/${SPEC_ID}`,
        );
        assert.ok(seen.slice(1).some(({ url }) => url.pathname.includes(VERSION)));
        assert.ok(seen.every(({ headers }) => !headers.has('authorization')));
    } finally {
        globalThis.fetch = real;
    }
});
