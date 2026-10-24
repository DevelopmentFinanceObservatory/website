import os from 'node:os';
import path from 'node:path';
import { BigQuery } from '@google-cloud/bigquery';
import { bigQueryAccountTable, readAccountDaily, runAccountExport } from './account-export';
import { STATEMENT_TIMEOUT_MS } from './bounded';
import {
    buildRuntimePool,
    connectCloudSqlRuntime,
    resolveRuntimeConnection,
    setCloudSqlRuntimeStream,
} from './connection';
import {
    bigQueryWarehouse,
    CONNECTION_TIMEOUT_MS,
    type JobProgress,
    pgEventSource,
    readExportEnv,
    runAndExit,
    runExport,
    runExportJob,
} from './event-export';

// The event export Job's command (`node dist/export-events.cjs`, see
// deploy/Dockerfile). It reads the database as the runtime does, through
// WEBSITE_DB_* over the Cloud SQL connector, or DATABASE_URL locally, and
// runs the account export, then the event export (runExportJob), under
// runAndExit's deadline, which names the phase in `progress` if it fires.
async function main(progress: JobProgress): Promise<void> {
    const settings = readExportEnv();
    const connection = resolveRuntimeConnection();
    const cloudSql =
        connection.kind === 'cloud-sql' ? await connectCloudSqlRuntime(connection) : null;

    if (cloudSql) {
        setCloudSqlRuntimeStream(cloudSql.stream);
    }

    // One connection suffices, since the run sends one query at a time. A
    // query past 5 minutes fails on the server, and a connection not made
    // in 30 seconds fails the query that asked for it. Each call also has a
    // bound on the Job's side (db/bounded.ts). runAndExit stops the run at
    // 28 minutes whatever is in flight, inside the Job's 1800 s task timeout
    // and before the next hourly run starts, and its exit closes the pool
    // and the connector.
    const pool = buildRuntimePool(process.env, {
        max: 1,
        statement_timeout: STATEMENT_TIMEOUT_MS,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });

    const bigquery = new BigQuery({ projectId: settings.projectId });
    const log = (line: string) => console.log(line);

    await runExportJob({
        exportAccounts: () =>
            runAccountExport({
                read: () => readAccountDaily(pool),
                replace: bigQueryAccountTable({ datasetId: settings.datasetId, bigquery }),
                scratchFile: path.join(os.tmpdir(), `account-export-${process.pid}.ndjson`),
                log,
            }),
        exportEvents: () =>
            runExport({
                source: pgEventSource(pool),
                warehouse: bigQueryWarehouse({ ...settings, bigquery }),
                hmacKey: settings.hmacKey,
                today: new Date().toISOString().slice(0, 10),
                progress,
                scratchFile: path.join(os.tmpdir(), `event-export-${process.pid}.ndjson`),
                log,
            }),
        progress,
    });
}

// console.error prints the error's stack and its cause's.
void runAndExit(main, { logError: (error) => console.error('ERROR:', error) });
