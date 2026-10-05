import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMigrations } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * Proves migration 0008 clears `sessionId` from stored conversation shares
 * and leaves every other share, and every other field, as it was. The
 * migration has already run on the empty table by the time the rows go in,
 * so the test runs its SQL again over them.
 */
test('migration 0008 clears sessionId from conversation shares only', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const pool = database.adminPool();
    const insert = (id: string, kind: string, data: Record<string, unknown>) =>
        pool.query(
            `insert into share (id, kind, title, data) values ($1, $2, 'A share', $3::jsonb)`,
            [id, kind, JSON.stringify(data)],
        );

    await insert('conv0001', 'conversation', {
        sessionId: 'harness-1',
        title: 'Chat',
        turnCount: 2,
    });
    await insert('conv0002', 'conversation', { sessionId: null, title: 'Chat' });
    await insert('canv0001', 'canvas', { sessionId: 'kept-as-is' });
    await insert('srch0001', 'search', { parts: [] });

    const sql = fs.readFileSync(
        path.join(MIGRATIONS_FOLDER, '0008_clear_conversation_share_session_ids.sql'),
        'utf8',
    );
    await pool.query(sql);

    const { rows } = await pool.query<{ id: string; data: Record<string, unknown> }>(
        'select id, data from share order by id',
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.data]));

    assert.deepEqual(byId['conv0001'], { sessionId: null, title: 'Chat', turnCount: 2 });
    assert.deepEqual(byId['conv0002'], { sessionId: null, title: 'Chat' });
    assert.deepEqual(byId['canv0001'], { sessionId: 'kept-as-is' });
    assert.deepEqual(byId['srch0001'], { parts: [] });
});
