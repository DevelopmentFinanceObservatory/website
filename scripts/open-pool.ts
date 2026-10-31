import type { Pool } from 'pg';

import {
    buildRuntimePool,
    connectCloudSqlRuntime,
    resolveRuntimeConnection,
    setCloudSqlRuntimeStream,
} from '../db/connection.ts';

/**
 * A one-connection pool for a maintenance script, on DATABASE_URL or on the
 * WEBSITE_DB_* Cloud SQL variables the runtime uses, and the function that
 * closes it.
 */
export const openPool = async (): Promise<{ pool: Pool; close: () => Promise<void> }> => {
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
