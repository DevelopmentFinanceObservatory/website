import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createShare,
    readShare,
    readSlotCard,
    readSlotFile,
    SharesError,
    type CreateShareBody,
    type SharesBackend,
} from '../apisShares.ts';

type Call = { url: string; method: string; headers: Headers; body: unknown };

const APIS = 'https://apis.example';

const backendOf = (
    answer: (call: Call) => Response | Promise<Response>,
): { backend: SharesBackend; calls: Call[] } => {
    const calls: Call[] = [];

    return {
        calls,
        backend: {
            base: APIS,
            nameCaller: (headers) => headers.set('x-dfo-caller', 'ip:test'),
            fetch: async (input, init) => {
                const call = {
                    url: String(input),
                    method: init?.method ?? 'GET',
                    headers: new Headers(init?.headers),
                    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
                };

                calls.push(call);

                return answer(call);
            },
        },
    };
};

const RECORD = {
    id: 'Ab3dEf7h',
    kind: 'canvas',
    mode: 'live',
    title: 'Live aid',
    revision: 1,
    slots: [
        {
            slot: 1,
            card: {
                component_id: 'cmp_a',
                revision: 2,
                frame: { spec_id: 'spec_aid', content_version: 'cv_1' },
            },
            data_url: 'https://site.example/api/v1/presentation/shares/Ab3dEf7h/slots/1/data',
        },
        { slot: 2, card: { component_id: 'cmp_b', revision: 1, frame: null }, data_url: 'x' },
        { slot: 3, card: null, data_url: 'y' },
    ],
    payload: { widgets: [] },
    created_at: '2026-10-28T10:00:00Z',
};

const CREATED = (call: Call) =>
    Response.json(
        { id: 'Ab3dEf7h', write_token: (call.body as { write_token: string }).write_token },
        { status: 201 },
    );

const CREATE_BODY: CreateShareBody = {
    kind: 'card',
    latest: false,
    title: 'T',
    cards: [{ component_id: 'cmp_a', revision: 2 }],
    payload: null,
};

// dfo-apis' form of a client-minted write token.
const WRITE_TOKEN = /^shw_[A-Za-z0-9_-]{22}$/;

test('a create names the caller, sends the body under a minted token, and returns the id and token', async () => {
    const { backend, calls } = backendOf(CREATED);
    const created = await createShare(backend, {
        kind: 'canvas',
        latest: true,
        title: `  ${'t'.repeat(400)}`,
        cards: [{ component_id: 'cmp_a', revision: 2 }],
        payload: { widgets: [] },
    });
    const [call] = calls;
    const { write_token: token, ...body } = call?.body as Record<string, unknown>;

    assert.equal(created.id, 'Ab3dEf7h');
    assert.match(String(token), WRITE_TOKEN);
    assert.equal(created.writeToken, token);
    assert.equal(call?.url, `${APIS}/api/presentation/shares`);
    assert.equal(call?.method, 'POST');
    assert.equal(call?.headers.get('x-dfo-caller'), 'ip:test');
    assert.equal(call?.headers.get('x-dfo-write-token'), null);
    assert.deepEqual(body, {
        kind: 'canvas',
        latest: true,
        // dfo-apis takes a title of at most 300 characters.
        title: 't'.repeat(300),
        cards: [{ component_id: 'cmp_a', revision: 2 }],
        payload: { widgets: [] },
    });

    // Every create mints its own token.
    await createShare(backend, CREATE_BODY);
    assert.notEqual((calls[1]?.body as Record<string, unknown>)['write_token'], token);
});

test('a create that fails in a passing way is sent once more with the same token and body', async () => {
    const failures: [string, () => Response | Promise<Response>][] = [
        ['no answer', () => Promise.reject(new TypeError('fetch failed'))],
        [
            'retryable 503',
            () => Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }),
        ],
    ];

    for (const [name, fail] of failures) {
        let sent = 0;
        const { backend, calls } = backendOf((call) => (sent++ === 0 ? fail() : CREATED(call)));

        assert.equal((await createShare(backend, CREATE_BODY)).id, 'Ab3dEf7h', name);
        assert.equal(calls.length, 2, name);
        assert.deepEqual(calls[1]?.body, calls[0]?.body, name);
    }
});

