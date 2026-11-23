import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { SavedConversation } from '../../src/lib/chat/history.ts';
import {
    claimSessionOwner,
    saveConversation,
    sessionOwners,
} from '../../src/lib/chat/conversationSave.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const saved = (id: string, sessionId: string | null): SavedConversation => ({
    id,
    sessionId,
    title: 'Aid question',
    updatedAt: 1_800_000_000_000,
    messages: [],
    widgets: [],
    turnCount: 1,
    pinnedIds: [],
    removedIds: [],
    layout: {},
});

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
 * Accounts claiming one new harness conversation at once, each on its own
 * connection, all answer the same single owner, and a later save by another
 * account leaves it.
 */
test('concurrent claims on a harness conversation agree on one owner', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const users = ['user-ana', 'user-ben', 'user-cai', 'user-dee'];

    await drizzle(database.runtimePool())
        .insert(user)
        .values(users.map((id) => ({ id, name: id, email: `${id}@example.org` })));

    const answers = await Promise.all(
        users.map((id) => claimSessionOwner(drizzle(database.runtimePool()), 'harness-new', id)),
    );
    const [owner] = answers[0] ?? [];

    assert.ok(typeof owner === 'string' && users.includes(owner));
    assert.deepEqual(
        answers,
        users.map(() => [owner]),
    );

    const db = drizzle(database.runtimePool());
    const other = users.find((id) => id !== owner) ?? '';

    await saveConversation(db, other, saved('conv-other', 'harness-new'));

    assert.deepEqual(await sessionOwners(db, 'harness-new'), [owner]);
});

/**
 * Deleting an account keeps its harness conversations' owner rows, with no
 * owner, so no later caller can claim one.
 */
test("a deleted account's harness conversation stays owned by nobody", async (t) => {
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
    await db.delete(user).where(eq(user.id, 'user-ana'));

    assert.deepEqual(await sessionOwners(db, 'harness-1'), [null]);
    assert.deepEqual(await claimSessionOwner(db, 'harness-1', 'user-ben'), [null]);
});

/**
 * A save whose id belongs to another account writes nothing, so it claims
 * nothing either.
 */
test("a save refused on another account's id claims no harness conversation", async (t) => {
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
    await saveConversation(db, 'user-ben', saved('conv-ana', 'harness-2'));

    assert.deepEqual(await sessionOwners(db, 'harness-2'), []);
    assert.deepEqual(await sessionOwners(db, 'harness-1'), ['user-ana']);
});

/**
 * Saves written without an owner row (rows inserted directly here) give the
 * harness conversation to their account on the next read, save or turn
 * claim, ahead of whichever account asks.
 */
test('a harness conversation saved without an owner row goes to its saver', async (t) => {
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
    await database.adminPool().query(
        `insert into conversation (id, user_id, title, agent_session_id, data) values
                ('conv-1', 'user-ana', 'Chat', 'harness-save', '{}'),
                ('conv-2', 'user-ana', 'Chat', 'harness-turn', '{}')`,
    );

    await saveConversation(db, 'user-ben', saved('conv-ben', 'harness-save'));

    assert.deepEqual(await sessionOwners(db, 'harness-save'), ['user-ana']);
    assert.deepEqual(await claimSessionOwner(db, 'harness-turn', 'user-ben'), ['user-ana']);
});

/**
 * Migration 0027's backfill and the read-time claim in `sessionOwners` give
 * a harness conversation to an account only when every saved conversation
 * naming it belongs to that account. The migration has already run on the
 * empty tables by the time the rows go in, so the test runs its backfill
 * again over them, then clears the owner rows and reads each id.
 */
test('migration 0027 and the read-time claim own only single-account sessions', async (t) => {
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
            ('conv-ben', 'user-ben', 'Copy', 'harness-shared', '{}', '2026-11-02'),
            ('conv-ana', 'user-ana', 'Chat', 'harness-shared', '{}', '2026-11-01'),
            ('conv-ben-2', 'user-ben', 'Own', 'harness-ben', '{}', '2026-11-03'),
            ('conv-ben-3', 'user-ben', 'Fork', 'harness-ben', '{}', '2026-11-05'),
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

    assert.deepEqual(rows, [{ agent_session_id: 'harness-ben', user_id: 'user-ben' }]);

    await pool.query('delete from studio_session_owner');

    const db = drizzle(database.runtimePool());

    assert.deepEqual(await sessionOwners(db, 'harness-shared'), []);
    assert.deepEqual(await sessionOwners(db, 'harness-ben'), ['user-ben']);
});
