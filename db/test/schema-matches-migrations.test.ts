import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { applyMigrations } from '../apply-migrations.ts';
import * as schema from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

type Columns = Record<string, Record<string, 'nullable' | 'not null'>>;

/**
 * The migrations and db/schema.ts describe the same tables: every column's
 * name and nullability, in both directions. A column in one and absent from
 * the other makes `drizzle-kit generate` propose a change nobody asked for.
 */
test('the migrated database has the columns db/schema.ts declares', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const declared: Columns = {};

    for (const table of Object.values(schema)) {
        if (!is(table, PgTable)) continue;

        const { name, columns } = getTableConfig(table);

        declared[name] = Object.fromEntries(
            columns.map((column) => [column.name, column.notNull ? 'not null' : 'nullable']),
        );
    }

    const { rows } = await database.adminPool().query<{
        table_name: string;
        column_name: string;
        is_nullable: 'YES' | 'NO';
    }>(
        `select table_name, column_name, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name <> '__drizzle_migrations'`,
    );
    const migrated: Columns = {};

    for (const row of rows) {
        (migrated[row.table_name] ??= {})[row.column_name] =
            row.is_nullable === 'YES' ? 'nullable' : 'not null';
    }

    assert.deepEqual(migrated, declared);
});
