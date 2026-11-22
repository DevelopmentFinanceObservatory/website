import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

// The repository's own lint config, the one `pnpm lint` and CI run.
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../..') });

test('the export modules may not import a Postgres or BigQuery client or a pool builder', async (t) => {
    // Each line but the allowed ones imports what the export modules may not,
    // and the lint rule named beside it flags that line.
    const lines: [string, string | null][] = [
        ["import { Pool } from 'pg';", 'no-restricted-imports'],
        ["import Client from 'pg/lib/client';", 'no-restricted-imports'],
        ["import PgPool from 'pg-pool';", 'no-restricted-imports'],
        ["import type { TableField } from '@google-cloud/bigquery';", 'no-restricted-imports'],
        [
            "import { Table } from '@google-cloud/bigquery/build/src/table';",
            'no-restricted-imports',
        ],
        ["import { Storage } from '@google-cloud/storage';", 'no-restricted-imports'],
        ["export { BigQuery } from '@google-cloud/bigquery';", 'no-restricted-imports'],
        ["import { buildRuntimePool } from './connection';", 'no-restricted-imports'],
        ["import { buildCounterPool } from './connection.ts';", 'no-restricted-imports'],
        ["import { buildMigratorPool } from '../db/connection';", 'no-restricted-imports'],
        // The Cloud SQL setup export-events.ts needs.
        ["import { setCloudSqlRuntimeStream } from './connection';", null],
        [
            'export const used = [Pool, Client, PgPool, Table, Storage, buildRuntimePool, buildCounterPool, buildMigratorPool, setCloudSqlRuntimeStream];',
            null,
        ],
        ['export type Field = TableField;', null],
        ["export const later = () => import('pg');", 'no-restricted-syntax'],
        ['export const named = (name: string) => import(name);', 'no-restricted-syntax'],
        ["export const old = () => require('pg');", '@typescript-eslint/no-require-imports'],
    ];
    const source = `${lines.map(([line]) => line).join('\n')}\n`;
    const flagged = lines.flatMap(([, rule], index) => (rule === null ? [] : [[rule, index + 1]]));

    for (const file of ['db/event-export.ts', 'db/account-export.ts', 'db/export-events.ts']) {
        await t.test(file, async () => {
            const [result] = await eslint.lintText(source, { filePath: file });

            assert.deepEqual(
                result?.messages.map(({ ruleId, line }) => [ruleId, line]),
                flagged,
            );
        });
    }
});
