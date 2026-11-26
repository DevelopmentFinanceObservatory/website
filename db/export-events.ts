import os from 'node:os';
import path from 'node:path';
import {
    ACCOUNT_STATEMENT_MS,
    bigQueryAccountTable,
    readAccounts,
    readConversations,
    runAccountExport,
} from './account-export';
import { exportBigQuery, exportDb, exportPool } from './bounded';
import {
    connectCloudSqlRuntime,
    resolveRuntimeConnection,
    setCloudSqlRuntimeStream,
} from './connection';
import {
    bigQueryWarehouse,
    EVENT_STATEMENT_MS,
    type JobProgress,
    pgEventSource,
    readExportEnv,
    REPORT_MARGIN_MS,
    runAndExit,
    runExport,
    runExportJob,
} from './event-export';
import { pgExportLock, runExampleExport } from './example-export';

// The export Job's command (`node dist/export-events.cjs`, see
// deploy/Dockerfile). It reads the database as the runtime does, through
// WEBSITE_DB_* over the Cloud SQL connector, or DATABASE_URL locally, and
// runs the event export, the account export (each on a pool of its own) and
// the Studio example export (db/example-export.ts) at once (runExportJob),
// under runAndExit's deadline, which names each phase's step in `progress`
// if it fires. runAndExit stops the
// run at 28 minutes whatever is in flight, inside the Job's 1800 s task
// timeout and before the next hourly run starts, and its exit closes the
// pools and the connector.

// How long a run waits for another execution's example merge to end.
const EXAMPLE_LOCK_WAIT_MS = 5 * 60_000;

async function main(progress: JobProgress, deadlineAt: number): Promise<void> {
    const settings = readExportEnv();
    const connection = resolveRuntimeConnection();
    const cloudSql =
        connection.kind === 'cloud-sql' ? await connectCloudSqlRuntime(connection) : null;

    if (cloudSql) {
        setCloudSqlRuntimeStream(cloudSql.stream);
    }

    const events = exportDb(exportPool(process.env, { statementMs: EVENT_STATEMENT_MS }));
    const accounts = exportDb(exportPool(process.env, { statementMs: ACCOUNT_STATEMENT_MS }));
    // The example merge's lock holds this pool's one connection while it waits and merges.
    const examples = exportPool(process.env, { statementMs: EXAMPLE_LOCK_WAIT_MS });
    // Read once, before both phases, when EXPORT_BQ_LOCATION leaves the location unset.
    const bigquery = await exportBigQuery(settings);
    const log = (line: string) => console.log(line);

    await runExportJob({
        exportAccounts: () =>
            runAccountExport({
                readAccounts: () => readAccounts(accounts),
                readConversations: () => readConversations(accounts),
                replace: bigQueryAccountTable(bigquery),
                hmacKey: settings.hmacKey,
                scratchFile: path.join(os.tmpdir(), `account-export-${process.pid}.ndjson`),
                log,
                progress,
            }),
        exportEvents: () =>
            runExport({
                source: pgEventSource(events),
                warehouse: bigQueryWarehouse({ bigquery }),
                hmacKey: settings.hmacKey,
                today: new Date().toISOString().slice(0, 10),
                progress,
                stopAt: deadlineAt - REPORT_MARGIN_MS,
                scratchFile: path.join(os.tmpdir(), `event-export-${process.pid}.ndjson`),
                log,
            }),
        exportExamples: () => runExampleExport({ bigquery, lock: pgExportLock(examples), log }),
        progress,
    });
}

// console.error prints the error's stack and its cause's.
void runAndExit(main, { logError: (error) => console.error('ERROR:', error) });
