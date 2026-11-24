import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { SavedConversation } from '../../src/lib/chat/history.ts';
import {
    claimSessionOwner,
    saveConversation,
    sessionOwners,
} from '../../src/lib/chat/conversationSave.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { conversation, user } from '../schema.ts';
import { createTestDatabase, migrationsWhere } from './harness.ts';

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
 * Migration 0027's backfill, the read-time claim in `sessionOwners`, and the
 * turn and save claims all give a harness conversation to the account behind
 * the oldest saved conversation naming it, by `created_at`, then `id`,
 * whichever account asks. The migration has already run on the empty tables
 * by the time the rows go in, so the test runs its backfill again over them,
 * then clears the owner rows and claims each id another way.
 */
test('migration 0027 and every claim give a session to its oldest saver', async (t) => {
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
            ('conv-b', 'user-ana', 'Tie', 'harness-tie', '{}', '2026-11-06'),
            ('conv-a', 'user-ben', 'Tie', 'harness-tie', '{}', '2026-11-06'),
            ('conv-ben-2', 'user-ben', 'Own', 'harness-ben', '{}', '2026-11-03'),
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
        { agent_session_id: 'harness-ben', user_id: 'user-ben' },
        { agent_session_id: 'harness-shared', user_id: 'user-ana' },
        { agent_session_id: 'harness-tie', user_id: 'user-ben' },
    ]);

    const db = drizzle(database.runtimePool());

    await pool.query('delete from studio_session_owner');
    assert.deepEqual(await sessionOwners(db, 'harness-shared'), ['user-ana']);
    assert.deepEqual(await sessionOwners(db, 'harness-tie'), ['user-ben']);

    await pool.query('delete from studio_session_owner');
    assert.deepEqual(await claimSessionOwner(db, 'harness-shared', 'user-ben'), ['user-ana']);
    assert.deepEqual(await claimSessionOwner(db, 'harness-tie', 'user-ana'), ['user-ben']);

    await pool.query('delete from studio_session_owner');
    await saveConversation(db, 'user-ben', saved('conv-ben', 'harness-shared'));
    assert.deepEqual(await sessionOwners(db, 'harness-shared'), ['user-ana']);
});

/**
 * A database migrated through the journal entries `keep` accepts, with an
 * account `user-ana`, and a way to apply the full journal.
 */
const migratedTo = async (
    t: TestContext,
    keep: (entry: { idx: number; tag: string }) => boolean,
) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());
    const start = migrationsWhere(keep);
    t.after(() => fs.rmSync(start, { recursive: true, force: true }));

    const migrate = (migrationsFolder: string) =>
        applyMigrations(database.migratorPool(), {
            migrationsFolder,
            runtimeDbUser: database.runtimeUser,
            migratorDbUser: database.migratorUser,
        });

    await migrate(start);
    await database
        .adminPool()
        .query(
            `insert into "user" (id, name, email) values ('user-ana', 'Ana', 'ana@example.org')`,
        );

    return { database, migrateRest: () => migrate(MIGRATIONS_FOLDER) };
};

const through26 = (entry: { idx: number }) => entry.idx <= 26;

/**
 * Resolves once a transaction in this database waits for a lock of
 * `locktype`: `relation` for a table, `transactionid` for a row another
 * transaction holds. If `migration` settles first, rethrows its error or
 * fails.
 */
