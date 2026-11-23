/**
 * The Studio proxy's ownership check: a conversation an account saved
 * answers only to that account, and reading or resuming it needs the
 * caller's own saved copy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canonicalStudioCall,
    checkStudioOwner,
    readStudioCall,
    SIGN_IN_REQUIRED,
} from '../studioAccess.ts';

type CallInput = Parameters<typeof readStudioCall>[0];
type OwnerInput = Omit<Parameters<typeof checkStudioOwner>[0], 'conversationId'>;

// Both steps of the proxy's check, as studioProxy runs them: the call it
// rebuilds, then the owner check on the conversation that call names.
const studioAccess = async (input: CallInput & OwnerInput) => {
    const read = await readStudioCall(input);

    if (read.refusal !== null || read.call === null) {
        return read;
    }

    const refusal = await checkStudioOwner({ ...input, conversationId: read.call.conversationId });

    return refusal === null ? read : { refusal, call: null };
};

const studioAccessRefusal = async (input: CallInput & OwnerInput) =>
    (await studioAccess(input)).refusal;

// A claim on a conversation no other account has claimed: the caller owns it.
const unclaimed = async (_id: string, userId: string) => [userId];

const OWNERS: Record<string, (string | null)[]> = {
    'conv-ana': ['user-ana'],
    'conv-guest': [],
    // Its owner's account was deleted.
    'conv-orphan': [null],
};

const ROUTES = ['turn', 'interrupt', 'cancel', 'composition', 'state', 'resume'];

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
        claimOwner: unclaimed,
    });

// A guest is asked to sign in, and another account is told there is no
// such conversation.
test('a conversation another account saved refuses a guest and a non-owner apart', async () => {
    for (const route of ROUTES) {
        assert.equal(await check(route, 'user-ben', 'conv-ana'), 'not_found', route);
        assert.equal(await check(route, null, 'conv-ana'), SIGN_IN_REQUIRED, `guest ${route}`);
        assert.equal(await check(route, 'user-ana', 'conv-ana'), null, `owner ${route}`);
    }
});

test('a conversation whose owner deleted their account answers to nobody', async () => {
    for (const route of ROUTES) {
        assert.equal(await check(route, null, 'conv-orphan'), 'not_found', `guest ${route}`);
        assert.equal(await check(route, 'user-ben', 'conv-orphan'), 'not_found', route);
    }
});

test('studioAccessRefusal gives state and resume only to an owner with a saved copy', async () => {
    for (const route of ['state', 'resume']) {
        assert.equal(await check(route, null, 'conv-guest'), 'not_found', `guest ${route}`);
        assert.equal(await check(route, 'user-ana', 'conv-guest'), 'not_found', route);
    }

    // A conversation no account owns yet (a guest's, or one an account is
    // about to claim) still drives its turn.
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
            claimOwner: unclaimed,
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
            claimOwner: unclaimed,
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

// The harness reads a repeated query parameter's last value, an older
// harness reads a `session_id` member as `conversation_id`, and it parses JSON that
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
            claimOwner: unclaimed,
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

    const aliasQuery = await asBen(
        'state',
        'GET',
        new URLSearchParams([
            ['conversation_id', 'conv-ben'],
            ['session_id', 'conv-ana'],
        ]),
        '',
    );

    assert.equal(aliasQuery.refusal, 'malformed');

    // A POST carries its conversation in the body, and its query never
    // reaches the harness.
    const postQuery = await asBen(
        'turn',
        'POST',
        new URLSearchParams({ conversation_id: 'conv-ana', session_id: 'conv-ana' }),
        '{"conversation_id":"conv-ben"}',
    );

    assert.equal(postQuery.refusal, null);
    assert.equal(postQuery.call?.search.toString(), '');

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

// Two accounts driving a turn in one new conversation: the first claims it,
// and the second, whether it reads before or after that claim, is refused.
test('studioAccess binds a new conversation to the first account to drive a turn in it', async () => {
    const owners = new Map<string, string>();
    const claims: string[] = [];
    const turn = (userId: string | null, route = 'turn') =>
        studioAccessRefusal({
            route,
            method: route === 'state' ? 'GET' : 'POST',
            search: new URLSearchParams(route === 'state' ? { conversation_id: 'conv-new' } : {}),
            readBody: async () => '{"conversation_id":"conv-new"}',
            readUserId: async () => userId,
            ownersOf: async (id) => [...(owners.has(id) ? [owners.get(id)!] : [])],
            claimOwner: async (id, claimant) => {
                claims.push(claimant);

                if (!owners.has(id)) {
                    owners.set(id, claimant);
                }

                return [owners.get(id)!];
            },
        });

    assert.equal(await turn(null), null, 'a guest claims nothing');
    assert.equal(await turn('user-ana', 'state'), 'not_found', 'a state read claims nothing');

    for (const route of ['interrupt', 'cancel', 'composition']) {
        assert.equal(await turn('user-ben', route), null, `${route} claims nothing`);
    }

    assert.deepEqual(claims, []);

    const [ana, ben] = await Promise.all([turn('user-ana'), turn('user-ben')]);

    assert.deepEqual([ana, ben], [null, 'not_found']);
    assert.deepEqual(claims, ['user-ana', 'user-ben']);
    assert.equal(await turn('user-ben'), 'not_found');
    assert.equal(await turn(null), SIGN_IN_REQUIRED);
    assert.equal(await turn('user-ana', 'state'), null);
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
            claimOwner: unclaimed,
            timeoutMs: 10,
        });

    assert.equal(await refusal(() => new Promise<string[]>(() => {})), 'unavailable');
    assert.equal(await refusal(() => Promise.reject(new Error('db down'))), 'unavailable');

    const claimRefusal = (claimOwner: () => Promise<string[]>) =>
        studioAccessRefusal({
            route: 'turn',
            method: 'POST',
            search: new URLSearchParams(),
            readBody: async () => '{"conversation_id":"conv-new"}',
            readUserId: async () => 'user-ana',
            ownersOf: async () => [],
            claimOwner,
            timeoutMs: 10,
        });

    assert.equal(await claimRefusal(() => new Promise<string[]>(() => {})), 'unavailable');
    assert.equal(await claimRefusal(() => Promise.reject(new Error('db down'))), 'unavailable');
});
