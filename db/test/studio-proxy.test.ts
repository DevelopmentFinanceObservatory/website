import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { applyMigrations } from '../apply-migrations.ts';
import { user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * The Studio proxy (src/lib/studio/studioProxy) counts each call against the
 * per-address rate limit once, before it reads the body, and checks who owns
 * a conversation only for a call the limit lets through, so a rate-limited
 * turn claims no conversation and a body the proxy refuses still counts. Runs on a migrated database as
 * the runtime role, since the rate limit and the owner rows both live there.
 */
test('a Studio call counts once and a rate-limited turn writes no owner row', async (t) => {
    const database = await createTestDatabase();

    // src/lib/db caches its pools on globalThis; they end before the
    // database goes.
    t.after(async () => {
        const pools = globalThis as unknown as { pool?: Pool; counterPool?: Pool };

        await Promise.all([pools.pool?.end(), pools.counterPool?.end()]);
        await database.teardown();
    });

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());

    await db.insert(user).values([
        { id: 'user-ana', name: 'Ana', email: 'ana@example.org' },
        { id: 'user-ben', name: 'Ben', email: 'ben@example.org' },
    ]);

    const harness = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });

    harness.listen(0, '127.0.0.1');
    await once(harness, 'listening');
    t.after(() => {
        harness.closeAllConnections();
        harness.close();
    });

    const { port } = harness.address() as AddressInfo;
    const host = process.env.PGHOST ?? 'localhost';
    const pgPort = process.env.PGPORT ?? '5433';

    // Read when the proxy's modules load: one call per day-long window, so
    // both turns fall in the same window, a database the runtime role
    // reaches, and the stub harness above.
    process.env.DATABASE_URL = `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${pgPort}/${database.databaseName}`;
    process.env.RATE_LIMIT_API = '1';
    process.env.RATE_LIMIT_WINDOW_S = '86400';
    process.env.STUDIO_API_BASE = `http://127.0.0.1:${port}`;

    await import('../../src/lib/test/serverModules.ts');

    const { NextRequest } = await import('next/server.js');
    const { claimConversationOwner, conversationOwners } =
        await import('../../src/lib/chat/conversationStore.ts');
    const { studioProxy } = await import('../../src/lib/studio/studioProxy.ts');

    let signedIn = { id: 'user-ana', email: 'ana@example.org' };
    const proxy = studioProxy({
        getUser: async () => signedIn,
        ownersOf: conversationOwners,
        claimOwner: claimConversationOwner,
    });
    const { MAX_TURN_BODY_BYTES } = await import('../../src/lib/studio/studioAccess.ts');
    const post = (body: string) =>
        proxy(
            new NextRequest('http://site.test/api/v1/studio/turn', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
            }),
            { params: Promise.resolve({ path: ['turn'] }) },
        );
    const turn = (conversationId: string) =>
        post(JSON.stringify({ conversation_id: conversationId, message: 'hi' }));

    // Every call here comes from one address, so the counts share one row.
    const admin = database.adminPool();
    const counted = async () => {
        const { rows } = await admin.query<{ count: number }>(
            `select count from limit_counter where key like 'api:%'`,
        );

        return rows.map((row) => row.count);
    };

    assert.equal((await turn('conv-ana')).status, 200);
    assert.deepEqual(await conversationOwners('conv-ana'), ['user-ana']);
    // forward() takes the proxy's verdict and counts the turn no second time.
    assert.deepEqual(await counted(), [1]);

    signedIn = { id: 'user-ben', email: 'ben@example.org' };

    assert.equal((await turn('conv-ben')).status, 429);
    assert.deepEqual(await conversationOwners('conv-ben'), []);

    // A body the proxy refuses itself is counted before it is read.
    for (const [body, status] of [
        ['{', 400],
        ['x'.repeat(MAX_TURN_BODY_BYTES + 1), 413],
    ] as const) {
        await admin.query('delete from limit_counter');

        assert.equal((await post(body)).status, status);
        assert.deepEqual(await counted(), [1]);
    }
});
