import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { DatasetRef } from '@developmentfinance/client';
import { DfoTimeoutError } from '@developmentfinance/client/errors';

import { recipe } from '@developmentfinance/client';

import { ANALYSIS_CONCURRENCY, READ_CONCURRENCY, readLive, STORED_TIMEOUT_MS } from './liveRead.ts';
import { pacer } from './pacing.ts';

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
const PINNED = { tier: 'pinned' } as const;

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
    const read = await readLive({ a: { ref } }, valueOf, { fallback: PINNED, client });

    assert.deepEqual(read.value, [2]);
    assert.equal(read.tier, 'stored');
    assert.equal(read.asCommitted, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.options.latest, 'stored');
    assert.equal(calls[0]?.options.timeout, STORED_TIMEOUT_MS);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0]?.target)), ref);
});

test('a stored version newer than the ref is not as committed', async () => {
    const { client } = stubClient(dataset(2, NEWER));

    // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
    const read = await readLive({ a: { ref } }, valueOf, { fallback: PINNED, client });

    assert.equal(read.asCommitted, false);
});

for (const [label, failure] of [
    ['fails', new Error('stored read failed')],
    ['times out', new DfoTimeoutError({ code: 'deadline_exceeded', status: null })],
] as const) {
    test(`a stored read that ${label} sends every ref to its pinned version, with no time limit`, async () => {
        await quietly(async (warn) => {
            const { calls, client } = stubClient(dataset(2), failure, dataset(1), dataset(1));

            const read = await readLive({ a: { ref }, b: { ref } }, valueOf, {
                fallback: PINNED,
                // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
                client,
            });

            assert.deepEqual(read.value, [1, 1]);
            assert.equal(read.tier, 'pinned');
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
        const read = await readLive({ a: { ref } }, derive, { fallback: PINNED, client });

        assert.equal(read.value, 1);
        assert.equal(read.asCommitted, true);
    });
});

test('a page with committed figures shows them when a stored read fails, with no other request', async () => {
    await quietly(async (warn) => {
        const { calls, client } = stubClient(dataset(2), new Error('stored read failed'));

        const read = await readLive({ a: { ref }, b: { ref } }, valueOf, {
            fallback: { tier: 'committed', value: [7, 7] },
            // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
            client,
        });

        assert.deepEqual(read, {
            tier: 'committed',
            value: [7, 7],
            datasets: null,
            asCommitted: true,
        });
        assert.equal(calls.length, 2);
        assert.equal(warn.mock.callCount(), 1);
    });
});

test('runs a recipe at the newest stored versions before the refs, and derives from both', async () => {
    const { calls, client } = stubClient(dataset(3), dataset(2));
    const chain = recipe(DatasetRef.fromJSON(ref)).aggregate({ by: 'destination' });

    const read = await readLive({ a: { ref }, b: { recipe: chain } }, valueOf, {
        fallback: { tier: 'committed', value: [7, 7] },
        // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
        client,
    });

    assert.equal(read.tier, 'stored');
    assert.deepEqual(read.value, [2, 3]);
    assert.equal(read.asCommitted, false);
    assert.equal(calls[0]?.target, chain);
    assert.equal(calls[0]?.options.latest, 'stored');
    assert.equal(calls[0]?.options.timeout, STORED_TIMEOUT_MS);
});

test('a recipe that fails at the newest stored versions shows the committed figures', async () => {
    await quietly(async (warn) => {
        const { calls, client } = stubClient(new Error('analysis refused'));

        const read = await readLive(
            { a: { ref }, b: { recipe: recipe(DatasetRef.fromJSON(ref)) } },
            valueOf,
            {
                fallback: { tier: 'committed', value: [7, 7] },
                // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
                client,
            },
        );

        assert.deepEqual(read, {
            tier: 'committed',
            value: [7, 7],
            datasets: null,
            asCommitted: true,
        });
        assert.equal(calls.length, 1);
        assert.equal(warn.mock.callCount(), 1);
    });
});

test('reads at most READ_CONCURRENCY at once, and starts none after one fails', async () => {
    await quietly(async () => {
        const sources = Object.fromEntries(
            Array.from({ length: READ_CONCURRENCY * 3 }, (_, index) => [`r${index}`, { ref }]),
        );
        let running = 0;
        let most = 0;
        let started = 0;
        const client = {
            fetch: async () => {
                started += 1;
                const call = started;
                running += 1;
                most = Math.max(most, running);
                await new Promise((resolve) => setTimeout(resolve, 1));
                running -= 1;

                if (call === 1) {
                    throw new Error('stored read failed');
                }

                return dataset(2);
            },
        };

        const read = await readLive(sources, valueOf, {
            fallback: { tier: 'committed', value: [] },
            // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
            client,
        });

        // Reads that would start after the failure have time to.
        await new Promise((resolve) => setTimeout(resolve, 20));

        assert.equal(read.tier, 'committed');
        assert.equal(most, READ_CONCURRENCY);
        assert.ok(started < READ_CONCURRENCY * 2, `${started} reads started`);
    });
});

/** `count` recipes on the test ref, keyed `c0`, `c1` and on. */
const recipes = (count: number) =>
    Object.fromEntries(
        Array.from({ length: count }, (_, index) => [
            `c${index}`,
            { recipe: recipe(DatasetRef.fromJSON(ref)).aggregate({ by: 'destination' }) },
        ]),
    );

/** A stand-in client that counts the recipes in flight and answers each after a tick, failing
 *  the calls `fails` names by their order. */
const countingClient = (fails: readonly number[] = []) => {
    const seen = { started: 0, finished: 0, most: 0, running: 0 };
    const client = {
        fetch: async () => {
            seen.started += 1;
            const call = seen.started;
            seen.running += 1;
            seen.most = Math.max(seen.most, seen.running);
            await new Promise((resolve) => setTimeout(resolve, 2));
            seen.running -= 1;
            seen.finished += 1;

            if (fails.includes(call)) {
                throw new Error('analysis refused');
            }

            return dataset(2);
        },
    };

    return { seen, client };
};

test('runs at most ANALYSIS_CONCURRENCY recipes at once, below the pacer bound', async () => {
    const { seen, client } = countingClient();

    const read = await readLive(recipes(READ_CONCURRENCY * 2), valueOf, {
        fallback: { tier: 'committed', value: [] },
        // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
        client,
    });

    assert.equal(read.tier, 'stored');
    assert.ok(ANALYSIS_CONCURRENCY < READ_CONCURRENCY);
    assert.equal(seen.most, ANALYSIS_CONCURRENCY);
    assert.equal(seen.finished, READ_CONCURRENCY * 2);
});

test('after a recipe fails, the page shows the committed figures and the other recipes run to the end', async () => {
    await quietly(async () => {
        const count = READ_CONCURRENCY * 2;
        const { seen, client } = countingClient([1]);

        const read = await readLive(recipes(count), valueOf, {
            fallback: { tier: 'committed', value: [7] },
            // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
            client,
        });

        assert.equal(read.tier, 'committed');
        assert.ok(seen.finished < count, `${seen.finished} recipes had finished`);

        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.equal(seen.finished, count);
        assert.equal(seen.most, ANALYSIS_CONCURRENCY);
    });
});

test("waits for the page pacer's slots, which other requests hold", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const holders = Array.from({ length: READ_CONCURRENCY }, () => pacer.run(() => held));
    const { calls, client } = stubClient(dataset(2));
    const read = readLive({ a: { ref } }, valueOf, {
        fallback: PINNED,
        // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
        client,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(calls.length, 0);

    release();
    await Promise.all(holders);
    assert.deepEqual((await read).value, [2]);
    assert.equal(calls.length, 1);
});

test('a recipe with a pinned fallback rejects before any request', async () => {
    const { calls, client } = stubClient(dataset(2));

    await assert.rejects(
        readLive({ a: { recipe: recipe(DatasetRef.fromJSON(ref)) } }, valueOf, {
            fallback: PINNED,
            // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
            client,
        }),
    );
    assert.equal(calls.length, 0);
});

test('an aborted read rejects without reading the pinned versions', async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, client } = stubClient(new DOMException('aborted', 'AbortError'), dataset(1));

    await assert.rejects(
        readLive({ a: { ref } }, valueOf, {
            fallback: PINNED,
            // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
            client,
            signal: controller.signal,
        }),
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
        await assert.rejects(
            readLive({ a: { ref: { format_version: 1 } } }, valueOf, { fallback: PINNED }),
            {
                code: 'format_invalid',
            },
        );
        assert.equal(requests, 0);
    } finally {
        globalThis.fetch = real;
    }
});

test('the default client reads the spec, then the pinned version, from the production API anonymously, through the pacer', async () => {
    const real = globalThis.fetch;
    const seen: { url: URL; headers: Headers }[] = [];
    globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
        const request = new Request(input, init);
        seen.push({ url: new URL(request.url), headers: request.headers });

        return new Response(JSON.stringify({ error: { code: 'not_found' } }), {
            status: 404,
            headers: {
                'content-type': 'application/json',
                'x-ratelimit-remaining': '41',
                'x-ratelimit-reset': '30',
            },
        });
    }) as typeof fetch;

    try {
        await quietly(async () => {
            await assert.rejects(readLive({ a: { ref } }, valueOf, { fallback: PINNED }));
        });
        assert.equal(
            `${seen[0]?.url.origin}${seen[0]?.url.pathname}`,
            `https://developmentfinance.org/api/v1/datasets/${SPEC_ID}`,
        );
        assert.ok(seen.slice(1).some(({ url }) => url.pathname.includes(VERSION)));
        assert.ok(seen.every(({ headers }) => !headers.has('authorization')));
        assert.equal(pacer.allowance('datasets')?.remaining, 41);
    } finally {
        globalThis.fetch = real;
    }
});
