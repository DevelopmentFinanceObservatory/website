import assert from 'node:assert/strict';
import test from 'node:test';

import { readPinnedRef } from './pinnedRef.ts';

const SPEC_ID = `spec_${'a'.repeat(32)}`;

// The shape `DatasetRef.toJSON()` writes, which a step puts in live-refs.json.
const ref = {
    format_version: 1,
    members: [
        {
            parts: [],
            sentence: 'Germany ODA to Kenya',
            spec: {
                spec_id: SPEC_ID,
                definition: { schema_version: 1, spec_id: SPEC_ID, identity: {} },
            },
            content_version: `cv_${'b'.repeat(32)}`,
            artifact: {
                digest: `sha256:${'c'.repeat(64)}`,
                rendering: { format: 'parquet', bundle: false },
            },
        },
    ],
};

test('fetches the ref through the client and returns the dataset with its rows', async () => {
    const data = { toRows: async () => [{ time_period: '2024', value: 1 }] };
    const calls: unknown[] = [];
    const client = {
        fetch: async (target: unknown) => {
            calls.push(target);

            return data;
        },
    };

    // @ts-expect-error the stand-in client implements only `fetch`, and returns a dataset stub
    const read = await readPinnedRef(ref, { client });

    assert.equal(read.data, data);
    assert.deepEqual(read.rows, [{ time_period: '2024', value: 1 }]);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ref);
});

test('rejects a ref the client cannot read, before any request', async () => {
    const real = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = (async () => {
        requests += 1;

        return new Response('{}');
    }) as typeof fetch;

    try {
        await assert.rejects(readPinnedRef({ format_version: 1 }), { code: 'format_invalid' });
        assert.equal(requests, 0);
    } finally {
        globalThis.fetch = real;
    }
});

test('the default client reads the production API anonymously and surfaces a failure', async () => {
    const real = globalThis.fetch;
    const seen: { url: string; headers: Headers }[] = [];
    globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
        const request = new Request(input, init);
        seen.push({ url: request.url, headers: request.headers });

        return new Response(JSON.stringify({ error: { code: 'not_found' } }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        await assert.rejects(readPinnedRef(ref));
        assert.ok(seen.length > 0);
        assert.ok(seen[0]?.url.startsWith('https://developmentfinance.org/api/v1/'));
        assert.equal(seen[0]?.headers.has('authorization'), false);
    } finally {
        globalThis.fetch = real;
    }
});
