import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { applyMigrations } from '../apply-migrations.ts';
import { share, shareRef } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * A `share_ref` row written through db/schema.ts as the runtime role reads
 * back with its groups in `entity_groups`, beside an identity that holds
 * none, and with null for a part that has no group. Its `assumptions` read
 * back as stored, [] included, and null for a row written without them, as
 * a share stored before the column holds.
 */
test("a share_ref row keeps a part's groups beside its identity, and its assumptions", async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());
    const identity = { identity_version: 'spec1', entities: { origin: ['country/DEU'] } };
    const groups = {
        origin: { ref: 'africa', label: 'Africa', entity_type: 'Continent' },
    };
    const assumptions = [
        {
            kind: 'declared_default',
            binding_ref: 'how:flowType',
            refs: ['ODA'],
            text: 'official development assistance',
        },
    ];

    await db.insert(share).values({
        id: 'srch0001',
        kind: 'search',
        mode: 'live',
        title: 'aid from the EU',
        data: { query: 'aid from the EU' },
    });
    await db.insert(shareRef).values([
        {
            shareId: 'srch0001',
            partIndex: 0,
            specId: 'spec_a',
            identity,
            entityGroups: groups,
            assumptions,
        },
        {
            shareId: 'srch0001',
            partIndex: 1,
            specId: 'spec_b',
            identity,
            entityGroups: null,
            assumptions: [],
        },
        { shareId: 'srch0001', partIndex: 2, specId: 'spec_c', identity, entityGroups: null },
    ]);

    const refs = await db
        .select()
        .from(shareRef)
        .where(eq(shareRef.shareId, 'srch0001'))
        .orderBy(shareRef.partIndex);

    assert.deepEqual(
        refs.map((ref) => [ref.identity, ref.entityGroups, ref.assumptions]),
        [
            [identity, groups, assumptions],
            [identity, null, []],
            [identity, null, null],
        ],
    );
});
