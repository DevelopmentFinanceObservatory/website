import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { SavedConversation } from '../../src/lib/chat/history.ts';
import { saveConversation, sessionOwners } from '../../src/lib/chat/conversationSave.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const saved = (id: string, sessionId: string | null): SavedConversation =>
    ({
        id,
        sessionId,
        title: 'Aid question',
        updatedAt: 1_800_000_000_000,
        messages: [],
        widgets: [],
        turnCount: 1,
        pinnedIds: [],
    }) as unknown as SavedConversation;

/**
 * A harness conversation belongs to the first account that saved it. A save
 * by another account naming the same harness id, or the owner's own save
 * naming a different one, leaves the owner as it was.
 */
test('a save cannot rebind the account a harness conversation belongs to', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

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

    await saveConversation(db, 'user-ana', saved('conv-ana', 'harness-1'));
    await saveConversation(db, 'user-ben', saved('conv-ben', 'harness-1'));

    assert.deepEqual(await sessionOwners(db, 'harness-1'), ['user-ana']);

    await saveConversation(db, 'user-ana', saved('conv-ana', 'harness-2'));

    assert.deepEqual(await sessionOwners(db, 'harness-1'), ['user-ana']);
    assert.deepEqual(await sessionOwners(db, 'harness-2'), ['user-ana']);
});

/**
 * Migration 0027 gives each harness conversation already named by saved
 * conversations to the account whose row naming it was created first. The
 * migration has already run on the empty tables by the time the rows go in,
 * so the test runs its backfill again over them.
 */
test('migration 0027 gives a harness conversation to its earliest save', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const pool = database.adminPool();

    await pool.query(
        `insert into "user" (id, name, email) values
            ('user-ana', 'Ana', 'ana@example.org'), ('user-ben', 'Ben', 'ben@example.org')`,
    );
    await pool.query(
        `insert into conversation (id, user_id, title, agent_session_id, data, created_at) values
            ('conv-ben', 'user-ben', 'Copy', 'harness-1', '{}', '2026-11-02'),
            ('conv-ana', 'user-ana', 'Chat', 'harness-1', '{}', '2026-11-01'),
            ('conv-ben-2', 'user-ben', 'Own', 'harness-2', '{}', '2026-11-03'),
            ('conv-new', 'user-ben', 'New', null, '{}', '2026-11-04')`,
    );

    const migration = fs.readFileSync(
        path.join(MIGRATIONS_FOLDER, '0027_studio_session_owner.sql'),
        'utf8',
    );
    const backfill = migration.split('--> statement-breakpoint').at(-1) ?? '';

    await pool.query(backfill);

    const { rows } = await pool.query<{ agent_session_id: string; user_id: string }>(
        'select agent_session_id, user_id from studio_session_owner order by agent_session_id',
    );

    assert.deepEqual(rows, [
        { agent_session_id: 'harness-1', user_id: 'user-ana' },
        { agent_session_id: 'harness-2', user_id: 'user-ben' },
    ]);
});
