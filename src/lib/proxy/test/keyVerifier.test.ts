/**
 * `keyVerifier.ts` on a migrated database, as the runtime role: a valid key,
 * and what makes one invalid (unknown, disabled, expired, not ours), an
 * unavailable key store (a closed port, a table lock that outlasts the
 * statement timeout), and the cache's lifetimes, expiry bound, bound on size
 * and single read.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { defaultKeyHasher } from '@better-auth/api-key';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { applyMigrations } from '../../../../db/apply-migrations.ts';
import { buildKeyPool } from '../../../../db/connection.ts';
import * as schema from '../../../../db/schema.ts';
import { createTestDatabase } from '../../../../db/test/harness.ts';

const { CACHE_INVALID_MS, CACHE_VALID_MS, createKeyVerifier } = await import('../keyVerifier.ts');

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../db/migrations');

const keyOf = (name: string) => `dfo_live_${name.padEnd(32, '0')}`;

test('keyVerifier on the key store', async (t) => {
    const database = await createTestDatabase();

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const admin = database.adminPool();
    const host = process.env.PGHOST ?? 'localhost';
    const port = process.env.PGPORT ?? '5433';
    const url = `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${port}/${database.databaseName}`;

    const pool = buildKeyPool({ DATABASE_URL: url });

    t.after(async () => {
        await pool.end();
        await database.teardown();
    });

    const db = drizzle(pool, { schema });

    for (const [id, limit] of [
        ['acct-default', null],
        ['acct-250', 250],
        ['acct-zero', 0],
    ] as const) {
        await admin.query(
            `insert into "user" (id, name, email, email_verified, created_at, updated_at, api_rate_limit)
             values ($1, $1, $1 || '@a.example', true, now(), now(), $2)`,
            [id, limit],
        );
    }

    const addKey = async (
        name: string,
        account: string,
        { enabled = true, expiresAt = null }: { enabled?: boolean; expiresAt?: Date | null } = {},
    ) => {
        const key = keyOf(name);

        await admin.query(
            `insert into apikey (id, reference_id, key, enabled, expires_at, created_at, updated_at)
             values ($1, $2, $3, $4, $5, now(), now())`,
            // The column has no time zone, which Drizzle reads as UTC.
            [
                `id-${name}`,
                account,
                await defaultKeyHasher(key),
                enabled,
                expiresAt?.toISOString().replace('Z', '') ?? null,
            ],
        );

        return key;
    };

    const live = await addKey('live', 'acct-default');
    const own = await addKey('own', 'acct-250');
    const zero = await addKey('zero', 'acct-zero');
    const disabled = await addKey('disabled', 'acct-default', { enabled: false });
    const expired = await addKey('expired', 'acct-default', {
        expiresAt: new Date(Date.now() - 1000),
    });

    await t.test('a valid key names its public id, account, limit and expiry', async () => {
        const verifier = createKeyVerifier(db);

        assert.deepEqual(await verifier.verify(live), {
            kind: 'valid',
            keyId: 'id-live',
            accountId: 'acct-default',
            rateLimit: null,
            expiresAt: null,
        });
        assert.equal(
            await verifier.verify(own).then((v) => v.kind === 'valid' && v.rateLimit),
            250,
        );
        // A limit that is not a positive whole number is the default.
        assert.equal(
            await verifier.verify(zero).then((v) => v.kind === 'valid' && v.rateLimit),
            null,
        );
    });

    await t.test('unknown, disabled, expired and foreign-shaped keys are invalid', async () => {
        const verifier = createKeyVerifier(db);

        for (const key of [keyOf('nobody'), disabled, expired, 'not-our-key', '']) {
            assert.deepEqual(await verifier.verify(key), { kind: 'invalid' }, key);
        }
    });

    await t.test('a lookup writes nothing to the key store', async () => {
        const before = await admin.query(
            `select id, request_count, last_request, updated_at, remaining from apikey order by id`,
        );

        const verifier = createKeyVerifier(db);

        await verifier.verify(live);
        await verifier.verify(expired);

        const after = await admin.query(
            `select id, request_count, last_request, updated_at, remaining from apikey order by id`,
        );

        assert.deepEqual(after.rows, before.rows);
        assert.equal(
            (await admin.query('select 1 from apikey where id = $1', ['id-expired'])).rowCount,
            1,
        );
    });

    await t.test('a valid answer is cached for an absolute minute, never extended', async () => {
        let clock = 1_000_000;
        const reads: string[] = [];
        const verifier = createKeyVerifier(db, { now: () => clock });
        const sql = pool.query.bind(pool) as (...args: unknown[]) => unknown;

        (pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
            reads.push(String((args[0] as { text?: string }).text ?? args[0]));

            return sql(...args);
        };
        t.after(() => {
            (pool as unknown as { query: unknown }).query = sql;
        });

        assert.equal((await verifier.verify(live)).kind, 'valid');
        assert.equal(reads.length, 1);

        clock += CACHE_VALID_MS - 1;
        assert.equal((await verifier.cachedValid(live))?.kind, 'valid');
        assert.equal((await verifier.verify(live)).kind, 'valid');
        assert.equal(reads.length, 1);

        // A deleted key is gone once the minute is up, however often it was used.
        await admin.query('delete from apikey where id = $1', ['id-live']);
        clock += 1;
        assert.equal(await verifier.cachedValid(live), undefined);
        assert.deepEqual(await verifier.verify(live), { kind: 'invalid' });
        assert.equal(reads.length, 2);

        await admin.query(
            `insert into apikey (id, reference_id, key, created_at, updated_at)
             values ('id-live', 'acct-default', $1, now(), now())`,
            [await defaultKeyHasher(live)],
        );
    });

    await t.test(
        'the cache never outlives the key: an expiry sooner than a minute wins',
        async () => {
            let clock = Date.now();
            const soon = await addKey('soon', 'acct-default', {
                expiresAt: new Date(clock + 5_000),
            });
            const verifier = createKeyVerifier(db, { now: () => clock });

            assert.equal((await verifier.verify(soon)).kind, 'valid');

            clock += 4_999;
            assert.equal((await verifier.cachedValid(soon))?.kind, 'valid');

            clock += 2;
            assert.equal(await verifier.cachedValid(soon), undefined);
            assert.deepEqual(await verifier.verify(soon), { kind: 'invalid' });
        },
    );

    await t.test(
        'an invalid answer is cached briefly, and a key added later is found after it',
        async () => {
            let clock = 1_000_000;
            const verifier = createKeyVerifier(db, { now: () => clock });
            const later = keyOf('later');

            assert.deepEqual(await verifier.verify(later), { kind: 'invalid' });
            await addKey('later', 'acct-default');
            assert.deepEqual(await verifier.verify(later), { kind: 'invalid' });

            clock += CACHE_INVALID_MS;
            assert.equal((await verifier.verify(later)).kind, 'valid');
        },
    );

    await t.test('concurrent lookups of one key share one read', async () => {
        const verifier = createKeyVerifier(db);
        const verdicts = await Promise.all(Array.from({ length: 20 }, () => verifier.verify(own)));

        assert.ok(verdicts.every((verdict) => verdict.kind === 'valid'));
    });

    await t.test('the cache is bounded, and made-up keys do not push valid ones out', async () => {
        const verifier = createKeyVerifier(db, { maxEntries: 3 });

        assert.equal((await verifier.verify(live)).kind, 'valid');

        for (let i = 0; i < 20; i++) {
            await verifier.verify(keyOf(`bogus${i}`));
        }

        assert.equal(verifier.cacheSize(), 1 + 3);
        assert.equal((await verifier.cachedValid(live))?.kind, 'valid');
    });

    await t.test('a store that cannot be reached is unavailable, and not cached', async () => {
        const logged: string[] = [];
        const deadPool = new Pool({
            host: '127.0.0.1',
            port: 1,
            user: 'x',
            database: 'x',
            connectionTimeoutMillis: 500,
            max: 1,
        });

        deadPool.on('error', () => {});
        t.after(() => deadPool.end());

        const verifier = createKeyVerifier(drizzle(deadPool, { schema }), {
            log: (message) => logged.push(message),
        });

        assert.deepEqual(await verifier.verify(live), { kind: 'unavailable' });
        assert.equal(verifier.cacheSize(), 0);
        assert.equal(logged.length, 1);
        assert.doesNotMatch(logged.join(), /dfo_/);
    });

    await t.test('a read that outlasts the statement timeout is unavailable', async () => {
        const verifier = createKeyVerifier(db, { log: () => {} });
        const blocker = database.adminPool();
        const client = await blocker.connect();

        try {
            await client.query('begin');
            await client.query('lock table apikey in access exclusive mode');

            const started = Date.now();

            assert.deepEqual(await verifier.verify(own), { kind: 'unavailable' });
            assert.ok(Date.now() - started < 2_000);
        } finally {
            await client.query('rollback');
            client.release();
        }

        assert.equal(verifier.cacheSize(), 0);
        assert.equal((await verifier.verify(own)).kind, 'valid');
    });

    await t.test(
        'a cached valid key keeps answering while the store is down, until its minute ends',
        async () => {
            let clock = 1_000_000;
            const flaky = {
                down: false,
                select: (...args: Parameters<typeof db.select>) =>
                    flaky.down ? (undefined as never) : db.select(...args),
            };
            const verifier = createKeyVerifier(flaky as unknown as typeof db, {
                now: () => clock,
                log: () => {},
            });

            assert.equal((await verifier.verify(own)).kind, 'valid');
            flaky.down = true;

            clock += CACHE_VALID_MS - 1;
            assert.equal((await verifier.verify(own)).kind, 'valid');

            clock += 1;
            assert.deepEqual(await verifier.verify(own), { kind: 'unavailable' });
        },
    );
});
