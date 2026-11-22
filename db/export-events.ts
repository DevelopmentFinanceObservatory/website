import os from 'node:os';
import path from 'node:path';
import { BigQuery } from '@google-cloud/bigquery';
import {
    ACCOUNT_READ_MS,
    bigQueryAccountTable,
    readAccounts,
    runAccountExport,
} from './account-export';
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
    JOB_DEADLINE_MS,
    runAndExit,
    runExport,
    runExportJob,
} from './event-export';

// The event export Job's command (`node dist/export-events.cjs`, see
// deploy/Dockerfile). It reads the database as the runtime does, through
// WEBSITE_DB_* over the Cloud SQL connector, or DATABASE_URL locally, and
// runs the event export (runExportJob), then the account export, under
// runAndExit's deadline, which names the phase in `progress` if it fires.
// What the account export keeps for its loads when the event export has used
// most of the Job's time, so the read's own timeout fires before runAndExit's.
const ACCOUNT_LOAD_RESERVE_MS = 2 * 60_000;

async function main(progress: JobProgress): Promise<void> {
    const startedAt = Date.now();
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
                read: () =>
                    readAccounts(pool, {
                        timeoutMs: Math.max(
                            0,
                            Math.min(
                                ACCOUNT_READ_MS,
                                JOB_DEADLINE_MS -
                                    (Date.now() - startedAt) -
                                    ACCOUNT_LOAD_RESERVE_MS,
                            ),
                        ),
                    }),
                replace: bigQueryAccountTable({ datasetId: settings.datasetId, bigquery }),
                hmacKey: settings.hmacKey,
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
