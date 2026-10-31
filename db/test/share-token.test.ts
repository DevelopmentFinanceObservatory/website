import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import {
    deleteShareToken,
    fenceShareTokens,
    putShareToken,
    readShareToken,
    refreshFence,
    shareTokensFenced,
    unfenceShareTokens,
} from '../../src/lib/chat/shareTokens.ts';
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

    // A fenced account, or one gone, stores no token.
    await fenceShareTokens(db, 'other');
    assert.equal(
        await putShareToken(db, { ...other, shareId: 'Zz9yXw8v', writeToken: 'shw_x' }),
        false,
    );
    // A fence older than 15 minutes is one a failed deletion left behind.
    await database
        .runtimePool()
        .query(`update "user" set deleting_at = now() - interval '16 minutes' where id = 'other'`);
    assert.equal(
        await putShareToken(db, { ...other, shareId: 'Zz9yXw8v', writeToken: 'shw_x' }),
        true,
    );
    await deleteShareToken(db, { ...other, shareId: 'Zz9yXw8v' });

    // An attempt lifts only its own fence, and sets afresh only its own.
    const first = await fenceShareTokens(db, 'other');
    const second = await fenceShareTokens(db, 'other');

    assert.notEqual(first, second);
    assert.equal(await refreshFence(db, { userId: 'other', fence: first }), null);
    await unfenceShareTokens(db, { userId: 'other', fence: first });
    assert.equal(await shareTokensFenced(db, 'other'), true);

    const refreshed = await refreshFence(db, { userId: 'other', fence: second });

    assert.ok(refreshed !== null && refreshed !== second);
    await unfenceShareTokens(db, { userId: 'other', fence: refreshed });
    assert.equal(await shareTokensFenced(db, 'other'), false);

    await database.runtimePool().query(`delete from "user" where id = 'owner'`);
    assert.equal(
        await putShareToken(db, { ...owner, shareId: 'Zz9yXw8v', writeToken: 'shw_x' }),
        false,
    );
    assert.equal(await putShareToken(db, { ...other, writeToken: 'shw_theirs' }), true);
    assert.equal(await readShareToken(db, other), 'shw_theirs');
});
