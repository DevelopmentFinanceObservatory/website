/**
 * `forward()` with API keys: what reaches the upstream (never the key, the
 * caller named as `user:` for an account), what a bad, unavailable or
 * ignored key does, the Studio and the kill switch, the usage line, and the
 * whole flow on a real key store and counter.
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
const { createLimiter } = await import('../rateLimit.ts');

const KEY = signKey(`dfo_live_${'k'.repeat(32)}`, [SECRET]);
const FORGED = `dfo_live_${'k'.repeat(32)}AAAAAAAA`;
const ACCOUNT = 'acct-1';
const accountCaller = `user:${createHmac('sha256', 'test-hmac-key')
    .update(`user:${ACCOUNT}`)
    .digest('hex')
    .slice(0, 32)}`;
const addressCaller = `ip:${createHmac('sha256', 'test-hmac-key')
    .update('203.0.113.7')
    .digest('hex')
    .slice(0, 32)}`;

// What the upstream saw of each call.
const seen: IncomingHttpHeaders[] = [];
const upstream = createServer((req, res) => {
    seen.push(req.headers);
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
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
    accessDeps.hitAccount = async (surface, accountId, limit) => {
        log.push(`account:${surface}:${accountId}`);

        return verdictOf(limit);
    };

    return log;
};
const verdictOf = (limit: number): RateVerdict => ({
    allowed: true,
    counted: true,
    limit,
    remaining: limit - 1,
    reset: 60,
});
const VALID: KeyVerdict = {
    kind: 'valid',
    keyId: 'key-public-1',
    accountId: ACCOUNT,
    rateLimit: null,
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
};

test.after(() => mock.restoreAll());

test('forward: a valid key goes to dfo-apis as the account, with no key in sight', async () => {
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

test('forward: an unavailable key store goes on as anonymous with the key still stripped', async () => {
    fresh();
    const log = fakes({ kind: 'unavailable' });
    const res = await call({ authorization: `Bearer ${KEY}`, 'x-api-key': KEY });

    assert.equal(res.status, 200);
    assert.deepEqual(log, ['cache', 'lookup', 'address:api']);
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
    assert.deepEqual(log, ['address:api']);
    assert.equal(seen[0]!.authorization, undefined);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
});

test('forward: a key in another scheme, or bare, is anonymous and never reaches dfo-apis', async () => {
    for (const authorization of [`Token ${KEY}`, KEY]) {
        fresh();
        const log = fakes(VALID);
        const res = await call({ authorization });

        assert.equal(res.status, 200);
        assert.deepEqual(log, ['address:api']);
        assert.equal(seen[0]!.authorization, undefined);
    }
});

test('forward: a call with no key is anonymous, and a client-sent caller is dropped', async () => {
    fresh();
    const log = fakes(VALID);

    await call({ 'x-dfo-caller': accountCaller });

    assert.deepEqual(log, ['address:api']);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
});

test('forward: /mcp names the account to dfo-ai, and the harness token replaces any bearer', async () => {
    fresh();
    fakes(VALID, true);

    const mcp = (headers: Record<string, string>, options: Options = {}) =>
        call(headers, {
            surface: 'mcp',
            target: 'http://127.0.0.1:1/never',
            sendCaller: true,
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
        // With the harness token held: read the key, then replace the header.
        await mcp({ authorization: `Bearer ${KEY}` }, { target, bearer: 'harness' });
        assert.equal(seen[0]!.authorization, 'Bearer harness');
        assert.equal(seen[0]!['x-dfo-caller'], accountCaller);
        assert.equal(seen[0]!['x-dfo-caller-principal'], undefined);

        // Without it: the key is the proxy's own, so no credential goes on.
        seen.length = 0;
        await mcp({ authorization: `Bearer ${KEY}` }, { target });
        assert.equal(seen[0]!.authorization, undefined);
        assert.equal(seen[0]!['x-api-key'], undefined);

        // Another scheme or a bare key is no key, and goes no further either.
        for (const authorization of [`Token ${KEY}`, KEY]) {
            seen.length = 0;
            await mcp({ authorization }, { target });
            assert.equal(seen[0]!.authorization, undefined);
        }

        // The key in X-API-Key, the harness token as the bearer: both work.
        seen.length = 0;
        await mcp({ authorization: 'Bearer harness-token', 'x-api-key': KEY }, { target });
        assert.equal(seen[0]!.authorization, 'Bearer harness-token');
        assert.equal(seen[0]!['x-api-key'], undefined);
        assert.equal(seen[0]!['x-dfo-caller'], accountCaller);

        // Anonymous callers are named by address, as before.
        seen.length = 0;
        await mcp({}, { target });
        assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
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

        const res = await call(headers, { keys: false, bearer: 'studio-token' });

        assert.equal(res.status, 200);
        assert.equal(seen[0]!.authorization, 'Bearer studio-token');
        assert.equal(seen[0]!['x-api-key'], undefined);
    }

    // Counted by address only, never looked up.
    assert.ok(log.every((entry) => entry === 'address:api'));
});

test('forward: API_KEYS_ENABLED=false strips keys and treats every call as anonymous', async () => {
    fresh();
    process.env.API_KEYS_ENABLED = 'false';

    const log = fakes({ kind: 'invalid' });
    const res = await call({ authorization: `Bearer ${KEY}`, 'x-api-key': 'junk' });

    assert.equal(res.status, 200);
    assert.deepEqual(log, ['address:api']);
    assert.equal(seen[0]!.authorization, undefined);
    assert.equal(seen[0]!['x-api-key'], undefined);
    assert.equal(seen[0]!['x-dfo-caller'], addressCaller);
});

test('forward: logs one line per keyed call with the key id, account, surface and outcome, never the key', async () => {
    fresh();
    fakes(VALID);
    await call({ authorization: `Bearer ${KEY}` });

    fakes({ kind: 'invalid' });
    await call({ 'x-api-key': KEY }, { surface: 'mcp' });

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
                surface: 'mcp',
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
    assert.doesNotMatch(lines.join('\n'), /dfo_live/);
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
    ] as const) {
        await admin.query(
            `insert into "user" (id, name, email, email_verified, created_at, updated_at, api_rate_limit)
             values ($1, $1, $1 || '@a.example', true, now(), now(), $2)`,
            [id, limit],
        );

        keys[id] = signKey(`dfo_live_${id.padEnd(32, 'z')}`, [SECRET]);
        await admin.query(
            `insert into apikey (id, reference_id, key, created_at, updated_at)
             values ($1, $3, $2, now(), now())`,
            [`key-${id}`, await defaultKeyHasher(keys[id]), id],
        );
    }

    const wire = (verifierPool: Pool) => {
        Object.assign(accessDeps, {
            verifier: createKeyVerifier(drizzle(verifierPool, { schema }), { log: () => {} }),
            hitAddress: (surface: 'api' | 'mcp' | 'pin', ip: string) =>
                limiter.hitKey(surface, ip, { api: 3, mcp: 3, pin: 3 }[surface]),
            hitAccount: (surface: 'api' | 'mcp' | 'pin', accountId: string, limit: number) =>
                limiter.hitKey(surface, `acct:${accountId}`, limit),
            defaultLimit: 5,
        });
    };

    wire(keyPool);

    await t.test('an account is held to its own limit, apart per surface', async () => {
        const statuses = [];

        for (let i = 0; i < 4; i++) {
            statuses.push((await call({ 'x-api-key': keys.own! })).status);
        }

        assert.deepEqual(statuses, [200, 200, 200, 429]);
        assert.equal((await call({ 'x-api-key': keys.own! }, { surface: 'mcp' })).status, 200);
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
            const deleted = signKey(`dfo_live_${'q'.repeat(32)}`, [SECRET]);
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
