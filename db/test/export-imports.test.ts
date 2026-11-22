import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

// The repository's own lint config, the one `pnpm lint` and CI run.
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../..') });

test('the export modules may not import a Postgres or BigQuery client or a pool builder', async (t) => {
    // Lines 1 to 4 import what the export modules may not, and line 5 the
    // Cloud SQL setup export-events.ts needs.
    const source = [
        "import { Pool } from 'pg';",
        "import type { TableField } from '@google-cloud/bigquery';",
        "import { buildRuntimePool } from './connection';",
        "import { buildCounterPool } from './connection.ts';",
        "import { setCloudSqlRuntimeStream } from './connection';",
        'export type Clients = Pool | TableField;',
        'export const used = [buildRuntimePool, buildCounterPool, setCloudSqlRuntimeStream];',
    ];

    for (const file of ['db/event-export.ts', 'db/account-export.ts', 'db/export-events.ts']) {
        await t.test(file, async () => {
            const [result] = await eslint.lintText(`${source.join('\n')}\n`, {
                filePath: file,
            });

            assert.deepEqual(
                result?.messages.map(({ ruleId, line }) => [ruleId, line]),
                [1, 2, 3, 4].map((line) => ['no-restricted-imports', line]),
            );
        });
    }
});
