/**
 * The Studio proxy's ownership check: a conversation an account saved
 * answers only to that account, and reading or resuming it needs the
 * caller's own saved copy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { studioAccessRefusal, studioConversationId } from '../studioAccess.ts';

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

test('studioConversationId reads the query of a GET and the JSON body otherwise', () => {
    const search = new URLSearchParams({ conversation_id: 'from-query' });

    assert.equal(studioConversationId('GET', search, null), 'from-query');
    assert.equal(
        studioConversationId('POST', search, '{"conversation_id":"from-body"}'),
        'from-body',
    );
    assert.equal(studioConversationId('POST', search, 'not json'), null);
    assert.equal(studioConversationId('POST', search, '{"conversation_id":7}'), null);
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
