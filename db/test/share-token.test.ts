import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import { deleteShareToken, putShareToken, readShareToken } from '../../src/lib/chat/shareTokens.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { importShareTokens, readTokenLines } from '../share-token-import.ts';
import { user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');
const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/import-share-tokens.ts');
const run = promisify(execFile);

/**
 * `shareTokens.ts` against the migrated tables as the runtime role: a user
 * reads back the token they put and replaces it, another user neither reads
 * nor overwrites it, and deleting the user deletes their tokens.
 */
test('share write tokens', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());

    await db.insert(user).values([
        { id: 'owner', name: 'O', email: 'o@one.org' },
        { id: 'other', name: 'X', email: 'x@one.org' },
    ]);

    const owner = { shareId: 'Ab3dEf7h', userId: 'owner' };
    const other = { shareId: 'Ab3dEf7h', userId: 'other' };

    assert.equal(await readShareToken(db, owner), null);
    assert.equal(await putShareToken(db, { ...owner, writeToken: 'shw_one' }), true);
    assert.equal(await readShareToken(db, owner), 'shw_one');
    assert.equal(await putShareToken(db, { ...owner, writeToken: 'shw_two' }), true);
    assert.equal(await readShareToken(db, owner), 'shw_two');

    // Putting the token already held changes nothing; a new token restamps the row.
    const createdAt = async () =>
        (
            await database
                .runtimePool()
                .query<{ created_at: string }>(
                    'select created_at::text from share_token where share_id = $1',
                    [owner.shareId],
                )
        ).rows.map((row) => row.created_at);
    const stamped = await createdAt();

    assert.equal(await putShareToken(db, { ...owner, writeToken: 'shw_two' }), true);
    assert.deepEqual(await createdAt(), stamped);
    assert.equal(await putShareToken(db, { ...owner, writeToken: 'shw_three' }), true);
    assert.notDeepEqual(await createdAt(), stamped);
    assert.equal(await putShareToken(db, { ...owner, writeToken: 'shw_two' }), true);

    assert.equal(await readShareToken(db, other), null);
    assert.equal(await putShareToken(db, { ...other, writeToken: 'shw_theirs' }), false);
    assert.equal(await readShareToken(db, owner), 'shw_two');

    await deleteShareToken(db, other);
    assert.equal(await readShareToken(db, owner), 'shw_two');
    await deleteShareToken(db, owner);
    assert.equal(await readShareToken(db, owner), null);
    assert.equal(await putShareToken(db, { ...owner, writeToken: 'shw_two' }), true);

    await database.runtimePool().query(`delete from "user" where id = 'owner'`);
    assert.equal(await putShareToken(db, { ...other, writeToken: 'shw_theirs' }), true);
    assert.equal(await readShareToken(db, other), 'shw_theirs');
});

/**
 * scripts/import-share-tokens.ts over a migrated database: a run stores each
 * signed-in owner's token, a second run of the same file stores the same
 * rows again, a share whose owner is gone is skipped, and a file with an
 * unreadable line stores nothing.
 */
test("the token import stores each owner's token once, however often it runs", async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const pool = database.runtimePool();

    await pool.query(
        `insert into "user" (id, name, email) values ('owner', 'O', 'o@one.org'), ('other', 'X', 'x@one.org')`,
    );

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'share-tokens-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    const file = path.join(dir, 'tokens.jsonl');
    const lines = [
        { id: 'Ab3dEf7h', owner: 'owner', write_token: 'shw_a' },
        { id: 'Zy9xWv8u', owner: 'other', write_token: 'shw_b' },
        { id: 'Gone0001', owner: 'deleted', write_token: 'shw_c' },
    ];

    await fs.writeFile(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

    const env = {
        ...process.env,
        DATABASE_URL: `postgres://${database.runtimeUser}:${database.runtimePassword}@${process.env.PGHOST ?? 'localhost'}:${process.env.PGPORT ?? 5433}/${database.databaseName}`,
    };
    const tokens = async () =>
        (
            await pool.query<{ share_id: string; user_id: string; write_token: string }>(
                'select share_id, user_id, write_token from share_token order by share_id',
            )
        ).rows.map(({ share_id: id, user_id: owner, write_token: token }) => [id, owner, token]);
    const stored = [
        ['Ab3dEf7h', 'owner', 'shw_a'],
        ['Zy9xWv8u', 'other', 'shw_b'],
    ];

    await run(process.execPath, [SCRIPT, '--in', file], { env });
    assert.deepEqual(await tokens(), stored);

    // A second import of the same lines stores the same rows and skips the
    // share whose owner is gone.
    assert.deepEqual(await importShareTokens(drizzle(pool), lines), {
        stored: 2,
        ownerGone: ['Gone0001'],
        heldByOther: [],
    });
    assert.deepEqual(await tokens(), stored);

    // A token another user holds is left as it was and fails the run.
    const clash = path.join(dir, 'clash.jsonl');

    await fs.writeFile(clash, `${JSON.stringify({ ...lines[0], owner: 'other' })}\n`);

    const refusedClash = await run(process.execPath, [SCRIPT, '--in', clash], { env }).catch(
        (error: { code: number; stderr: string }) => error,
    );

    assert.equal('code' in refusedClash && refusedClash.code, 1);
    assert.equal(
        await readShareToken(drizzle(pool), { shareId: 'Ab3dEf7h', userId: 'owner' }),
        'shw_a',
    );

    // One unreadable line refuses the whole file.
    const bad = path.join(dir, 'bad.jsonl');

    await fs.writeFile(
        bad,
        `${JSON.stringify({ id: 'New00001', owner: 'owner', write_token: 'shw_d' })}\n{"id": "short"}\n`,
    );

    const refused = await run(process.execPath, [SCRIPT, '--in', bad], { env }).catch(
        (error: { code: number; stderr: string }) => error,
    );

    assert.equal('code' in refused && refused.code, 1);
    assert.equal(
        await readShareToken(drizzle(pool), { shareId: 'New00001', userId: 'owner' }),
        null,
    );
});

test('a token file line needs an 8-character id, an owner and a shw_ token', () => {
    const text = [
        JSON.stringify({ id: 'Ab3dEf7h', owner: 'u', write_token: 'shw_a' }),
        '',
        JSON.stringify({ id: 'Ab3dEf7', owner: 'u', write_token: 'shw_a' }),
        JSON.stringify({ id: 'Ab3dEf7h', owner: '', write_token: 'shw_a' }),
        JSON.stringify({ id: 'Ab3dEf7h', owner: 'u', write_token: 'cmw_a' }),
        'not json',
    ].join('\n');

    assert.deepEqual(readTokenLines(text), {
        lines: [{ id: 'Ab3dEf7h', owner: 'u', write_token: 'shw_a' }],
        invalid: [3, 4, 5, 6],
    });
});
