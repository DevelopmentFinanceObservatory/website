import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { defaultKeyHasher } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { makeSignature } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { API_KEY_PATHS, API_KEY_PREFIX, apiKeyPlugin } from '../../src/lib/auth/apiKeyOptions.ts';
import { applyMigrations } from '../apply-migrations.ts';
import * as schema from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');
const BASE = 'http://localhost:3000';
const SECRET = 'a-test-secret-long-enough-for-better-auth';

/**
 * The API key tables and the plugin's setup (src/lib/auth/apiKeyOptions), on
 * a migrated database and as the runtime role: the unique key index, the
 * cascade from user, the grants the proxy's key read needs, the plugin's
 * hash, and the HTTP endpoints that stay closed.
 */
test('API key table and plugin setup', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const pool = database.runtimePool();
    const db = drizzle(pool, { schema });
    const auth = betterAuth({
        database: drizzleAdapter(db, { provider: 'pg', schema }),
        baseURL: BASE,
        secret: SECRET,
        trustedOrigins: [BASE],
        disabledPaths: [...API_KEY_PATHS],
        user: {
            additionalFields: {
                apiRateLimit: { type: 'number', required: false, input: false, returned: false },
            },
        },
        plugins: [apiKeyPlugin()],
    });
    const context = await auth.$context;

    const signedIn = async (email: string) => {
        const user = await context.internalAdapter.createUser(
            { email, name: email, emailVerified: true },
            { method: 'email-otp' },
        );
        const session = await context.internalAdapter.createSession(user.id);
        const signature = await makeSignature(session.token, SECRET);
        const cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`;

        return { user, cookie };
    };

    const alice = await signedIn('alice@a.example');

    await t.test('the runtime role reads apikey and user.api_rate_limit', async () => {
        await pool.query('select id, key, enabled, expires_at, reference_id from apikey limit 1');
        await pool.query('select api_rate_limit from "user" limit 1');
    });

    await t.test("the runtime role can record a key's last use", async () => {
        const created = await auth.api.createApiKey({ body: { userId: alice.user.id } });
        const updated = await pool.query(
            'update apikey set last_request = now() where id = $1 returning last_request',
            [created.id],
        );

        assert.equal(updated.rowCount, 1);
        assert.ok(updated.rows[0].last_request);
    });

    await t.test(
        'a key is stored as its SHA-256, base64url, with the dfo_live_ prefix',
        async () => {
            const created = await auth.api.createApiKey({ body: { userId: alice.user.id } });

            assert.match(created.key, /^dfo_live_[A-Za-z0-9]{32}$/);
            assert.equal(created.key.startsWith(API_KEY_PREFIX), true);

            const [row] = await db
                .select()
                .from(schema.apikey)
                .where(eq(schema.apikey.id, created.id));

            assert.equal(row?.key, await defaultKeyHasher(created.key));
            // The stored form is base64url(SHA-256(key)), unpadded: the plugin's
            // hasher on a fixed input matches that, computed independently.
            assert.equal(
                await defaultKeyHasher('dfo_live_known-answer'),
                'NJcfEBlh8jOAAbK52QabqvvVBcoa3ykj-SNDqq0F7Y0',
            );
            assert.equal(row?.referenceId, alice.user.id);
        },
    );

    await t.test('a second row with the same key is refused', async () => {
        const [row] = await db.select().from(schema.apikey).limit(1);
        const now = new Date();

        await assert.rejects(
            () =>
                db.insert(schema.apikey).values({
                    id: 'duplicate',
                    referenceId: alice.user.id,
                    key: row!.key,
                    createdAt: now,
                    updatedAt: now,
                }),
            (error: unknown) => {
                assert.match(String((error as Error).cause), /apikey_key_idx/);
                return true;
            },
        );
    });

    await t.test('deleting an account deletes its keys', async () => {
        const carol = await signedIn('carol@c.example');
        const created = await auth.api.createApiKey({ body: { userId: carol.user.id } });

        await context.internalAdapter.deleteUser(carol.user.id);

        const left = await db.select().from(schema.apikey).where(eq(schema.apikey.id, created.id));

        assert.equal(left.length, 0);
    });

    await t.test('the plugin metadata is off', async () => {
        await assert.rejects(() =>
            auth.api.createApiKey({
                body: { userId: alice.user.id, metadata: { plan: 'x' } },
            }),
        );
    });

    await t.test('the HTTP key endpoints answer 404 and server-side calls still work', async () => {
        for (const [method, route] of [
            ['POST', '/api-key/create'],
            ['POST', '/api-key/update'],
            ['POST', '/api-key/delete'],
            ['GET', '/api-key/list'],
            ['GET', '/api-key/get?id=x'],
        ] as const) {
            const res = await auth.handler(
                new Request(`${BASE}/api/auth${route}`, {
                    method,
                    headers: {
                        'content-type': 'application/json',
                        cookie: alice.cookie,
                        origin: BASE,
                    },
                    body: method === 'POST' ? '{}' : undefined,
                }),
            );

            assert.equal(res.status, 404, route);
        }

        const listed = await auth.api.listApiKeys({
            headers: new Headers({ cookie: alice.cookie, origin: BASE }),
        });

        assert.ok(listed.apiKeys.length >= 1);
    });

    await t.test('a key does not act as a session', async () => {
        const created = await auth.api.createApiKey({ body: { userId: alice.user.id } });

        for (const headers of [
            new Headers({ authorization: `Bearer ${created.key}` }),
            new Headers({ 'x-api-key': created.key }),
        ]) {
            assert.equal(await auth.api.getSession({ headers }), null);
        }
    });

    await t.test('apiRateLimit is neither settable nor readable by the account', async () => {
        const update = await auth.handler(
            new Request(`${BASE}/api/auth/update-user`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    cookie: alice.cookie,
                    origin: BASE,
                },
                body: JSON.stringify({ name: 'Alice', apiRateLimit: 9999 }),
            }),
        );
        const session = await auth.api.getSession({
            headers: new Headers({ cookie: alice.cookie }),
        });
        const [row] = await db
            .select({ limit: schema.user.apiRateLimit })
            .from(schema.user)
            .where(eq(schema.user.id, alice.user.id));

        assert.ok(update.status < 500);
        assert.equal(row?.limit, null);
        assert.equal('apiRateLimit' in (session?.user ?? {}), false);
    });
});
