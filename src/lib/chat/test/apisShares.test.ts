import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createShare,
    readShare,
    readSlot,
    SharesError,
    type SharesBackend,
} from '../apisShares.ts';

type Call = { url: string; method: string; headers: Headers; body: unknown };

const APIS = 'https://apis.example';

const backendOf = (answer: (call: Call) => Response): { backend: SharesBackend; calls: Call[] } => {
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

test('a create names the caller, sends the body, and returns the id and token', async () => {
    const { backend, calls } = backendOf(() =>
        Response.json({ id: 'Ab3dEf7h', write_token: 'shw_x', revision: 1 }, { status: 201 }),
    );

    assert.deepEqual(
        await createShare(backend, {
            kind: 'canvas',
            latest: true,
            title: `  ${'t'.repeat(400)}`,
            cards: [{ component_id: 'cmp_a', revision: 2 }],
            payload: { widgets: [] },
        }),
        { id: 'Ab3dEf7h', writeToken: 'shw_x' },
    );

    const [call] = calls;

    assert.equal(call?.url, `${APIS}/api/presentation/shares`);
    assert.equal(call?.method, 'POST');
    assert.equal(call?.headers.get('x-dfo-caller'), 'ip:test');
    assert.equal(call?.headers.get('x-dfo-write-token'), null);
    assert.deepEqual(call?.body, {
        kind: 'canvas',
        latest: true,
        // dfo-apis takes a title of at most 300 characters.
        title: 't'.repeat(300),
        cards: [{ component_id: 'cmp_a', revision: 2 }],
        payload: { widgets: [] },
    });
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

test('a slot read asks for JSON and gives the frame served and its freshness', async () => {
    const { backend, calls } = backendOf(() =>
        Response.json({
            share_id: 'Ab3dEf7h',
            slot: 1,
            mode: 'live',
            freshness: 'pending',
            component_id: 'cmp_a',
            revision: 2,
            frame: { spec_id: 'spec_aid', content_version: 'cv_2' },
            rows: [],
        }),
    );

    assert.deepEqual(await readSlot(backend, 'Ab3dEf7h', 1), {
        componentId: 'cmp_a',
        revision: 2,
        frame: { spec_id: 'spec_aid', content_version: 'cv_2' },
        freshness: 'pending',
    });
    assert.equal(
        calls[0]?.url,
        `${APIS}/api/presentation/shares/Ab3dEf7h/slots/1/data?format=json`,
    );
});