test('a create is sent at most twice, and a refusal of the request or a spent allowance once', async () => {
    const rows: [Response, number][] = [
        [Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }), 2],
        [Response.json({ code: 'internal_error', retryable: false }, { status: 500 }), 1],
        [Response.json({ code: 'allowance_exhausted', retryable: true }, { status: 429 }), 1],
        [Response.json({ code: 'payload_too_large', retryable: false }, { status: 413 }), 1],
    ];

    for (const [answer, expected] of rows) {
        const { backend, calls } = backendOf(() => answer.clone());
        const refused = await createShare(backend, CREATE_BODY).catch((error: unknown) => error);

        assert.ok(refused instanceof SharesError);
        assert.equal(calls.length, expected, refused.code);
    }
});

test("a refusal throws dfo-apis' code, retryable and Retry-After", async () => {
    const { backend } = backendOf(() =>
        Response.json(
            { code: 'allowance_exhausted', retryable: true, detail: 'secret detail' },
            { status: 429, headers: { 'retry-after': '3600' } },
        ),
    );
    const refused = await createShare(backend, {
        kind: 'card',
        latest: false,
        title: 'T',
        cards: [],
        payload: null,
    }).catch((error: unknown) => error);

    assert.ok(refused instanceof SharesError);
    assert.equal(refused.code, 'allowance_exhausted');
    assert.equal(refused.status, 429);
    assert.equal(refused.retryable, true);
    assert.equal(refused.retryAfterS, 3600);
    assert.ok(!refused.message.includes('secret'));
});

test('a read maps the record, its empty slots, and slots with no recorded frame', async () => {
    const { backend } = backendOf(() => Response.json(RECORD));

    assert.deepEqual(await readShare(backend, 'Ab3dEf7h'), {
        id: 'Ab3dEf7h',
        kind: 'canvas',
        mode: 'live',
        title: 'Live aid',
        slots: [
            {
                slot: 1,
                card: {
                    component_id: 'cmp_a',
                    revision: 2,
                    frame: { spec_id: 'spec_aid', content_version: 'cv_1' },
                },
            },
            { slot: 2, card: { component_id: 'cmp_b', revision: 1, frame: null } },
            { slot: 3, card: null },
        ],
        payload: { widgets: [] },
        createdAt: '2026-10-28T10:00:00Z',
    });
});

test('no share is null: a 404, and an id not in dfo-apis form without a request', async () => {
    const { backend, calls } = backendOf(() =>
        Response.json({ code: 'not_found' }, { status: 404 }),
    );

    assert.equal(await readShare(backend, 'Ab3dEf7h'), null);
    assert.equal(await readShare(backend, '../admin'), null);
    assert.equal(calls.length, 1);
});

test('a slot card read passes If-None-Match on and gives the body, ETag and caching', async () => {
    const { backend, calls } = backendOf((call) =>
        call.headers.get('if-none-match') === '"e1"'
            ? new Response(null, {
                  status: 304,
                  headers: { etag: '"e1"', 'cache-control': 'no-cache' },
              })
            : Response.json(
                  { component_id: 'cmp_a', freshness: 'current' },
                  { headers: { etag: '"e1"', 'cache-control': 'no-cache' } },
              ),
    );

    assert.deepEqual(await readSlotCard(backend, 'Ab3dEf7h', 1), {
        body: { component_id: 'cmp_a', freshness: 'current' },
        etag: '"e1"',
        cacheControl: 'no-cache',
    });
    assert.deepEqual(await readSlotCard(backend, 'Ab3dEf7h', 1, '"e1"'), {
        body: null,
        etag: '"e1"',
        cacheControl: 'no-cache',
    });
    assert.equal(calls[0]?.url, `${APIS}/api/presentation/shares/Ab3dEf7h/slots/1`);
    assert.equal(calls[0]?.headers.get('if-none-match'), null);
});

test("a slot file read asks dfo-apis' slot data route, in its formats only", async () => {
    const { backend, calls } = backendOf(() => new Response('year,value\n'));

    assert.equal(await (await readSlotFile(backend, 'Ab3dEf7h', 2, 'csv')).text(), 'year,value\n');
    assert.equal(calls[0]?.url, `${APIS}/api/presentation/shares/Ab3dEf7h/slots/2/data?format=csv`);
    await assert.rejects(readSlotFile(backend, 'Ab3dEf7h', 2, 'xlsx'), SharesError);
    assert.equal(calls.length, 1);
});
