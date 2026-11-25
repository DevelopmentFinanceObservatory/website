/**
 * `access.ts`: the decision for a call to the platform proxy, with a fake
 * limiter and key verifier so the order of counts and lookups can be seen.
 * An anonymous call is counted by address as before; a call with a key on
 * the API or the Datasets API is checked for its signed tag, then counted against its account and
 * against its own daily quota, and never its address. Only a key with a good
 * tag that the store does not hold is counted against the address. A key on
 * any other surface, /mcp included, is ignored. While visitor limits are on,
 * an anonymous API or Datasets API call is counted per visitor and on its
 * address's backstop when it carries a valid visitor token, and per address
 * at the cookieless allowance when it does not.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

import { hasValidTag, signKey } from '../../auth/keyTag.ts';
import type { AccessDeps, AnonymousLimits } from '../access.ts';
import type { KeyVerdict, KeyVerifier, ValidKey } from '../keyVerifier.ts';
import type { RateVerdict } from '../rateHeaders.ts';
import type { Surface } from '../rateLimit.ts';

const { decideAccess } = await import('../access.ts');

const SECRET = 'a-key-tag-secret-for-the-tests-0000';
const KEY = signKey(`dfo_k_${'a'.repeat(32)}`, [SECRET]);
// The right shape and checksum, but a tag no secret of ours made.
const FORGED = signKey(`dfo_k_${'a'.repeat(32)}`, ['a-secret-that-is-not-one-of-ours-00']);
const VALID: ValidKey = {
    kind: 'valid',
    keyId: 'key-1',
    accountId: 'acct-1',
    rateLimit: null,
    accountDailyLimit: null,
    dailyLimit: null,
    expiresAt: null,
};

const verdict = (limit: number, used: number): RateVerdict => ({
    allowed: used <= limit,
    limit,
    remaining: Math.max(0, limit - used),
    reset: 30,
});

const LIMITS: AnonymousLimits = {
    address: { api: 120, datasets: 300, pin: 10, mcp: 300 },
    cookieless: { api: 60, datasets: 300 },
    backstop: { api: 240, datasets: 600 },
};

// A world of fakes: `answer` is what the key store says, `cached` whether the
// cache already holds it, `used` how many calls each counter already has.
const world = ({
    answer = VALID as KeyVerdict,
    cached = false,
    addressUsed = 0,
    accountUsed = 0,
    dailyUsed = 0,
    capUsed = 0,
    defaultLimit = 600,
    defaultDailyLimit = 1000,
    visitorLimits = false,
    visitorId = null,
    visitorUsed = 0,
    backstopUsed = 0,
}: {
    answer?: KeyVerdict;
    cached?: boolean;
    addressUsed?: number;
    accountUsed?: number;
    dailyUsed?: number;
    capUsed?: number;
    defaultLimit?: number;
    defaultDailyLimit?: number;
    visitorLimits?: boolean;
    visitorId?: string | null;
    visitorUsed?: number;
    backstopUsed?: number;
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
        tagValid: (key) => hasValidTag(key, [SECRET]),
        defaultLimit,
        defaultDailyLimit,
        hitAddress: async (surface, ip, limit) => {
            calls.push(`address:${surface}:${ip}`);

            return verdict(limit, addressUsed + 1);
        },
        hitVisitor: async (surface, id, limit) => {
            calls.push(`visitor:${surface}:${id}:${limit}`);

            return verdict(limit, visitorUsed + 1);
        },
        hitBackstop: async (surface, ip, limit) => {
            calls.push(`backstop:${surface}:${ip}:${limit}`);

            return verdict(limit, backstopUsed + 1);
        },
        anonymousLimits: LIMITS,
        visitorLimits: () => visitorLimits,
        visitor: () => visitorId,
        hitAccount: async (surface, accountId, limit) => {
            calls.push(`account:${surface}:${accountId}:${limit}`);

            return verdict(limit, accountUsed + 1);
        },
        hitDaily: async (counterKey, limit) => {
            calls.push(`daily:${counterKey}:${limit}`);

            return verdict(
                limit,
                (counterKey.startsWith('apiday:user:') ? dailyUsed : capUsed) + 1,
            );
        },
        refundDaily: async (counterKey) => {
            calls.push(`refund:${counterKey}`);
        },
    };

    return { calls, deps };
};

const decide = (
    deps: AccessDeps,
    headers: Record<string, string> = {},
    options: { surface?: Surface; keys?: boolean } = {},
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

    assert.deepEqual(calls, ['cache', 'account:api:acct-1:600', 'daily:apiday:user:acct-1:1000']);
    assert.deepEqual(access.identity, { kind: 'keyed', keyId: 'key-1', accountId: 'acct-1' });
    assert.equal(access.outcome, 'allowed');
    assert.equal(access.verdict?.limit, 600);
    assert.equal(access.verdict?.remaining, 599);
});

test('an account with a limit of its own is counted at that limit', async () => {
    const { calls, deps } = world({ cached: true, answer: { ...VALID, rateLimit: 200 } });

    await decide(deps, { 'x-api-key': KEY });

    assert.deepEqual(calls, ['cache', 'account:api:acct-1:200', 'daily:apiday:user:acct-1:1000']);
});

test('a key on the datasets surface is counted against the account there', async () => {
    const { calls, deps } = world({ cached: true });
    const access = await decide(deps, { 'x-api-key': KEY }, { surface: 'datasets' });

    assert.equal(access.outcome, 'allowed');
    assert.deepEqual(calls, [
        'cache',
        'account:datasets:acct-1:600',
        'daily:apiday:user:acct-1:1000',
    ]);
});

test('a key on mcp or pin is anonymous, counted by address, never looked up', async () => {
    for (const surface of ['mcp', 'pin'] as const) {
        const { calls, deps } = world({ cached: true });
        const access = await decide(deps, { 'x-api-key': KEY }, { surface });

        assert.deepEqual(calls, [`address:${surface}:203.0.113.7`]);
        assert.deepEqual(access.identity, { kind: 'anonymous' });
        assert.equal(access.outcome, undefined);
        assert.equal(access.refusal, undefined);
    }
});

test("the daily quota is the account's: its own, else the default, whichever key calls", async () => {
    const own = world({ cached: true, answer: { ...VALID, accountDailyLimit: 5000 } });
    const plain = world({ cached: true, defaultDailyLimit: 7 });
    const another = world({ cached: true, answer: { ...VALID, keyId: 'key-2' } });

    await decide(own.deps, { 'x-api-key': KEY });
    await decide(plain.deps, { 'x-api-key': KEY });
    await decide(another.deps, { 'x-api-key': KEY });

    assert.equal(own.calls.at(-1), 'daily:apiday:user:acct-1:5000');
    assert.equal(plain.calls.at(-1), 'daily:apiday:user:acct-1:7');
    assert.equal(another.calls.at(-1), 'daily:apiday:user:acct-1:1000');
});

test("a key's own cap is counted before the account's quota, which a refused call leaves alone", async () => {
    const capped = world({ cached: true, answer: { ...VALID, dailyLimit: 50 }, capUsed: 50 });
    const access = await decide(capped.deps, { 'x-api-key': KEY });

    assert.deepEqual(capped.calls, [
        'cache',
        'account:api:acct-1:600',
        'daily:apiday:key:key-1:50',
    ]);
    assert.equal(access.refusal?.status, 429);
    assert.equal((await access.refusal!.json()).code, 'allowance_exhausted');
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '50');

    // A call the cap admits goes on to the account's quota, which can still
    // refuse it, and then gives its hit on the cap back.
    const spent = world({ cached: true, answer: { ...VALID, dailyLimit: 50 }, dailyUsed: 1000 });
    const refused = await decide(spent.deps, { 'x-api-key': KEY });

    assert.deepEqual(spent.calls, [
        'cache',
        'account:api:acct-1:600',
        'daily:apiday:key:key-1:50',
        'daily:apiday:user:acct-1:1000',
        'refund:apiday:key:key-1',
    ]);
    assert.equal(refused.refusal?.headers.get('x-ratelimit-limit'), '1000');
});

test('an allowed keyed call reports the per-minute verdict, not the daily one', async () => {
    const { deps } = world({ cached: true, dailyUsed: 10 });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.outcome, 'allowed');
    assert.equal(access.verdict?.limit, 600);
    assert.equal(access.verdict?.remaining, 599);
});

test('an account past its daily quota is a 429 that reports the quota', async () => {
    const { calls, deps } = world({ cached: true, dailyUsed: 1000 });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal?.status, 429);
    assert.equal(access.outcome, 'limited');
    assert.equal((await access.refusal!.json()).code, 'allowance_exhausted');
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '1000');
    assert.equal(access.refusal?.headers.get('x-ratelimit-remaining'), '0');
    assert.equal(access.refusal?.headers.get('retry-after'), '30');
    assert.equal(access.verdict?.limit, 1000);
    assert.deepEqual(access.identity, { kind: 'keyed', keyId: 'key-1', accountId: 'acct-1' });
    assert.deepEqual(calls, ['cache', 'account:api:acct-1:600', 'daily:apiday:user:acct-1:1000']);
});

test('a call over the per-minute account limit is refused before the daily quota is counted', async () => {
    const { calls, deps } = world({ cached: true, accountUsed: 600, dailyUsed: 1000 });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '600');
    assert.deepEqual(calls, ['cache', 'account:api:acct-1:600']);
});

test('a key not in the cache is looked up and counted against its account, not its address', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.deepEqual(calls, [
        'cache',
        'lookup',
        'account:api:acct-1:600',
        'daily:apiday:user:acct-1:1000',
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
    assert.equal((await access.refusal!.json()).code, 'rate_limited');
    assert.equal(access.refusal?.headers.get('retry-after'), '30');
    assert.deepEqual(access.identity, { kind: 'keyed', keyId: 'key-1', accountId: 'acct-1' });
});

test('a valid key from an address past its anonymous limit is served on a cache miss', async () => {
    // Claude connectors share Anthropic's addresses: a busy address must not
    // hold back a keyed caller each time the cache entry lapses.
    const { calls, deps } = world({ addressUsed: 120 });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal, undefined);
    assert.equal(access.outcome, 'allowed');
    assert.deepEqual(calls, [
        'cache',
        'lookup',
        'account:api:acct-1:600',
        'daily:apiday:user:acct-1:1000',
    ]);
});

test('a key with a bad tag is a 401 with no lookup and no count', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { authorization: `Bearer ${FORGED}` });

    assert.equal(access.refusal?.status, 401);
    assert.equal((await access.refusal!.json()).code, 'invalid_api_key');
    assert.equal(access.outcome, 'forged');
    assert.deepEqual(access.identity, { kind: 'anonymous' });
    assert.deepEqual(calls, []);
});

test('an untagged key of the old form is refused as forged', async () => {
    const { calls, deps } = world();
    const access = await decide(deps, { 'x-api-key': `dfo_k_${'a'.repeat(32)}` });

    assert.equal(access.outcome, 'forged');
    assert.deepEqual(calls, []);
});

test('a key with a good tag that the store lacks, from an address past its limit, is a 429', async () => {
    const { calls, deps } = world({ answer: { kind: 'invalid' }, addressUsed: 120 });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal?.status, 429);
    assert.equal(access.outcome, 'limited');
    assert.deepEqual(calls, ['cache', 'lookup', 'address:api:203.0.113.7']);
    assert.equal((await access.refusal!.json()).code, 'rate_limited');
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '120');
});

test('an invalid key is a 401 problem document and does not fall back to anonymous', async () => {
    const { calls, deps } = world({ answer: { kind: 'invalid' } });
    const access = await decide(deps, { authorization: `Bearer ${KEY}` });

    assert.equal(access.refusal?.status, 401);
    assert.equal(access.refusal?.headers.get('content-type'), 'application/problem+json');
    const body = await access.refusal!.json();
    assert.equal(body.code, 'invalid_api_key');
    assert.equal(body.type, '/codes/invalid_api_key');
    assert.equal(access.outcome, 'invalid');
    assert.deepEqual(access.identity, { kind: 'anonymous' });
    // A deleted key keeps a good tag, so a miss costs its address a call;
    // no account count, and the 401 carries no limit headers.
    assert.deepEqual(calls, ['cache', 'lookup', 'address:api:203.0.113.7']);
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), null);
});

test('an unavailable key store lets the call through as anonymous, counted by address', async () => {
    const { calls, deps } = world({ answer: { kind: 'unavailable' } });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.refusal, undefined);
    assert.equal(access.outcome, 'unavailable');
    assert.deepEqual(access.identity, { kind: 'anonymous' });
    assert.equal(access.verdict?.limit, 120);
    assert.deepEqual(calls, ['cache', 'lookup', 'address:api:203.0.113.7']);
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

test("with visitor limits off, an anonymous call is counted by address at today's limits, token or not", async () => {
    for (const [surface, limit] of [
        ['api', 120],
        ['datasets', 300],
    ] as const) {
        const { calls, deps } = world({ visitorId: 'v-1' });
        const access = await decide(deps, {}, { surface });

        assert.deepEqual(calls, [`address:${surface}:203.0.113.7`]);
        assert.equal(access.verdict?.limit, limit);
        assert.equal(access.tier, 'address');
    }

    const { deps } = world({ addressUsed: 120 });
    const refused = await decide(deps);

    assert.equal(refused.refusal?.status, 429);
    assert.ok(!(await refused.refusal!.json()).detail.includes('/docs/build/api-keys'));
});

test('a call with a valid visitor token is counted per visitor, then on the address backstop', async () => {
    for (const [surface, own, backstop] of [
        ['api', 120, 240],
        ['datasets', 300, 600],
    ] as const) {
        const { calls, deps } = world({ visitorLimits: true, visitorId: 'v-1' });
        const access = await decide(deps, {}, { surface });

        assert.deepEqual(calls, [
            `visitor:${surface}:v-1:${own}`,
            `backstop:${surface}:203.0.113.7:${backstop}`,
        ]);
        assert.deepEqual(access.identity, { kind: 'anonymous' });
        assert.equal(access.refusal, undefined);
        assert.equal(access.verdict?.limit, own);
        assert.equal(access.tier, 'visitor');
    }
});

test('a visitor over its limit is a 429 that spends nothing on the backstop', async () => {
    const { calls, deps } = world({ visitorLimits: true, visitorId: 'v-1', visitorUsed: 120 });
    const access = await decide(deps);

    assert.deepEqual(calls, ['visitor:api:v-1:120']);
    assert.equal(access.refusal?.status, 429);
    assert.equal((await access.refusal!.json()).code, 'rate_limited');
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '120');
    assert.equal(access.refusal?.headers.get('x-dfo-limit-tier'), 'visitor');
});

test('ten visitors from one address meet the address backstop', async () => {
    const counts = new Map<string, number>();
    const count = async (counter: string, limit: number) => {
        const used = (counts.get(counter) ?? 0) + 1;

        counts.set(counter, used);

        return verdict(limit, used);
    };
    const { deps } = world({ visitorLimits: true });
    let visitorId = '';

    deps.visitor = () => visitorId;
    deps.hitVisitor = (surface, id, limit) => count(`visitor:${id}`, limit);
    deps.hitBackstop = (surface, ip, limit) => count(`backstop:${ip}`, limit);

    const statuses: number[] = [];

    // Thirty calls each, every one within its own allowance of 120.
    for (let call = 0; call < 30; call++) {
        for (let visitor = 0; visitor < 10; visitor++) {
            visitorId = `v-${visitor}`;
            statuses.push((await decide(deps)).refusal?.status ?? 200);
        }
    }

    assert.equal(statuses.filter((status) => status === 200).length, 240);
    assert.deepEqual(statuses.slice(240), Array(60).fill(429));
});

test('a backstop refusal reports the backstop', async () => {
    const { deps } = world({ visitorLimits: true, visitorId: 'v-1', backstopUsed: 240 });
    const access = await decide(deps);

    assert.equal(access.refusal?.status, 429);
    assert.equal(access.refusal?.headers.get('x-ratelimit-limit'), '240');
    assert.equal(access.tier, 'visitor');
});

test('a call with no valid visitor token is counted by address at the cookieless allowance', async () => {
    for (const [surface, limit] of [
        ['api', 60],
        ['datasets', 300],
    ] as const) {
        const { calls, deps } = world({ visitorLimits: true });
        const access = await decide(deps, {}, { surface });

        assert.deepEqual(calls, [`address:${surface}:203.0.113.7`]);
        assert.equal(access.verdict?.limit, limit);
        assert.equal(access.tier, 'address');
    }
});

test('a cookieless API 429 names what a free API key gives; with keys off or on datasets it does not', async () => {
    const hint = async (options: { surface?: Surface; keys?: boolean }) => {
        const { deps } = world({ visitorLimits: true, addressUsed: 300, defaultLimit: 600 });
        const access = await decide(deps, {}, options);
        const document = await access.refusal!.json();

        assert.equal(access.refusal?.status, 429);
        assert.equal(document.code, 'rate_limited');
        assert.equal(document.retryable, true);
        assert.equal(access.refusal?.headers.get('x-dfo-limit-tier'), 'address');

        return document.detail.includes('/docs/build/api-keys');
    };

    assert.equal(await hint({}), true);
    assert.equal(await hint({ keys: false }), false);
    assert.equal(await hint({ surface: 'datasets' }), false);
});

test("mcp and pin are counted by address at today's limits with visitor limits on", async () => {
    for (const [surface, limit] of [
        ['mcp', 300],
        ['pin', 10],
    ] as const) {
        const { calls, deps } = world({ visitorLimits: true, visitorId: 'v-1' });
        const access = await decide(deps, {}, { surface });

        assert.deepEqual(calls, [`address:${surface}:203.0.113.7`]);
        assert.equal(access.verdict?.limit, limit);
    }
});

test('a keyed call is counted as tier key, whatever visitor token it carries', async () => {
    const { calls, deps } = world({ cached: true, visitorLimits: true, visitorId: 'v-1' });
    const access = await decide(deps, { 'x-api-key': KEY });

    assert.equal(access.tier, 'key');
    assert.ok(calls.every((entry) => !entry.startsWith('visitor:')));
});
