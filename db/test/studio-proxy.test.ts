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
 * The Studio proxy (src/lib/studio/studioProxy) checks who owns a
 * conversation only for a call the per-address rate limit lets through, so a
 * rate-limited turn claims no conversation. Runs on a migrated database as
 * the runtime role, since the rate limit and the owner rows both live there.
 */
test('a rate-limited Studio turn writes no owner row', async (t) => {
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

    // Read when the proxy's modules load: one call per window, a database
    // the runtime role reaches, and the stub harness above.
    process.env.DATABASE_URL = `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${pgPort}/${database.databaseName}`;
    process.env.RATE_LIMIT_API = '1';
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
    const turn = (conversationId: string) =>
        proxy(
            new NextRequest('http://site.test/api/v1/studio/turn', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ conversation_id: conversationId, message: 'hi' }),
            }),
            { params: Promise.resolve({ path: ['turn'] }) },
        );

    assert.equal((await turn('conv-ana')).status, 200);
    assert.deepEqual(await conversationOwners('conv-ana'), ['user-ana']);

    signedIn = { id: 'user-ben', email: 'ben@example.org' };

    assert.equal((await turn('conv-ben')).status, 429);
    assert.deepEqual(await conversationOwners('conv-ben'), []);
});
