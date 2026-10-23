import os from 'node:os';
import path from 'node:path';
import { BigQuery } from '@google-cloud/bigquery';
import { bigQueryAccountTable, readAccountDaily, runAccountExport } from './account-export';
import {
    buildRuntimePool,
    connectCloudSqlRuntime,
    resolveRuntimeConnection,
    setCloudSqlRuntimeStream,
} from './connection';
import { bigQueryWarehouse, pgEventSource, readExportEnv, runExport } from './event-export';

// The event export Job's command (`node dist/export-events.cjs`, see
// deploy/Dockerfile). It reads the database as the runtime does, through
// WEBSITE_DB_* over the Cloud SQL connector, or DATABASE_URL locally. It
// runs the account export, then the event export, and fails when either
// fails, so a failing one leaves the other's tables current.
async function main(): Promise<void> {
    const settings = readExportEnv();
    const connection = resolveRuntimeConnection();
    const cloudSql =
        connection.kind === 'cloud-sql' ? await connectCloudSqlRuntime(connection) : null;

    if (cloudSql) {
        setCloudSqlRuntimeStream(cloudSql.stream);
    }

    // One connection suffices, since the run sends one query at a time. A
    // query that runs past 5 minutes, the per-day count over the whole
    // table or a page read, fails the run, well inside the Job's 1800 s
    // task timeout, so a hung read ends before the next hourly run starts.
    const pool = buildRuntimePool(process.env, { max: 1, statement_timeout: 300_000 });

    const bigquery = new BigQuery({ projectId: settings.projectId });
    const log = (line: string) => console.log(line);

    try {
        let accountFailure: Error | null = null;

        try {
            await runAccountExport({
                read: () => readAccountDaily(pool),
                replace: bigQueryAccountTable({ datasetId: settings.datasetId, bigquery }),
                scratchFile: path.join(os.tmpdir(), `account-export-${process.pid}.ndjson`),
                log,
            });
        } catch (error) {
            accountFailure = new Error('account export failed', { cause: error });
            console.error('ERROR:', error instanceof Error ? error.stack : error);
        }

        await runExport({
            source: pgEventSource(pool),
            warehouse: bigQueryWarehouse({ ...settings, bigquery }),
            hmacKey: settings.hmacKey,
            today: new Date().toISOString().slice(0, 10),
            scratchFile: path.join(os.tmpdir(), `event-export-${process.pid}.ndjson`),
            log,
        });

        if (accountFailure !== null) {
            throw accountFailure;
        }
    } finally {
        // The pool first, so its connections close over the connector's tunnel.
        await pool.end();
        cloudSql?.connector.close();
    }
}

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
