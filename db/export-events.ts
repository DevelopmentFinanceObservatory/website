import os from 'node:os';
import path from 'node:path';
import {
    buildRuntimePool,
    connectCloudSqlRuntime,
    resolveRuntimeConnection,
    setCloudSqlRuntimeStream,
} from './connection';
import { bigQueryWarehouse, pgEventSource, readExportEnv, runExport } from './event-export';

// The event export Job's command (`node dist/export-events.cjs`, see
// deploy/Dockerfile). It reads the database as the runtime does, through
// WEBSITE_DB_* over the Cloud SQL connector, or DATABASE_URL locally.
async function main(): Promise<void> {
    const settings = readExportEnv();
    const connection = resolveRuntimeConnection();
    const cloudSql =
        connection.kind === 'cloud-sql' ? await connectCloudSqlRuntime(connection) : null;

    if (cloudSql) {
        setCloudSqlRuntimeStream(cloudSql.stream);
    }

    // One connection suffices, since the run reads one page at a time.
    const pool = buildRuntimePool(process.env, { max: 1 });

    try {
        await runExport({
            source: pgEventSource(pool),
            warehouse: bigQueryWarehouse(settings),
            hmacKey: settings.hmacKey,
            today: new Date().toISOString().slice(0, 10),
            scratchFile: path.join(os.tmpdir(), `event-export-${process.pid}.ndjson`),
            log: (line) => console.log(line),
        });
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
