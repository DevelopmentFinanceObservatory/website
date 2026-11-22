/**
 * The Studio proxy's ownership check: a conversation an account saved
 * answers only to that account, and reading or resuming it needs the
 * caller's own saved copy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalStudioCall, studioAccess } from '../studioAccess.ts';

type AccessInput = Parameters<typeof studioAccess>[0];

const studioAccessRefusal = async (input: AccessInput) => (await studioAccess(input)).refusal;

const OWNERS: Record<string, string[]> = {
    'conv-ana': ['user-ana'],
    'conv-guest': [],
};

const check = (
    route: string,
    userId: string | null,
    conversationId: string,
    { method = route === 'state' ? 'GET' : 'POST' }: { method?: string } = {},
) =>
    studioAccessRefusal({
        route,
        method,
        search: new URLSearchParams(method === 'GET' ? { conversation_id: conversationId } : {}),
        readBody: async () => JSON.stringify({ kind: 'x', conversation_id: conversationId }),
        readUserId: async () => userId,
        ownersOf: async (id) => OWNERS[id] ?? [],
    });

test('studioAccessRefusal answers 404 for a conversation another account saved', async () => {
    for (const route of ['turn', 'interrupt', 'cancel', 'composition', 'state', 'resume']) {
        assert.equal(await check(route, 'user-ben', 'conv-ana'), 'not_found', route);
        assert.equal(await check(route, null, 'conv-ana'), 'not_found', `guest ${route}`);
        assert.equal(await check(route, 'user-ana', 'conv-ana'), null, `owner ${route}`);
    }
});

test('studioAccessRefusal gives state and resume only to an owner with a saved copy', async () => {
    for (const route of ['state', 'resume']) {
        assert.equal(await check(route, null, 'conv-guest'), 'not_found', `guest ${route}`);
        assert.equal(await check(route, 'user-ana', 'conv-guest'), 'not_found', route);
    }

    // A conversation nobody has saved yet (a guest's, or an account's first
    // turn before its first save) still drives its turn.
    for (const route of ['turn', 'interrupt', 'cancel', 'composition']) {
        assert.equal(await check(route, null, 'conv-guest'), null, `guest ${route}`);
        assert.equal(await check(route, 'user-ana', 'conv-guest'), null, route);
    }
});

test('studioAccessRefusal refuses a body over the cap and a state read naming no conversation', async () => {
    assert.equal(
        await studioAccessRefusal({
            route: 'turn',
            method: 'POST',
            search: new URLSearchParams(),
            readBody: async () => null,
            readUserId: async () => 'user-ana',
            ownersOf: async () => [],
        }),
        'too_large',
    );
    assert.equal(
        await studioAccessRefusal({
            route: 'state',
            method: 'GET',
            search: new URLSearchParams(),
            readBody: async () => '',
            readUserId: async () => 'user-ana',
            ownersOf: async () => ['user-ana'],
        }),
        'not_found',
    );
});

test('canonicalStudioCall reads the query of a GET and the JSON body otherwise', () => {
    const search = new URLSearchParams({ conversation_id: 'from-query' });

    assert.equal(canonicalStudioCall('GET', search, null)?.conversationId, 'from-query');
    assert.equal(
        canonicalStudioCall('POST', search, '{"conversation_id":"from-body"}')?.conversationId,
        'from-body',
    );
    assert.equal(
        canonicalStudioCall('POST', search, '{"conversation_id":7}')?.conversationId,
        null,
    );
    assert.equal(canonicalStudioCall('POST', search, '{"message":"hi"}')?.conversationId, null);
});

// The harness reads a repeated query parameter's last value, an
// `session_id` member as `conversation_id`, and parses JSON that
// JSON.parse refuses (`NaN`). Each pair names the conversation the proxy
// checks first and the one the raw request would have named to the harness.
test('studioAccess forwards only the conversation it checked', async () => {
    const owners: Record<string, string[]> = { 'conv-ana': ['user-ana'], 'conv-ben': ['user-ben'] };
    const asBen = (route: string, method: string, search: URLSearchParams, body: string) =>
        studioAccess({
            route,
            method,
            search,
            readBody: async () => body,
            readUserId: async () => 'user-ben',
            ownersOf: async (id) => owners[id] ?? [],
        });

    const repeated = await asBen(
        'state',
        'GET',
        new URLSearchParams([
            ['conversation_id', 'conv-ben'],
            ['conversation_id', 'conv-ana'],
        ]),
        '',
    );

    assert.equal(repeated.refusal, 'malformed');

    const nonJson = await asBen(
        'turn',
        'POST',
        new URLSearchParams(),
        '{"conversation_id":"conv-ana","message":NaN}',
    );

    assert.equal(nonJson.refusal, 'malformed');

    const alias = await asBen(
        'turn',
        'POST',
        new URLSearchParams(),
        '{"session_id":"conv-ana","message":"hi"}',
    );

    assert.equal(alias.refusal, null);
    assert.deepEqual(JSON.parse(alias.call?.body ?? ''), { message: 'hi' });

    const duplicate = await asBen(
        'turn',
        'POST',
        new URLSearchParams(),
        '{"conversation_id":"conv-ana","conversation_id":"conv-ben"}',
    );

    assert.equal(duplicate.refusal, null);
    assert.equal(duplicate.call?.body, '{"conversation_id":"conv-ben"}');

    const own = await asBen(
        'state',
        'GET',
        new URLSearchParams({ conversation_id: 'conv-ben', since: '3' }),
        '',
    );

    assert.equal(own.refusal, null);
    assert.equal(own.call?.search.toString(), 'conversation_id=conv-ben&since=3');
});

test('studioAccessRefusal refuses as unavailable when the owners cannot be read', async () => {
    const refusal = (ownersOf: () => Promise<string[]>) =>
        studioAccessRefusal({
            route: 'state',
            method: 'GET',
            search: new URLSearchParams({ conversation_id: 'conv-ana' }),
            readBody: async () => '',
            readUserId: async () => 'user-ana',
            ownersOf,
            timeoutMs: 10,
        });

    assert.equal(await refusal(() => new Promise<string[]>(() => {})), 'unavailable');
    assert.equal(await refusal(() => Promise.reject(new Error('db down'))), 'unavailable');
});
