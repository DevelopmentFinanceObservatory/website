/**
 * The Studio proxy's ownership check: a conversation an account owns
 * answers only to that account, and reading or resuming it needs the caller
 * to own it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canonicalStudioCall,
    checkStudioOwner,
    isConversationId,
    MAX_CONVERSATION_ID_CHARS,
    readStudioCall,
    SIGN_IN_REQUIRED,
} from '../studioAccess.ts';

type CallInput = Parameters<typeof readStudioCall>[0];
type OwnerInput = Omit<Parameters<typeof checkStudioOwner>[0], 'conversationId' | 'refuse'>;

// Both steps of the proxy's check, as studioProxy runs them: the call it
// rebuilds, then the owner check on the conversation that call names.
const studioAccess = async (input: CallInput & OwnerInput) => {
    const read = await readStudioCall(input);

    if (read.refusal !== null || read.call === null) {
        return read;
    }

    const refusal = await checkStudioOwner({
        ...input,
        conversationId: read.call.conversationId,
        refuse: (ownerRefusal) => ownerRefusal,
    });

    return refusal === null ? read : { refusal, call: null };
};

const studioAccessRefusal = async (input: CallInput & OwnerInput) =>
    (await studioAccess(input)).refusal;

// A claim on a conversation no other account has claimed, so the caller owns it.
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
test('a conversation another account owns refuses a guest and a non-owner apart', async () => {
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

test('studioAccessRefusal gives state and resume only to the owner', async () => {
    for (const route of ['state', 'resume']) {
        assert.equal(await check(route, null, 'conv-guest'), 'not_found', `guest ${route}`);
        assert.equal(await check(route, 'user-ana', 'conv-guest'), 'not_found', route);
    }

    // A conversation no account owns yet (a guest's, or one an account is
    // about to claim) can still drive its turn.
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
    for (const id of ['7', 'null', '["a"]', '{}', 'true']) {
        assert.equal(
            canonicalStudioCall('POST', search, `{"conversation_id":${id}}`),
            null,
            `conversation_id ${id}`,
        );
    }
    assert.equal(canonicalStudioCall('POST', search, '{"message":"hi"}')?.conversationId, null);

    const long = 'c'.repeat(MAX_CONVERSATION_ID_CHARS + 1);

    assert.equal(
        canonicalStudioCall('GET', new URLSearchParams({ conversation_id: long }), null),
        null,
    );
    assert.equal(
        canonicalStudioCall('POST', search, JSON.stringify({ conversation_id: long })),
        null,
    );
    assert.equal(
        canonicalStudioCall('POST', search, JSON.stringify({ conversation_id: long.slice(1) }))
            ?.conversationId,
        long.slice(1),
    );
});

test('isConversationId refuses an empty id and one with a control character', () => {
    for (const id of ['', 'a\u0000b', 'a\nb', '\u007f']) {
        assert.equal(isConversationId(id), false, JSON.stringify(id));
        assert.equal(
            canonicalStudioCall('GET', new URLSearchParams({ conversation_id: id }), null),
            null,
        );
        assert.equal(
            canonicalStudioCall(
                'POST',
                new URLSearchParams(),
                JSON.stringify({ conversation_id: id }),
            ),
            null,
        );
    }

    assert.equal(isConversationId('c'.repeat(MAX_CONVERSATION_ID_CHARS)), true);
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

    // The alias is dropped, so the turn names no conversation and is refused.
    assert.equal(alias.refusal, 'not_found');

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

test('a call to a route that drives a turn must name a conversation', async () => {
    for (const route of ['turn', 'interrupt', 'cancel', 'composition']) {
        for (const userId of [null, 'user-ana']) {
            assert.equal(
                await checkStudioOwner({
                    route,
                    conversationId: null,
                    readUserId: async () => userId,
                    ownersOf: async () => [],
                    claimOwner: unclaimed,
                    refuse: (refusal) => refusal,
                }),
                'not_found',
                `${userId} ${route}`,
            );
        }
    }
});

// A body read the way the proxy reads one (readBoundedText): null past the
// cap the proxy passes in.
const boundedBody = (body: string) => async (maxBytes: number) =>
    Buffer.byteLength(body) > maxBytes ? null : body;

// A turn seeding six Spec blocks of 1 MiB each, as a Search-to-Studio
// handoff may, is read whole. Any other route keeps a small cap.
test('readStudioCall reads a turn carrying six 1 MiB seeds and caps other routes', async () => {
    const body = JSON.stringify({
        conversation_id: 'conv-ana',
        message: 'hi',
        seed_spec: Array.from({ length: 6 }, () => 'x'.repeat(1_048_000)),
    });
    const read = (route: string) =>
        readStudioCall({
            route,
            method: 'POST',
            search: new URLSearchParams(),
            readBody: boundedBody(body),
        });

    assert.equal((await read('turn')).refusal, null);

    for (const route of ['interrupt', 'cancel', 'composition', 'resume']) {
        assert.equal((await read(route)).refusal, 'too_large', route);
    }
});

// An OPTIONS call is answered by the proxy and a method the route does not
// serve is refused, both before the body is read.
test('readStudioCall answers OPTIONS and refuses a method the route does not serve', async () => {
    const reads: string[] = [];
    const read = (route: string, method: string) =>
        readStudioCall({
            route,
            method,
            search: new URLSearchParams({ conversation_id: 'conv-ana' }),
            readBody: async () => {
                reads.push(`${method} ${route}`);

                return '{"conversation_id":"conv-ana"}';
            },
        });

    for (const route of ROUTES) {
        assert.equal((await read(route, 'OPTIONS')).refusal, 'options', route);
    }

    for (const method of ['GET', 'HEAD']) {
        assert.equal((await read('turn', method)).refusal, 'method_not_allowed', method);
    }

    assert.equal((await read('state', 'HEAD')).refusal, 'method_not_allowed');

    assert.equal((await read('state', 'POST')).refusal, 'method_not_allowed');
    assert.deepEqual(reads, []);
});

// A turn reads the owner, then spends its prompt, then claims: a caller the
// owner refuses spends nothing, a turn the allowance refuses claims nothing,
// and a claim lost to another account refuses a turn already paid for, so
// the proxy gives that prompt back.
test('checkStudioOwner claims a conversation only for a turn its prompt admits', async () => {
    const steps: string[] = [];
    const turn = ({
        owners = [],
        spendRefusal = null,
        claimed,
    }: {
        owners?: string[];
        spendRefusal?: string | null;
        claimed?: string;
    }) =>
        checkStudioOwner({
            route: 'turn',
            conversationId: 'conv-new',
            readUserId: async () => 'user-ben',
            ownersOf: async () => {
                steps.push('read');

                return owners;
            },
            claimOwner: async (_id, userId) => {
                steps.push('claim');

                return [claimed ?? userId];
            },
            spend: async () => {
                steps.push('spend');

                return spendRefusal;
            },
            refuse: (refusal): string => refusal,
        });

    assert.equal(await turn({ owners: ['user-ana'] }), 'not_found');
    assert.deepEqual(steps.splice(0), ['read']);

    assert.equal(await turn({ spendRefusal: 'resource_exhausted' }), 'resource_exhausted');
    assert.deepEqual(steps.splice(0), ['read', 'spend']);

    assert.equal(await turn({ claimed: 'user-ana' }), 'not_found');
    assert.deepEqual(steps.splice(0), ['read', 'spend', 'claim']);

    assert.equal(await turn({}), null);
    assert.deepEqual(steps.splice(0), ['read', 'spend', 'claim']);

    // The caller's own conversation needs no claim.
    assert.equal(await turn({ owners: ['user-ben'] }), null);
    assert.deepEqual(steps.splice(0), ['read', 'spend']);
});

// An owner read that answers after the timeout refused the call claims
// nothing.
test('checkStudioOwner claims nothing after its owner read times out', async () => {
    const claims: string[] = [];
    let answer: (owners: string[]) => void = () => {};
    const refusal = await checkStudioOwner({
        route: 'turn',
        conversationId: 'conv-new',
        readUserId: async () => 'user-ana',
        ownersOf: () =>
            new Promise<string[]>((resolve) => {
                answer = resolve;
            }),
        claimOwner: async (_id, userId) => {
            claims.push(userId);

            return [userId];
        },
        refuse: (ownerRefusal) => ownerRefusal,
        timeoutMs: 10,
    });

    assert.equal(refusal, 'unavailable');

    answer([]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.deepEqual(claims, []);
});
