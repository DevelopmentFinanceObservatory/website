/**
 * `forward()` with API keys and visitor tokens, honoured on the API and the Datasets API: what reaches the upstream
 * (never the key, the caller named as `user:` for an account), what a bad,
 * unavailable or ignored key does, a key on /mcp, the Studio and the kill
 * switch, the usage line, and the whole flow, the daily quota included, on a
 * real key store and counter.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test, { mock } from 'node:test';

import { defaultKeyHasher } from '@better-auth/api-key';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NextRequest } from 'next/server';

import { applyMigrations } from '../../../../db/apply-migrations.ts';
import { buildCounterPool, buildKeyPool } from '../../../../db/connection.ts';
import * as schema from '../../../../db/schema.ts';
import { createTestDatabase } from '../../../../db/test/harness.ts';
import { signKey } from '../../auth/keyTag.ts';
import type { AccessDeps } from '../access.ts';
import type { KeyVerdict } from '../keyVerifier.ts';
import type { RateVerdict } from '../rateHeaders.ts';

// caller.ts and rateLimit.ts read these at import.
process.env.CALLER_HMAC_KEY = 'test-hmac-key';
process.env.DFO_CALLER_PRINCIPAL = 'test-principal';
process.env.TRUSTED_PROXY_HOPS = '0';
// Read per call by forward's tag check.
const SECRET = 'a-key-tag-secret-for-the-tests-0000';
process.env.API_KEY_TAG_SECRETS = SECRET;

const { forward, accessDeps } = await import('../forward.ts');
const { createKeyVerifier } = await import('../keyVerifier.ts');
const {
    createLimiter,
    ADDRESS_DAILY_LIMITS,
    ANONYMOUS_DAILY_LIMITS,
    BACKSTOP_LIMITS,
    COOKIELESS_LIMITS,
    LIMITS,
} = await import('../rateLimit.ts');
const { mintVisitorToken, visitorKey, VISITOR_TOKEN_TTL } = await import('../visitor.ts');

// A `dfo_v` cookie signed under `callerKey`, minted at `now`.
const visitorCookie = (now = Date.now(), callerKey = 'test-hmac-key'): string =>
    `dfo_v=${mintVisitorToken(visitorKey(callerKey), now)}`;

const KEY = signKey(`dfo_k_${'k'.repeat(32)}`, [SECRET]);
// The right shape and checksum, but a tag no secret of ours made.
const FORGED = signKey(`dfo_k_${'k'.repeat(32)}`, ['a-secret-that-is-not-one-of-ours-00']);
const ACCOUNT = 'acct-1';
const accountCaller = `user:${createHmac('sha256', 'test-hmac-key')
    .update(`user:${ACCOUNT}`)
    .digest('hex')
    .slice(0, 32)}`;
// The daily counts a cookieless API call from the test address spends: its
// own, then the address ceiling.
const ANON_DAY = ['daily:anonday:api:cookieless:203.0.113.7', 'daily:anonday:api:addr:203.0.113.7'];
const addressCaller = `ip:${createHmac('sha256', 'test-hmac-key')
    .update('203.0.113.7')
    .digest('hex')
    .slice(0, 32)}`;

// What dfo-apis sends on many API routes: any cache may keep the answer.
const PUBLIC_CACHE = 'public, max-age=300';

// What the upstream saw of each call. /public answers with PUBLIC_CACHE and
// varies on Origin.
const seen: IncomingHttpHeaders[] = [];
const upstream = createServer((req, res) => {
    seen.push(req.headers);
    res.writeHead(200, {
        'content-type': 'application/json',
        ...(req.url === '/public' ? { 'cache-control': PUBLIC_CACHE, vary: 'Origin' } : {}),
    }).end('{}');
});

upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
test.after(() => {
    upstream.closeAllConnections();
    upstream.close();
});

const base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

// The target is dfo-apis's origin, so the call is named as dfo-apis is.
process.env.SEARCH_API_BASE = base;

type Options = Partial<Parameters<typeof forward>[1]>;

const call = (headers: Record<string, string> = {}, options: Options = {}): Promise<Response> =>
    forward(
        new Request('http://site.test/api/v1/search/x', {
            headers: { 'x-forwarded-for': '203.0.113.7', ...headers },
        }) as NextRequest,
        { surface: 'api', target: `${base}/x`, unreachable: 'unreachable', ...options },
    );

const original = { ...accessDeps };
const fakes = (answer: KeyVerdict, cached = false) => {
    const log: string[] = [];

    accessDeps.verifier = {
        cacheSize: () => 0,
        cachedValid: async () => {
            log.push('cache');

            return cached && answer.kind === 'valid' ? answer : undefined;
        },
        verify: async () => {
            log.push('lookup');

            return answer;
        },
    };
    accessDeps.hitAddress = async (surface) => {
        log.push(`address:${surface}`);

        return verdictOf(120);
    };
    accessDeps.admit = admitLogging(log, false);
    accessDeps.hitAccount = async (surface, accountId, limit) => {
        log.push(`account:${surface}:${accountId}`);

        return verdictOf(limit);
    };
    accessDeps.hitDaily = async (counterKey, limit) => {
        log.push(`daily:${counterKey}`);

        return verdictOf(limit);
    };

    return log;
};
// An admit that lets every call through and logs the counts of its plan:
// the call's own per-minute count, the address's backstop, its own daily
// count and the address's daily ceiling, with each limit when `limits`.
const admitLogging =
    (log: string[], limits: boolean): AccessDeps['admit'] =>
    async (plan) => {
        const [surface, kind] = plan.minute.key.split(':');
        const own = kind === 'visitor' || kind === 'cookieless' ? kind : 'address';
        const at = (limit: number) => (limits ? `:${limit}` : '');

        log.push(`${own}:${surface}${at(plan.minute.limit)}`);

        if (plan.backstop) {
            log.push(`backstop:${surface}${at(plan.backstop.limit)}`);
        }

        for (const counter of [plan.day, plan.ceiling]) {
            if (counter) {
                log.push(`daily:${counter.key}${at(counter.limit)}`);
            }
        }

        return { refusedBy: null, verdicts: { minute: verdictOf(plan.minute.limit) } };
    };
const verdictOf = (limit: number): RateVerdict => ({
    allowed: true,
    limit,
    remaining: limit - 1,
    reset: 60,
});
const VALID: KeyVerdict = {
    kind: 'valid',
    keyId: 'key-public-1',
    accountId: ACCOUNT,
    rateLimit: null,
    accountDailyLimit: null,
    dailyLimit: null,
    expiresAt: null,
};

// The usage lines forward() writes, kept off the test output.
const lines: string[] = [];

const fresh = () => {
    mock.restoreAll();
    lines.length = 0;
    mock.method(console, 'log', (line: string) => lines.push(line));
    seen.length = 0;
    Object.assign(accessDeps, original);
    delete process.env.API_KEYS_ENABLED;
    delete process.env.VISITOR_LIMITS_ENABLED;
    process.env.CALLER_HMAC_KEY = 'test-hmac-key';
};

// Fakes that record whose count each anonymous call spent, and at what limit.
const tierFakes = () => {
    const log: string[] = [];

    accessDeps.hitAddress = async (surface, _ip, limit) => {
        log.push(`address:${surface}:${limit}`);

        return verdictOf(limit);
    };
    accessDeps.admit = admitLogging(log, true);
    accessDeps.hitDaily = async (counterKey, limit) => {
        log.push(`daily:${counterKey}:${limit}`);

        return verdictOf(limit);
    };

    return log;
};

test.after(() => mock.restoreAll());

test('forward: a key on /mcp is stripped and ignored: anonymous, counted by address, no usage line', async () => {
    fresh();

    for (const answer of [VALID, { kind: 'invalid' } as KeyVerdict]) {
        const log = fakes(answer, true);

        for (const headers of [
            { authorization: `Bearer ${KEY}` },
            { 'x-api-key': KEY },
            { authorization: `Bearer ${KEY}`, 'x-api-key': FORGED },
        ] as Record<string, string>[]) {
            seen.length = 0;

            const res = await call(headers, { surface: 'mcp' });

            assert.equal(res.status, 200);
            assert.equal(res.headers.get('x-ratelimit-limit'), '120');
            assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
            assert.equal(seen[0]!.authorization, undefined);
            assert.equal(seen[0]!['x-api-key'], undefined);
        }

        assert.ok(log.every((entry) => entry === 'address:mcp'));
    }

    assert.deepEqual(lines, []);
});

test('forward: a valid key on the API goes to dfo-apis as the account, with no key in sight', async () => {
    fresh();
    fakes(VALID);

    for (const headers of [
        { authorization: `Bearer ${KEY}` },
        { 'x-api-key': KEY },
        { authorization: `Bearer ${KEY}`, 'x-api-key': KEY },
    ] as Record<string, string>[]) {
        seen.length = 0;

        const res = await call(headers);

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-ratelimit-limit'), '600');
        assert.equal(seen[0]!['x-dfo-caller'], accountCaller);
        assert.equal(seen[0]!['x-dfo-caller-principal'], 'test-principal');
        assert.equal(seen[0]!.authorization, undefined);
        assert.equal(seen[0]!['x-api-key'], undefined);
    }
});

test('forward: a key on the Datasets API counts against the account and its daily quota, and a revoked one is refused', async () => {
    fresh();

    const log = fakes(VALID);
    const res = await call({ 'x-api-key': KEY }, { surface: 'datasets' });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-ratelimit-limit'), '600');
    assert.deepEqual(log, [
        'cache',
        'lookup',
        `account:datasets:${ACCOUNT}`,
        `daily:apiday:user:${ACCOUNT}`,
    ]);
    assert.equal(seen[0]!['x-dfo-caller'], accountCaller);
    assert.equal(seen[0]!['x-api-key'], undefined);

    fresh();
    seen.length = 0;
    fakes({ kind: 'invalid' });

    const revoked = await call({ authorization: `Bearer ${KEY}` }, { surface: 'datasets' });

    assert.equal(revoked.status, 401);
    assert.equal((await revoked.json()).code, 'invalid_api_key');
    // The call was counted on its address, so the 401 carries the tier and its count.
    assert.equal(revoked.headers.get('x-dfo-limit-tier'), 'address');
    assert.ok(revoked.headers.has('x-ratelimit-limit'));
    assert.equal(revoked.headers.get('cache-control'), 'private, no-store');
    assert.equal(seen.length, 0);
});

test('forward: a keyed answer is private and no-store with its rate headers, whatever the upstream allows', async () => {
    fresh();
    fakes(VALID);

    for (const headers of [
        { 'x-api-key': KEY },
        { authorization: `Bearer ${KEY}` },
        // Not a key, but a credential all the same.
        { authorization: 'Basic dXNlcjpwYXNz' },
    ] as Record<string, string>[]) {
        const res = await call(headers, { target: `${base}/public` });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'private, no-store');
        assert.ok(res.headers.has('x-ratelimit-limit'));
    }
});

test('forward: an anonymous answer a shared cache may keep varies on the credential headers and drops its rate headers', async () => {
    fresh();
    fakes(VALID);

    const res = await call(
        {},
        { target: `${base}/public`, pass: { request: [], response: ['vary'] } },
    );
    const plain = await call({});

    assert.equal(res.headers.get('cache-control'), PUBLIC_CACHE);
    assert.equal(res.headers.get('vary'), 'Origin, Authorization, X-API-Key');
    assert.equal(res.headers.get('x-ratelimit-limit'), null);
    // An answer no shared cache keeps carries its count and no Vary.
    assert.equal(plain.headers.get('cache-control'), 'no-cache');
    assert.equal(plain.headers.get('vary'), null);
    assert.ok(plain.headers.has('x-ratelimit-limit'));
});

test('forward: an unavailable key store goes on as anonymous with the key still stripped', async () => {
    fresh();
    const log = fakes({ kind: 'unavailable' });
    const res = await call({ authorization: `Bearer ${KEY}`, 'x-api-key': KEY });

    assert.equal(res.status, 200);
    assert.deepEqual(log, ['cache', 'lookup', 'cookieless:api', 'backstop:api', ...ANON_DAY]);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
    assert.equal(seen[0]!.authorization, undefined);
    assert.equal(seen[0]!['x-api-key'], undefined);
});

test('forward: an invalid key is a 401 and nothing goes upstream', async () => {
    fresh();
    fakes({ kind: 'invalid' });

    const res = await call({ 'x-api-key': KEY });

    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'invalid_api_key');
    assert.equal(seen.length, 0);
});

test('forward: two different keys are a 400, and an over-long key a 401, with no lookup', async () => {
    fresh();
    const log = fakes(VALID);

    assert.equal(
        (await call({ authorization: `Bearer ${KEY}`, 'x-api-key': `${KEY}2` })).status,
        400,
    );
    assert.equal((await call({ 'x-api-key': `dfo_${'z'.repeat(300)}` })).status, 401);
    assert.deepEqual(log, []);
    assert.equal(seen.length, 0);
});

test('forward: another bearer is no key, and dfo-apis gets no caller Authorization', async () => {
    fresh();
    const log = fakes(VALID);
    const res = await call({ authorization: 'Bearer some-other-token' });

    assert.equal(res.status, 200);
    assert.deepEqual(log, ['cookieless:api', 'backstop:api', ...ANON_DAY]);
    assert.equal(seen[0]!.authorization, undefined);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
});

test('forward: a key in another scheme, or bare, is anonymous and never reaches dfo-apis', async () => {
    for (const authorization of [`Token ${KEY}`, KEY]) {
        fresh();
        const log = fakes(VALID);
        const res = await call({ authorization });

        assert.equal(res.status, 200);
        assert.deepEqual(log, ['cookieless:api', 'backstop:api', ...ANON_DAY]);
        assert.equal(seen[0]!.authorization, undefined);
    }
});

test('forward: a call with no key is anonymous, and a client-sent caller is dropped', async () => {
    fresh();
    const log = fakes(VALID);

    await call({ 'x-dfo-caller': accountCaller });

    assert.deepEqual(log, ['cookieless:api', 'backstop:api', ...ANON_DAY]);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
});

test('forward: /mcp strips a key, names the address to dfo-ai, and the harness token replaces any bearer', async () => {
    fresh();

    const log = fakes(VALID, true);

    const mcp = (headers: Record<string, string>, options: Options = {}) =>
        call(headers, {
            surface: 'mcp',
            target: 'http://127.0.0.1:1/never',
            // As the /mcp route names the caller: by address (requestCaller).
            caller: addressCaller,
            ...options,
        });

    // The target is not dfo-apis here: serve it from a second origin.
    const other = createServer((req, res) => {
        seen.push(req.headers);
        res.writeHead(200).end();
    });

    other.listen(0, '127.0.0.1');
    await once(other, 'listening');

    const target = `http://127.0.0.1:${(other.address() as AddressInfo).port}/mcp/`;

    try {
        // With the harness token held: the key is dropped, the header replaced.
        await mcp({ authorization: `Bearer ${KEY}` }, { target, bearer: 'harness' });
        assert.equal(seen[0]!.authorization, 'Bearer harness');
        assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
        assert.equal(seen[0]!['x-dfo-caller-principal'], undefined);

        // Without it: the key is the proxy's own, so no credential goes on.
        seen.length = 0;
        await mcp({ authorization: `Bearer ${KEY}` }, { target });
        assert.equal(seen[0]!.authorization, undefined);
        assert.equal(seen[0]!['x-api-key'], undefined);
        assert.equal(seen[0]!['x-dfo-caller'], addressCaller);

        // Another scheme or a bare key goes no further either.
        for (const authorization of [`Token ${KEY}`, KEY]) {
            seen.length = 0;
            await mcp({ authorization }, { target });
            assert.equal(seen[0]!.authorization, undefined);
        }

        // The key in X-API-Key, the harness token as the bearer: the token
        // goes on, the key does not, and the caller is still the address.
        seen.length = 0;
        await mcp({ authorization: 'Bearer harness-token', 'x-api-key': KEY }, { target });
        assert.equal(seen[0]!.authorization, 'Bearer harness-token');
        assert.equal(seen[0]!['x-api-key'], undefined);
        assert.equal(seen[0]!['x-dfo-caller'], addressCaller);

        // Anonymous callers are named by address, as before.
        seen.length = 0;
        await mcp({}, { target });
        assert.equal(seen[0]!['x-dfo-caller'], addressCaller);

        // No key was looked up or counted against an account on any of them.
        assert.ok(log.every((entry) => entry === 'address:mcp'));
    } finally {
        other.closeAllConnections();
        other.close();
    }
});

test('forward: the Studio strips a key and otherwise ignores it', async () => {
    fresh();
    const log = fakes({ kind: 'invalid' });

    for (const headers of [
        { 'x-api-key': KEY },
        { authorization: `Bearer ${KEY}` },
        { authorization: `Bearer ${KEY}`, 'x-api-key': 'something else' },
    ] as Record<string, string>[]) {
        seen.length = 0;

        const res = await call(headers, {
            counted: { identity: { kind: 'anonymous' }, verdict: verdictOf(120) },
            surface: undefined,
            bearer: 'studio-token',
        });

        assert.equal(res.status, 200);
        assert.equal(seen[0]!.authorization, 'Bearer studio-token');
        assert.equal(seen[0]!['x-api-key'], undefined);
    }

    // Counted once by the Studio proxy itself, never looked up here.
    assert.deepEqual(log, []);
});

test('forward: API_KEYS_ENABLED=false strips keys and treats every call as anonymous', async () => {
    fresh();
    process.env.API_KEYS_ENABLED = 'false';

    const log = fakes({ kind: 'invalid' });
    const res = await call({ authorization: `Bearer ${KEY}`, 'x-api-key': 'junk' });

    assert.equal(res.status, 200);
    assert.deepEqual(log, ['cookieless:api', 'backstop:api', ...ANON_DAY]);
    assert.equal(seen[0]!.authorization, undefined);
    assert.equal(seen[0]!['x-api-key'], undefined);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
});

test('forward: a valid visitor token is counted per visitor, a forged or expired one as cookieless', async () => {
    fresh();

    const log = tierFakes();
    const valid = await call({ cookie: visitorCookie() });

    assert.equal(valid.headers.get('x-dfo-limit-tier'), 'visitor');

    for (const cookie of [
        visitorCookie(Date.now(), 'another-hmac-key'),
        visitorCookie(Date.now() - 2 * VISITOR_TOKEN_TTL * 1000),
    ]) {
        const res = await call({ cookie });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-ratelimit-limit'), String(COOKIELESS_LIMITS.api));
        assert.equal(res.headers.get('x-dfo-limit-tier'), 'address');
    }

    // A visitor spends its own daily count, a cookieless call the address's
    // cookieless one, and both the address ceiling.
    const visitorDay = `daily:anonday:api:visitor:<id>:${ANONYMOUS_DAILY_LIMITS.api}`;
    const cookielessDay = `${ANON_DAY[0]}:${ANONYMOUS_DAILY_LIMITS.api}`;
    const ceiling = `${ANON_DAY[1]}:${ADDRESS_DAILY_LIMITS.api}`;

    assert.deepEqual(
        log.map((entry) => entry.replace(/:visitor:[^:]+:/, ':visitor:<id>:')),
        [
            `visitor:api:${LIMITS.api}`,
            `backstop:api:${BACKSTOP_LIMITS.api}`,
            visitorDay,
            ceiling,
            `cookieless:api:${COOKIELESS_LIMITS.api}`,
            `backstop:api:${BACKSTOP_LIMITS.api}`,
            cookielessDay,
            ceiling,
            `cookieless:api:${COOKIELESS_LIMITS.api}`,
            `backstop:api:${BACKSTOP_LIMITS.api}`,
            cookielessDay,
            ceiling,
        ],
    );
});

for (const [name, visitorLimitsOff] of [
    ['VISITOR_LIMITS_ENABLED=false', () => (process.env.VISITOR_LIMITS_ENABLED = 'false')],
    ['CALLER_HMAC_KEY unset', () => delete process.env.CALLER_HMAC_KEY],
] as const) {
    test(`forward: with ${name}, an anonymous call is counted by address at LIMITS, token or not`, async () => {
        fresh();

        const cookie = visitorCookie();

        visitorLimitsOff();

        const log = tierFakes();

        for (const surface of ['api', 'datasets'] as const) {
            await call({ cookie }, { surface });
            await call({}, { surface });
        }

        // The daily counts run whatever the visitor limits, every call as cookieless.
        const day = (surface: 'api' | 'datasets') => [
            `daily:anonday:${surface}:cookieless:203.0.113.7:${ANONYMOUS_DAILY_LIMITS[surface]}`,
            `daily:anonday:${surface}:addr:203.0.113.7:${ADDRESS_DAILY_LIMITS[surface]}`,
        ];

        assert.deepEqual(log, [
            `address:api:${LIMITS.api}`,
            ...day('api'),
            `address:api:${LIMITS.api}`,
            ...day('api'),
            `address:datasets:${LIMITS.datasets}`,
            ...day('datasets'),
            `address:datasets:${LIMITS.datasets}`,
            ...day('datasets'),
        ]);
        fresh();
    });
}

test('forward: a foreign X-API-Key is anonymous, counted by address, and stripped before the upstream call', async () => {
    fresh();
    fakes(VALID);

    const res = await call({ 'x-api-key': 'another-service-secret' });

    assert.equal(res.status, 200);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
    assert.equal(seen[0]!['x-api-key'], undefined);
    assert.deepEqual(lines, []);
});

test('forward: logs one line per keyed call with the key id, account, surface and outcome, never the key', async () => {
    fresh();
    fakes(VALID);
    await call({ authorization: `Bearer ${KEY}` });

    fakes({ kind: 'invalid' });
    await call({ 'x-api-key': KEY });

    fakes({ kind: 'unavailable' });
    await call({ 'x-api-key': KEY });

    await call({ 'x-api-key': FORGED });

    await call({});

    assert.deepEqual(
        lines.map((line) => JSON.parse(line)),
        [
            {
                severity: 'INFO',
                message: 'api key call',
                surface: 'api',
                outcome: 'allowed',
                keyId: 'key-public-1',
                accountId: ACCOUNT,
            },
            {
                severity: 'INFO',
                message: 'api key call',
                surface: 'api',
                outcome: 'invalid',
                keyId: null,
                accountId: null,
            },
            {
                severity: 'INFO',
                message: 'api key call',
                surface: 'api',
                outcome: 'unavailable',
                keyId: null,
                accountId: null,
            },
            {
                severity: 'INFO',
                message: 'api key call',
                surface: 'api',
                outcome: 'forged',
                keyId: null,
                accountId: null,
            },
        ],
    );
    assert.doesNotMatch(lines.join('\n'), /dfo_k_/);
});

test('forward on a real key store and counter', async (t) => {
    fresh();
    const database = await createTestDatabase();

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: path.resolve(import.meta.dirname, '../../../../db/migrations'),
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const host = process.env.PGHOST ?? 'localhost';
    const port = process.env.PGPORT ?? '5433';
    const env = {
        DATABASE_URL: `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${port}/${database.databaseName}`,
    };
    const keyPool = buildKeyPool(env);
    const counterPool = buildCounterPool(env);

    t.after(async () => {
        await Promise.all([keyPool.end(), counterPool.end()]);
        await database.teardown();
    });

    const limiter = createLimiter(drizzle(counterPool), { windowS: 3600, warn: () => {} });
    const admin = database.adminPool();
    const keys: Record<string, string> = {};

    for (const [id, limit] of [
        ['own', 3],
        ['default', null],
        ['spare', 10],
        ['quota', 10],
        ['capped', 10],
    ] as const) {
        await admin.query(
            `insert into "user" (id, name, email, email_verified, created_at, updated_at, api_rate_limit, api_daily_limit)
             values ($1, $1, $1 || '@a.example', true, now(), now(), $2, $3)`,
            [id, limit, id === 'quota' ? 2 : null],
        );

        keys[id] = signKey(`dfo_k_${id.padEnd(32, 'z')}`, [SECRET]);
        await admin.query(
            `insert into apikey (id, reference_id, key, created_at, updated_at, daily_limit)
             values ($1, $3, $2, now(), now(), $4)`,
            [`key-${id}`, await defaultKeyHasher(keys[id]), id, id === 'capped' ? 1 : null],
        );
    }

    const wire = (verifierPool: Pool) => {
        Object.assign(accessDeps, {
            verifier: createKeyVerifier(drizzle(verifierPool, { schema }), { log: () => {} }),
            hitAddress: (surface: 'api' | 'mcp' | 'pin', ip: string) =>
                limiter.hitKey(surface, ip, { api: 3, mcp: 3, pin: 3 }[surface]),
            admit: limiter.admit,
            anonymousLimits: {
                address: { api: 3, datasets: 3, mcp: 3, pin: 3 },
                cookieless: { api: 3, datasets: 3 },
                backstop: { api: 100, datasets: 100 },
                daily: ANONYMOUS_DAILY_LIMITS,
                dailyAddress: ADDRESS_DAILY_LIMITS,
            },
            hitAccount: (surface: 'api' | 'mcp' | 'pin', accountId: string, limit: number) =>
                limiter.hitKey(surface, `acct:${accountId}`, limit),
            hitDaily: (counterKey: string, limit: number) => limiter.hitDaily(counterKey, limit),
            refundDaily: (counterKey: string) => limiter.refundDaily(counterKey),
            defaultLimit: 5,
            defaultDailyLimit: 1000,
        });
    };

    wire(keyPool);

    await t.test('an account is held to its own limit on the API', async () => {
        const statuses = [];

        for (let i = 0; i < 4; i++) {
            statuses.push((await call({ 'x-api-key': keys.own! })).status);
        }

        assert.deepEqual(statuses, [200, 200, 200, 429]);
    });

    await t.test('the same key on /mcp is anonymous, at the address limit', async () => {
        const res = await call({ 'x-api-key': keys.own! }, { surface: 'mcp' });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-ratelimit-limit'), '3');
    });

    await t.test(
        "the account's daily quota refuses the call after it, with the quota's reset, and a new key does not start it again",
        async () => {
            const statuses = [];
            const answers: Response[] = [];

            for (let i = 0; i < 3; i++) {
                const res = await call({ 'x-api-key': keys.quota! });

                statuses.push(res.status);
                answers.push(res);
            }

            assert.deepEqual(statuses, [200, 200, 429]);
            // An allowed call reports the per-minute verdict, a refused one the quota's.
            assert.equal(answers[0]!.headers.get('x-ratelimit-limit'), '10');
            assert.equal(answers[2]!.headers.get('x-ratelimit-limit'), '2');
            assert.equal(answers[2]!.headers.get('x-ratelimit-remaining'), '0');
            assert.equal((await answers[2]!.json()).code, 'allowance_exhausted');
            assert.ok(Number(answers[2]!.headers.get('retry-after')) <= 86_400);

            // Deleting the key and making another leaves the count where it is.
            const replacement = signKey(`dfo_k_${'quotatwo'.padEnd(32, 'y')}`, [SECRET]);

            await admin.query('delete from apikey where id = $1', ['key-quota']);
            await admin.query(
                `insert into apikey (id, reference_id, key, created_at, updated_at)
                 values ('key-quota-2', 'quota', $1, now(), now())`,
                [await defaultKeyHasher(replacement)],
            );
            assert.equal((await call({ 'x-api-key': replacement })).status, 429);

            const [row] = (
                await admin.query('select count from limit_counter where key = $1', [
                    'apiday:user:quota',
                ])
            ).rows;

            assert.equal(row.count, 4);
        },
    );

    await t.test("a key's own cap refuses the call after it", async () => {
        const statuses = [];

        for (let i = 0; i < 2; i++) {
            statuses.push((await call({ 'x-api-key': keys.capped! })).status);
        }

        assert.deepEqual(statuses, [200, 429]);
    });

    await t.test('an account with no limit of its own gets the default', async () => {
        const statuses = [];

        for (let i = 0; i < 6; i++) {
            const res = await call({ authorization: `Bearer ${keys.default}` });

            statuses.push(res.status);

            if (i === 0) {
                assert.equal(res.headers.get('x-ratelimit-limit'), '5');
                assert.equal(res.headers.get('x-ratelimit-remaining'), '4');
            }
        }

        assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    });

    await t.test(
        'a key with a good tag but no row, as a deleted key has, is a 401 that costs the address a count',
        async () => {
            const deleted = signKey(`dfo_k_${'q'.repeat(32)}`, [SECRET]);
            const fresh = { 'x-forwarded-for': '198.51.100.9' };
            const statuses = [];

            for (let i = 0; i < 4; i++) {
                statuses.push((await call({ ...fresh, 'x-api-key': deleted })).status);
            }

            assert.deepEqual(statuses, [401, 401, 401, 429]);
        },
    );

    await t.test('a key with a bad tag is a 401 that costs nothing', async () => {
        const fresh = { 'x-forwarded-for': '198.51.100.12' };
        const statuses = [];

        for (let i = 0; i < 5; i++) {
            statuses.push((await call({ ...fresh, 'x-api-key': FORGED })).status);
        }

        assert.deepEqual(statuses, [401, 401, 401, 401, 401]);
        // The address still has its whole anonymous allowance.
        assert.equal((await call(fresh)).headers.get('x-ratelimit-remaining'), '2');
    });

    await t.test(
        'a valid key from an address past its anonymous limit is served, cache or not',
        async () => {
            const busy = { 'x-forwarded-for': '198.51.100.13' };

            for (let i = 0; i < 3; i++) {
                await call(busy);
            }

            assert.equal((await call(busy)).status, 429);

            // A fresh verifier, so the key is not in the cache.
            wire(keyPool);
            assert.equal((await call({ ...busy, 'x-api-key': keys.spare! })).status, 200);
        },
    );

    await t.test('anonymous calls are counted by address, unchanged', async () => {
        const fresh = { 'x-forwarded-for': '198.51.100.10' };
        const statuses = [];

        for (let i = 0; i < 4; i++) {
            statuses.push((await call(fresh)).status);
        }

        assert.deepEqual(statuses, [200, 200, 200, 429]);
    });

    await t.test(
        'cookieless calls and ten visitors from one address share its backstop',
        async () => {
            Object.assign(accessDeps, {
                anonymousLimits: {
                    address: { api: 3, datasets: 3, mcp: 3, pin: 3 },
                    cookieless: { api: 2, datasets: 2 },
                    backstop: { api: 4, datasets: 4 },
                    daily: ANONYMOUS_DAILY_LIMITS,
                    dailyAddress: ADDRESS_DAILY_LIMITS,
                },
            });

            const office = { 'x-forwarded-for': '198.51.100.20' };
            const cookieless = [];

            for (let i = 0; i < 3; i++) {
                cookieless.push((await call(office)).status);
            }

            // Two within the cookieless count, which then spent two of the backstop's four.
            assert.deepEqual(cookieless, [200, 200, 429]);

            const visitors = [];

            for (let i = 0; i < 10; i++) {
                visitors.push((await call({ ...office, cookie: visitorCookie() })).status);
            }

            assert.deepEqual(visitors, [200, 200, 429, 429, 429, 429, 429, 429, 429, 429]);
            wire(keyPool);
        },
    );

    await t.test(
        'an unreachable key store passes a keyed call as anonymous, at the address limit',
        async () => {
            const dead = new Pool({
                host: '127.0.0.1',
                port: 1,
                max: 1,
                connectionTimeoutMillis: 300,
            });

            dead.on('error', () => {});
            t.after(() => dead.end());
            wire(dead);

            const fresh = { 'x-forwarded-for': '198.51.100.11', 'x-api-key': keys.default! };
            const statuses = [];

            for (let i = 0; i < 4; i++) {
                statuses.push((await call(fresh)).status);
            }

            assert.deepEqual(statuses, [200, 200, 200, 429]);
        },
    );
});
