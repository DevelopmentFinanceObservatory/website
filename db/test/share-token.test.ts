import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import { putShareToken, readShareToken } from '../../src/lib/chat/shareTokens.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

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

    assert.equal(await readShareToken(db, other), null);
    assert.equal(await putShareToken(db, { ...other, writeToken: 'shw_theirs' }), false);
    assert.equal(await readShareToken(db, owner), 'shw_two');

    await database.runtimePool().query(`delete from "user" where id = 'owner'`);
    assert.equal(await putShareToken(db, { ...other, writeToken: 'shw_theirs' }), true);
    assert.equal(await readShareToken(db, other), 'shw_theirs');
});