const untilWaiting = async (
    pool: Pool,
    migration: Promise<unknown>,
    locktype: 'relation' | 'transactionid',
) => {
    let settled = false;
    migration.then(
        () => (settled = true),
        () => (settled = true),
    );
    const deadline = Date.now() + 10_000;

    for (;;) {
        const { rowCount } = await pool.query(
            `select 1 from pg_locks join pg_stat_activity using (pid)
             where pg_stat_activity.datname = current_database()
               and not pg_locks.granted and pg_locks.locktype = $1`,
            [locktype],
        );

        if (rowCount !== 0) return;
        if (settled) {
            await migration;
            assert.fail(`the migration finished before anything waited on a ${locktype} lock`);
        }
        assert.ok(Date.now() < deadline, `nothing waited on a ${locktype} lock`);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
};

// 100 SHA-256 digests in base64, 4,400 characters. A repeated character
// compresses under the 2,704-byte btree limit. These bytes barely compress.
const incompressible = Array.from({ length: 100 }, (_, index) =>
    createHash('sha256').update(String(index)).digest('base64'),
).join('');

/**
 * Saves before migration 0027_studio_session_owner stored any harness id.
 * Migration 0027_clear_refused_harness_ids clears each one the Studio refused
 * when it ran, so an id too long for a btree key cannot fail the index, and
 * only the ids it keeps get an owner. The ids sit on each side of the length
 * bound in UTF-16 code units, where a character above U+FFFF counts twice,
 * and of each end of the Cc ranges U+0001 to U+001F and U+007F to U+009F.
 */
test('migration 0027 clears every harness id the Studio refuses', async (t) => {
    const { database, migrateRest } = await migratedTo(t, through26);
    const cases: [id: string, kept: boolean][] = [
        ['harness-ok', true],
        ['', false],
        ['a'.repeat(256), true],
        ['a'.repeat(257), false],
        [incompressible, false],
        ['\u{1F600}'.repeat(128), true],
        ['\u{1F600}'.repeat(129), false],
        ['soh\u0001id', false],
        ['tab\tid', false],
        ['us\u001fid', false],
        ['space id', true],
        ['tilde~id', true],
        ['del\u007fid', false],
        ['nel\u0085id', false],
        ['apc\u009fid', false],
        ['nbsp\u00a0id', true],
        ['zero\u200bwidth', true],
    ];
    const pool = database.adminPool();

    for (const [index, [id]] of cases.entries()) {
        await pool.query(
            `insert into conversation (id, user_id, title, agent_session_id, data)
                values ($1, 'user-ana', 'Chat', $2, '{}')`,
            [`conv-${index}`, id],
        );
    }

    await migrateRest();

    const stored = await pool.query<{ id: string; agent_session_id: string | null }>(
        'select id, agent_session_id from conversation',
    );
    const kept = new Map(stored.rows.map((row) => [row.id, row.agent_session_id]));

    assert.deepEqual(
        cases.map((_, index) => kept.get(`conv-${index}`)),
        cases.map(([id, keep]) => (keep ? id : null)),
    );

    const owners = await pool.query<{ agent_session_id: string }>(
        'select agent_session_id from studio_session_owner',
    );

    assert.deepEqual(
        owners.rows.map((row) => row.agent_session_id).sort(),
        cases
            .filter(([, keep]) => keep)
            .map(([id]) => id)
            .sort(),
    );
});

const insertConversation = (
    client: Pick<Pool, 'query'>,
    id: string,
    userId: string,
    agentSessionId: string,
) =>
    client.query(
        `insert into conversation (id, user_id, title, agent_session_id, data)
            values ($1, $2, 'Chat', $3, '{}')`,
        [id, userId, agentSessionId],
    );

/**
 * The old service keeps saving while the migration runs. A save that commits
 * after the clear and before the index build would put a refused id under the
 * index, so the clear locks `conversation` against writes until both
 * migrations commit in one transaction. Here a save of a 4,400-character id
 * is open when the migration starts, and the migration waits for it, then
 * clears it. A row lock then holds the migration inside the clear while a
 * second such save queues. That save runs only after the index exists, and
 * fails on it.
 */
test('migration 0027 holds its lock from the clear until the index is built', async (t) => {
    const { database, migrateRest } = await migratedTo(t, through26);
    const pool = database.adminPool();
    const [writer, holder, saver] = await Promise.all([
        database.adminPool().connect(),
        database.adminPool().connect(),
        database.adminPool().connect(),
    ]);

    await insertConversation(pool, 'conv-held', 'user-ana', '');

    try {
        await holder.query('begin');
        await holder.query(`select 1 from conversation where id = 'conv-held' for update`);
        await writer.query('begin');
        await insertConversation(writer, 'conv-late', 'user-ana', incompressible);

        const migrated = migrateRest();

        await untilWaiting(pool, migrated, 'relation');
        await writer.query('commit');
        await untilWaiting(pool, migrated, 'transactionid');

        const saved = insertConversation(saver, 'conv-later', 'user-ana', incompressible).then(
            () => 'stored',
            (error: { code?: string }) => error.code,
        );

        await untilWaiting(pool, migrated, 'relation');
        await holder.query('commit');
        await migrated;
        assert.equal(await saved, '54000');
    } finally {
        for (const client of [writer, holder, saver]) client.release(true);
    }

    const { rows } = await pool.query<{ id: string; agent_session_id: string | null }>(
        'select id, agent_session_id from conversation order by id',
    );

    assert.deepEqual(rows, [
        { id: 'conv-held', agent_session_id: null },
        { id: 'conv-late', agent_session_id: null },
    ]);
});

/**
 * Account deletion locks `user`, then `conversation` through its cascade.
 * Migration 0027_studio_session_owner adds a foreign key to `user`, so a clear
 * that locked `conversation` alone would hold it while waiting on `user`, and
 * a deletion in between would deadlock with it. Here a row lock holds the
 * migration inside the clear while an account deletion starts.
 */
test('migration 0027 and an account deletion lock their tables in one order', async (t) => {
    const { database, migrateRest } = await migratedTo(t, through26);
    const pool = database.adminPool();
    const [holder, deleter] = await Promise.all([
        database.adminPool().connect(),
        database.adminPool().connect(),
    ]);

    await pool.query(
        `insert into "user" (id, name, email) values ('user-ben', 'Ben', 'ben@example.org')`,
    );
    await insertConversation(pool, 'conv-held', 'user-ana', '');
    await insertConversation(pool, 'conv-ben', 'user-ben', 'harness-ben');

    try {
        await holder.query('begin');
        await holder.query(`select 1 from conversation where id = 'conv-held' for update`);

        const migrated = migrateRest();

        await untilWaiting(pool, migrated, 'transactionid');

        const deleted = deleter.query(`delete from "user" where id = 'user-ben'`);

        await untilWaiting(pool, migrated, 'relation');
        await holder.query('commit');
        await Promise.all([migrated, deleted]);
    } finally {
        for (const client of [holder, deleter]) client.release(true);
    }

    const { rows } = await pool.query<{ id: string }>('select id from conversation');

    assert.deepEqual(rows, [{ id: 'conv-held' }]);
});

/**
 * The dev database applied 0027_studio_session_owner before
 * 0027_clear_refused_harness_ids existed. drizzle-orm applies only journal
 * entries newer than the last one it recorded, so that database skips the
 * clear, whose `when` is earlier, and keeps the ids it stored.
 */
test('a database that applied 0027_studio_session_owner skips the clear', async (t) => {
    const { database, migrateRest } = await migratedTo(
        t,
        (entry) => entry.tag !== '0027_clear_refused_harness_ids',
    );
    const pool = database.adminPool();
    const applied = async () =>
        (await pool.query<{ n: number }>('select count(*)::int as n from __drizzle_migrations'))
            .rows[0]?.n;

    await pool.query(
        `insert into conversation (id, user_id, title, agent_session_id, data)
            values ('conv-old', 'user-ana', 'Chat', '', '{}')`,
    );

    const before = await applied();

    await migrateRest();

    assert.equal(await applied(), before);

    const { rows } = await pool.query<{ agent_session_id: string | null }>(
        `select agent_session_id from conversation where id = 'conv-old'`,
    );

    assert.deepEqual(rows, [{ agent_session_id: '' }]);
});

/**
 * A page's saves carry its `saveWriter` and a `saveSeq` it raises for each
 * snapshot. A save of that writer with a lower sequence that arrives last
 * changes nothing. A save from another writer, or with no order fields,
 * writes whatever its sequence or clock.
 */
test("a page's older save that arrives last leaves its newer one stored", async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());

    await db.insert(user).values({ id: 'user-ana', name: 'Ana', email: 'ana@example.org' });

    const save = (title: string, order: { saveWriter: string; saveSeq: number } | null) =>
        saveConversation(db, 'user-ana', {
            ...saved('conv-ana', null),
            title,
            ...order,
        } as SavedConversation);
    const stored = async () => {
        const [row] = await db
            .select({ title: conversation.title, data: conversation.data })
            .from(conversation)
            .where(eq(conversation.id, 'conv-ana'));

        return [row?.title, (row?.data as SavedConversation | undefined)?.title];
    };

    await save('Second', { saveWriter: 'page-1', saveSeq: 2 });
    await save('First', { saveWriter: 'page-1', saveSeq: 1 });

    assert.deepEqual(await stored(), ['Second', 'Second']);

    await save('Same sequence', { saveWriter: 'page-1', saveSeq: 2 });

    assert.deepEqual(await stored(), ['Same sequence', 'Same sequence']);

    await save('Other page', { saveWriter: 'page-2', saveSeq: 0 });

    assert.deepEqual(await stored(), ['Other page', 'Other page']);

    await save('No order', null);

    assert.deepEqual(await stored(), ['No order', 'No order']);

    await save('After no order', { saveWriter: 'page-2', saveSeq: 0 });

    assert.deepEqual(await stored(), ['After no order', 'After no order']);
});

/**
 * A turn claim by a user id with no user row raises, so the Studio proxy
 * answers 503, and leaves the harness conversation without an owner.
 */
test('a claim by an account with no user row raises and claims nothing', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());

    await assert.rejects(claimSessionOwner(db, 'harness-1', 'user-gone'));
    assert.deepEqual(await sessionOwners(db, 'harness-1'), []);
});
