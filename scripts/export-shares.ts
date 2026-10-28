// Writes every share made at or after --since as the JSON lines
// docs/share-export.md defines, for dfo-apis' `import-shares`.
// db/share-export.ts holds the queries and the placement of each share.
//
//   node scripts/export-shares.ts --since 2026-10-01T00:00:00Z               # to stdout
//   node scripts/export-shares.ts --since 2026-10-01T00:00:00Z --out shares.jsonl
//
// It reads the database from DATABASE_URL, or from the WEBSITE_DB_* Cloud
// SQL variables the runtime uses, and writes nothing to it. A share it
// cannot place fails the run with every such share named on stderr, and
// no output is written.
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

import type { Pool } from 'pg';

import {
    buildRuntimePool,
    connectCloudSqlRuntime,
    resolveRuntimeConnection,
    setCloudSqlRuntimeStream,
} from '../db/connection.ts';
import { exportShares, readShares } from '../db/share-export.ts';

const USAGE = `usage: node scripts/export-shares.ts --since <ISO timestamp with offset> [--out <file>]

  --since  export shares created at or after this moment, e.g. 2026-10-01T00:00:00Z
  --out    write the lines to this file instead of stdout`;

// An offset is required, so the moment does not depend on the session's
// time zone.
const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const openPool = async (): Promise<{ pool: Pool; close: () => Promise<void> }> => {
    const connection = resolveRuntimeConnection();

    if (connection.kind === 'url') {
        const pool = buildRuntimePool(process.env, { max: 1 });

        return { pool, close: () => pool.end() };
    }

    const { connector, stream } = await connectCloudSqlRuntime(connection);

    setCloudSqlRuntimeStream(stream);

    const pool = buildRuntimePool(process.env, { max: 1 });

    return {
        pool,
        close: async () => {
            await pool.end();
            connector.close();
        },
    };
};

const main = async (): Promise<void> => {
    const { values } = parseArgs({
        options: {
            since: { type: 'string' },
            out: { type: 'string' },
            help: { type: 'boolean', default: false },
        },
    });
    const { since } = values;

    if (values.help || !since || !WITH_OFFSET.test(since) || Number.isNaN(Date.parse(since))) {
        console.error(USAGE);
        process.exitCode = values.help ? 0 : 2;

        return;
    }

    const { pool, close } = await openPool();

    try {
        const { lines, refusals } = exportShares(await readShares(pool, since));

        if (refusals.length) {
            for (const { id, reason } of refusals) {
                console.error(`share ${id}: ${reason}`);
            }

            console.error(
                `${refusals.length} shares cannot be placed; nothing written. ` +
                    'docs/share-export.md says where each case lands.',
            );
            process.exitCode = 1;

            return;
        }

        const text = lines.map((line) => `${JSON.stringify(line)}\n`).join('');

        if (values.out) {
            await fs.writeFile(values.out, text);
        } else {
            process.stdout.write(text);
        }

        const counts = Object.entries(
            Object.groupBy(lines, ({ kind, mode }) => `${kind} ${mode}`),
        ).map(([key, group]) => `${key} ${group?.length ?? 0}`);

        console.error(
            `${lines.length} shares exported since ${since}${counts.length ? `: ${counts.join(', ')}` : ''}`,
        );
    } finally {
        await close();
    }
};

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
