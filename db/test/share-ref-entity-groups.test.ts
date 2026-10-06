import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMigrations } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/** A copy of the migrations folder whose journal stops after migration `last`. */
function migrationsThrough(last: number): string {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'website-migrations-through-'));
    const journalPath = path.join(folder, 'meta', '_journal.json');

    fs.cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= last);
    fs.writeFileSync(journalPath, JSON.stringify(journal));

    return folder;
}

/**
 * Proves migrations 0011 to 0013 carry a database at migration 0010, with
 * shares stored, to the current schema: `entity_groups` moves out of each
 * stored identity into the `entity_groups` column, and the rest of the
 * identity, and every row without the member, stays as it was.
 */
test('migration 0013 moves entity_groups from the identity to its column', async (t) => {
    const database = await createTestDatabase();
    const through0010 = migrationsThrough(10);
    t.after(() => database.teardown());
    t.after(() => fs.rmSync(through0010, { recursive: true, force: true }));

    const migrate = (migrationsFolder: string) =>
        applyMigrations(database.migratorPool(), {
            migrationsFolder,
            runtimeDbUser: database.runtimeUser,
            migratorDbUser: database.migratorUser,
        });

    await migrate(through0010);

    const pool = database.adminPool();
    const core = {
        identity_version: 'spec1',
        entities: { origin: ['country/DEU', 'country/FRA'] },
        requested_window: { kind: 'all' },
    };
    const eu = { origin: { dcid: 'EuropeanUnion', label: 'EU member states' } };
    const g7 = { origin: { dcid: null, label: 'G7 countries' } };
    const insert = (partIndex: number, identity: object) =>
        pool.query(
            `insert into share_ref (share_id, part_index, spec_id, identity)
             values ('srch0001', $1, 'spec_a1', $2::jsonb)`,
            [partIndex, JSON.stringify(identity)],
        );

    await pool.query(
        `insert into share (id, kind, title, data) values ('srch0001', 'search', 'A share', '{}')`,
    );
    await insert(0, { ...core, entity_groups: eu });
    await insert(1, { ...core, entity_groups: g7 });
    await insert(2, { ...core, entity_groups: null });
    await insert(3, core);

    await migrate(MIGRATIONS_FOLDER);

    const { rows } = await pool.query<{ identity: object; entity_groups: object | null }>(
        'select identity, entity_groups from share_ref order by part_index',
    );

    assert.deepEqual(
        rows.map((row) => row.entity_groups),
        [eu, g7, null, null],
    );
    for (const row of rows) {
        assert.deepEqual(row.identity, core);
    }
});
