/**
 * `access.ts`: the decision for a call to the platform proxy, with a fake
 * limiter and key verifier so the order of counts and lookups can be seen.
 * An anonymous call is counted by address as before; a call with a key is
 * counted against its account, after the address when the key was not in
 * the cache.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AccessDeps } from '../access.ts';
import type { KeyVerdict, KeyVerifier, ValidKey } from '../keyVerifier.ts';
import type { RateVerdict } from '../rateHeaders.ts';

const { decideAccess } = await import('../access.ts');

const KEY = `dfo_live_${'a'.repeat(32)}`;
const VALID: ValidKey = {
    kind: 'valid',
    keyId: 'key-1',
    accountId: 'acct-1',
    rateLimit: null,
    expiresAt: null,
};

const verdict = (limit: number, used: number): RateVerdict => ({
    allowed: used <= limit,
    counted: true,
    limit,
    remaining: Math.max(0, limit - used),
    reset: 30,
});

// A world of fakes: `answer` is what the key store says, `cached` whether the
// cache already holds it, `used` how many calls each counter already has.
const world = ({
    answer = VALID as KeyVerdict,
    cached = false,
    addressUsed = 0,
    accountUsed = 0,
    defaultLimit = 600,
    addressLimit = 120,
}: {
    answer?: KeyVerdict;
    cached?: boolean;
    addressUsed?: number;
    accountUsed?: number;
    defaultLimit?: number;
    addressLimit?: number;
} = {}) => {
    const calls: string[] = [];
    const verifier: KeyVerifier = {
        cacheSize: () => 0,
        cachedValid: async () => {
            calls.push('cache');

            return cached && answer.kind === 'valid' ? answer : undefined;
        },
        verify: async () => {
            calls.push('lookup');

            return answer;
        },
    };
    const deps: AccessDeps = {
        verifier,
        defaultLimit,
        hitAddress: async (surface, ip) => {
            calls.push(`address:${surface}:${ip}`);

            return verdict(addressLimit, addressUsed + 1);
        },
        hitAccount: async (surface, accountId, limit) => {
            calls.push(`account:${surface}:${accountId}:${limit}`);

            return verdict(limit, accountUsed + 1);
        },
    };

    return { calls, deps };
};

const decide = (
    deps: AccessDeps,
    headers: Record<string, string> = {},
    options: { surface?: 'api' | 'mcp'; keys?: boolean } = {},
) =>
    decideAccess(deps, {
        surface: 'surface' in options ? options.surface : 'api',
        keys: options.keys ?? true,
        headers: new Headers(headers),
        ip: '203.0.113.7',
    });

test('a call with no key is counted against its address, as before', async () => {
    const { calls, deps } = world();
    const access = await decide(deps);

    assert.deepEqual(calls, ['address:api:203.0.113.7']);
    assert.deepEqual(access.identity, { kind: 'anonymous' });
    assert.equal(access.refusal, undefined);
    assert.equal(access.outcome, undefined);
    assert.equal(access.verdict?.limit, 120);
});

test('an anonymous call over the address limit is a 429', async () => {
    const { deps } = world({ addressUsed: 120 });
    const access = await decide(deps);

    assert.equal(access.refusal?.status, 429);
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '120');
    assert.equal(access.refusal?.headers.get('retry-after'), '30');
});

test('a call on a surface with no limit is neither counted nor looked up', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { 'x-api-key': KEY }, { surface: undefined });

    assert.deepEqual(calls, []);
    assert.equal(access.refusal, undefined);
    assert.equal(access.verdict, undefined);
});

test('a key on a call that ignores keys is ignored: anonymous, counted by address', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { 'x-api-key': 'nonsense' }, { keys: false });

    assert.deepEqual(calls, ['address:api:203.0.113.7']);
    assert.deepEqual(access.identity, { kind: 'anonymous' });
    assert.equal(access.refusal, undefined);
});

test('a valid key in the cache is counted against its account alone, at the default limit', async () => {
    const { calls, deps } = world({ cached: true });
    const access = await decide(deps, { authorization: `Bearer ${KEY}` });

    assert.deepEqual(calls, ['cache', 'account:api:acct-1:600']);
    assert.deepEqual(access.identity, { kind: 'keyed', keyId: 'key-1', accountId: 'acct-1' });
    assert.equal(access.outcome, 'allowed');
    assert.equal(access.verdict?.limit, 600);
    assert.equal(access.verdict?.remaining, 599);
});

test('an account with a limit of its own is counted at that limit, on each surface apart', async () => {
    const { calls, deps } = world({ cached: true, answer: { ...VALID, rateLimit: 200 } });

    await decide(deps, { 'x-api-key': KEY }, { surface: 'api' });
    await decide(deps, { 'x-api-key': KEY }, { surface: 'mcp' });

    assert.deepEqual(
        calls.filter((call) => call.startsWith('account')),
        ['account:api:acct-1:200', 'account:mcp:acct-1:200'],
    );
});

test('a key not in the cache is counted against the address first, then looked up, then the account', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.deepEqual(calls, [
        'cache',
        'address:api:203.0.113.7',
        'lookup',
        'account:api:acct-1:600',
    ]);
    assert.equal(access.outcome, 'allowed');
    // The headers describe the account's allowance, not the address's.
    assert.equal(access.verdict?.limit, 600);
});

test('an account past its limit is a 429 that names the account', async () => {
    const { deps } = world({ cached: true, accountUsed: 600 });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal?.status, 429);
    assert.equal(access.outcome, 'limited');
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '600');
    assert.match((await access.refusal!.json()).detail, /per account/);
    assert.deepEqual(access.identity, { kind: 'keyed', keyId: 'key-1', accountId: 'acct-1' });
});

test('an address past its limit is refused before any lookup', async () => {
    const { calls, deps } = world({ addressUsed: 120 });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal?.status, 429);
    assert.equal(access.outcome, 'limited');
    assert.deepEqual(calls, ['cache', 'address:api:203.0.113.7']);
    assert.match((await access.refusal!.json()).detail, /per address/);
});

test('an invalid key is a 401 problem document and does not fall back to anonymous', async () => {
    const { calls, deps } = world({ answer: { kind: 'invalid' } });
    const access = await decide(deps, { authorization: `Bearer ${KEY}` });

    assert.equal(access.refusal?.status, 401);
    assert.equal(access.refusal?.headers.get('content-type'), 'application/problem+json');
    assert.equal((await access.refusal!.json()).code, 'invalid_api_key');
    assert.equal(access.outcome, 'invalid');
    assert.deepEqual(access.identity, { kind: 'anonymous' });
    // No account count, and the 401 carries no limit headers.
    assert.deepEqual(calls, ['cache', 'address:api:203.0.113.7', 'lookup']);
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), null);
});

test('an unavailable key store lets the call through as anonymous on the address count already made', async () => {
    const { calls, deps } = world({ answer: { kind: 'unavailable' } });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal, undefined);
    assert.equal(access.outcome, 'unavailable');
    assert.deepEqual(access.identity, { kind: 'anonymous' });
    assert.equal(access.verdict?.limit, 120);
    assert.deepEqual(calls, ['cache', 'address:api:203.0.113.7', 'lookup']);
});

test('two different keys are a 400 before anything is counted', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, {
        authorization: `Bearer ${KEY}`,
        'x-api-key': `${KEY}x`,
    });

    assert.equal(access.refusal?.status, 400);
    assert.equal((await access.refusal!.json()).code, 'request_invalid');
    assert.deepEqual(calls, []);
});

test('an over-long key is a 401 with no lookup and no count', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { 'x-api-key': `dfo_${'x'.repeat(200)}` });

    assert.equal(access.refusal?.status, 401);
    assert.equal(access.outcome, 'invalid');
    assert.deepEqual(calls, []);
});

test('a bearer that is not one of our keys is no key: anonymous, no lookup', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { authorization: 'Bearer harness-token' });

    assert.deepEqual(calls, ['address:api:203.0.113.7']);
    assert.equal(access.outcome, undefined);
});
