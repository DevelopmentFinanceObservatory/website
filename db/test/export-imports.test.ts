import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

// The repository's own lint config, the one `pnpm lint` and CI run.
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../..') });

test('the export modules may not import a Postgres or BigQuery client', async (t) => {
    const source = [
        "import { Pool } from 'pg';",
        "import type { TableField } from '@google-cloud/bigquery';",
        'export type Clients = Pool | TableField;',
    ];

    for (const file of ['db/event-export.ts', 'db/account-export.ts', 'db/export-events.ts']) {
        await t.test(file, async () => {
            const [result] = await eslint.lintText(`${source.join('\n')}\n`, {
                filePath: file,
            });

            assert.deepEqual(
                result?.messages.map(({ ruleId, line }) => [ruleId, line]),
                [
                    ['no-restricted-imports', 1],
                    ['no-restricted-imports', 2],
                ],
            );
        });
    }
});
