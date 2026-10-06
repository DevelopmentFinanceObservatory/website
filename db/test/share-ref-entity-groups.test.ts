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

const core = {
    identity_version: 'spec1',
    entities: { origin: ['country/DEU', 'country/FRA'] },
    requested_window: { kind: 'all' },
};
const eu = { origin: { dcid: 'EuropeanUnion', label: 'EU member states' } };
const g7 = { origin: { dcid: null, label: 'G7 countries' } };

type StoredRef = { identity: object; entity_groups: object | null };

/**
 * Each case migrates a database through `from`, stores `rows` as shares of
 * that state hold them, then applies every later migration. `entity_groups`
 * ends in the `entity_groups` column, a filled column keeps its value, and
 * the rest of the identity, and every row without the member, stays as it
 * was.
 */
const cases: { name: string; from: number; rows: StoredRef[]; groups: (object | null)[] }[] = [
    {
        name: 'migration 0013 moves entity_groups from the identity to its column',
        from: 10,
        rows: [
            { identity: { ...core, entity_groups: eu }, entity_groups: null },
            { identity: { ...core, entity_groups: g7 }, entity_groups: null },
            { identity: { ...core, entity_groups: null }, entity_groups: null },
            { identity: core, entity_groups: null },
        ],
        groups: [eu, g7, null, null],
    },
    {
        name: 'migration 0014 clears entity_groups from an identity and keeps a filled column',
        from: 13,
        rows: [
            { identity: { ...core, entity_groups: eu }, entity_groups: eu },
            { identity: { ...core, entity_groups: g7 }, entity_groups: null },
            { identity: { ...core, entity_groups: null }, entity_groups: eu },
            { identity: { ...core, entity_groups: g7 }, entity_groups: eu },
            { identity: core, entity_groups: eu },
        ],
        groups: [eu, g7, eu, eu, eu],
    },
];

for (const { name, from, rows: stored, groups } of cases) {
    test(name, async (t) => {
        const database = await createTestDatabase();
        const start = migrationsThrough(from);
        t.after(() => database.teardown());
        t.after(() => fs.rmSync(start, { recursive: true, force: true }));

        const migrate = (migrationsFolder: string) =>
            applyMigrations(database.migratorPool(), {
                migrationsFolder,
                runtimeDbUser: database.runtimeUser,
                migratorDbUser: database.migratorUser,
            });

        await migrate(start);

        const pool = database.adminPool();
        // A database at migration 0010 has no `entity_groups` column.
        const columns = from < 12 ? ['identity'] : ['identity', 'entity_groups'];

        await pool.query(
            `insert into share (id, kind, title, data) values ('srch0001', 'search', 'A share', '{}')`,
        );
        for (const [partIndex, row] of stored.entries()) {
            await pool.query(
                `insert into share_ref (share_id, part_index, spec_id, ${columns.join(', ')})
                 values ('srch0001', $1, 'spec_a1', ${columns.map((_, at) => `$${at + 2}::jsonb`).join(', ')})`,
                [
                    partIndex,
                    ...columns.map((column) => {
                        const value = row[column as keyof StoredRef];

                        return value && JSON.stringify(value);
                    }),
                ],
            );
        }

        await migrate(MIGRATIONS_FOLDER);

        const { rows } = await pool.query<StoredRef>(
            'select identity, entity_groups from share_ref order by part_index',
        );

        assert.deepEqual(
            rows.map((row) => row.entity_groups),
            groups,
        );
        for (const row of rows) {
            assert.deepEqual(row.identity, core);
        }
    });
}
