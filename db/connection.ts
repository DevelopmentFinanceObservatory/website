import {
    AuthTypes,
    Connector,
    IpAddressTypes,
    type DriverOptions,
} from '@google-cloud/cloud-sql-connector';
import { Pool } from 'pg';

/**
 * The env var contract the migrate entrypoint and dfo-infra's Terraform
 * agree on. Only the names the Job actually reads live here.
 * WEBSITE_DB_USER is set on the runtime services rather than the
 * migration Job, so it falls outside this contract. WEBSITE_DB_HOST is
 * also set on the Job, but the connector dials the instance directly from
 * `instanceConnectionName`, so nothing here reads WEBSITE_DB_HOST.
 */
export interface MigratorEnv {
    databaseName: string;
    migratorDbUser: string;
    runtimeDbUser: string;
    instanceConnectionName: string;
}

function requiredEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`missing required environment variable ${name}`);
    }

    return value;
}

export function readMigratorEnv(): MigratorEnv {
    return {
        databaseName: requiredEnv('WEBSITE_DB_NAME'),
        migratorDbUser: requiredEnv('WEBSITE_MIGRATOR_DB_USER'),
        runtimeDbUser: requiredEnv('WEBSITE_RUNTIME_DB_USER'),
        instanceConnectionName: requiredEnv('WEBSITE_DB_INSTANCE_CONNECTION_NAME'),
    };
}

/**
 * One `pg.Pool` per process, authenticated as the migrator's IAM service
 * account over the Cloud SQL connector. This is the same PSC-only path the
 * runtime services use, just with `authType: 'IAM'` swapping in the
 * migrator's login for the runtime role's. `ipType: 'PSC'` is required
 * because the platform instance has no public IP.
 *
 * The connector opens a background refresh thread on construction, so both
 * it and the pool it backs are owned by the caller and must be closed
 * together. See `migrate.ts`'s shutdown. `max: 1` because this process
 * runs one migration batch, exits, and never serves concurrent queries.
 */
export async function buildMigratorPool(
    env: MigratorEnv,
): Promise<{ pool: Pool; connector: Connector }> {
    const connector = new Connector();
    const clientOpts = await connector.getOptions({
        instanceConnectionName: env.instanceConnectionName,
        authType: AuthTypes.IAM,
        ipType: IpAddressTypes.PSC,
    });
    const pool = new Pool({
        ...clientOpts,
        user: env.migratorDbUser,
        database: env.databaseName,
        max: 1,
    });

    return { pool, connector };
}

export interface CloudSqlRuntimeConnection {
    kind: 'cloud-sql';
    instanceConnectionName: string;
    user: string;
    database: string;
}

export interface UrlRuntimeConnection {
    kind: 'url';
    connectionString: string;
}

export type RuntimeConnection = CloudSqlRuntimeConnection | UrlRuntimeConnection;

/**
 * A loose stand-in for `NodeJS.ProcessEnv` for these two functions' `env`
 * parameter. Next augments `ProcessEnv` with a required, non-optional
 * `NODE_ENV`, which would force every caller (in particular
 * db/test/runtime-connection.test.ts's partial fixtures) to fill in
 * variables it doesn't care about.
 */
type EnvLike = Record<string, string | undefined>;

/**
 * Non-throwing check for which pool kind the runtime should build. Shared
 * by `resolveRuntimeConnection` below (full validation, safe to throw --
 * called from instrumentation.ts's `register()` at server start) and
 * src/lib/db/index.ts (must never throw at import, including during
 * `next build` with no env at all).
 */
export function isCloudSqlConfigured(env: EnvLike = process.env): boolean {
    return !!env.WEBSITE_DB_INSTANCE_CONNECTION_NAME;
}

/**
 * Resolves which database the runtime pool should connect to. Cloud SQL
 * (deployed services) wins whenever its instance var is set; a local
 * Postgres via DATABASE_URL is the fallback. Throws a clear error naming
 * the missing variable(s) otherwise -- safe here because this is only
 * called from instrumentation.ts's `register()` at server start, never at
 * module import time.
 */
export function resolveRuntimeConnection(env: EnvLike = process.env): RuntimeConnection {
    if (isCloudSqlConfigured(env)) {
        const missing = ['WEBSITE_DB_USER', 'WEBSITE_DB_NAME'].filter((name) => !env[name]);

        if (missing.length > 0) {
            throw new Error(
                `Cloud SQL runtime connection is missing required environment variable(s): ${missing.join(', ')}`,
            );
        }

        return {
            kind: 'cloud-sql',
            instanceConnectionName: env.WEBSITE_DB_INSTANCE_CONNECTION_NAME!,
            user: env.WEBSITE_DB_USER!,
            database: env.WEBSITE_DB_NAME!,
        };
    }

    if (env.DATABASE_URL) {
        return { kind: 'url', connectionString: env.DATABASE_URL };
    }

    throw new Error(
        'No runtime database configuration found: set WEBSITE_DB_INSTANCE_CONNECTION_NAME ' +
            '(with WEBSITE_DB_USER and WEBSITE_DB_NAME) for Cloud SQL, or DATABASE_URL for a local Postgres.',
    );
}

/**
 * Opens one `Connector` for the runtime pool's lifetime and resolves the
 * stream factory pg's `Pool` uses to dial Cloud SQL over PSC with IAM auth
 * -- the same path `buildMigratorPool` uses for the migrator role, just
 * authenticating as the runtime IAM database user instead. Called once
 * from instrumentation.ts's `register()`; the `Connector` is intentionally
 * never closed here (SIGTERM exits the process, same as the migrator's
 * shutdown note above but there is no request to await first).
 */
export async function connectCloudSqlRuntime(
    connection: CloudSqlRuntimeConnection,
): Promise<{ connector: Connector; stream: DriverOptions['stream'] }> {
    const connector = new Connector();
    const { stream } = await connector.getOptions({
        instanceConnectionName: connection.instanceConnectionName,
        authType: AuthTypes.IAM,
        ipType: IpAddressTypes.PSC,
    });

    return { connector, stream };
}

interface CloudSqlRuntimeGlobal {
    cloudSqlRuntimeStream?: DriverOptions['stream'];
}

const globalForCloudSqlRuntime = globalThis as unknown as CloudSqlRuntimeGlobal;

/**
 * Stores the stream factory `instrumentation.ts`'s `register()` resolved,
 * so src/lib/db/index.ts's pool can read it lazily at connect time without
 * importing the connector itself (index.ts must stay import-safe during
 * `next build`, and the connector is only ever constructed once, in
 * `register()`).
 */
export function setCloudSqlRuntimeStream(stream: DriverOptions['stream']): void {
    globalForCloudSqlRuntime.cloudSqlRuntimeStream = stream;
}

/**
 * Reads the stream factory `register()` stored. Throws only when actually
 * called -- i.e. when pg attempts a connection -- never at import, so a
 * misconfigured deploy still builds and starts; it just fails the first
 * request that touches the database.
 */
export function getCloudSqlRuntimeStream(): DriverOptions['stream'] {
    const stream = globalForCloudSqlRuntime.cloudSqlRuntimeStream;

    if (!stream) {
        throw new Error(
            "Cloud SQL stream factory is not set on globalThis -- instrumentation.ts's " +
                'register() must run before the runtime pool connects.',
        );
    }

    return stream;
}

/**
 * Builds the one runtime `pg.Pool`, shared by src/lib/db/index.ts and
 * db/test/runtime-pool.test.ts so both exercise the same construction
 * path. Picks the pool kind from `isCloudSqlConfigured` alone -- a
 * non-throwing check -- rather than the full, throwing
 * `resolveRuntimeConnection`, because this must never throw when called at
 * module import time (`next build` runs with no DB env at all):
 *
 * - Cloud SQL: `stream` is a function pg only calls when it actually opens
 *   a connection. It reads the factory `instrumentation.ts`'s `register()`
 *   stored on globalThis at that point, not now -- a clear error surfaces
 *   on the first connection attempt if `register()` never ran, not at
 *   import or build.
 * - URL: `connectionString` may be `undefined` here (no env at build); pg
 *   only fails to connect with it later.
 */
export function buildRuntimePool(env: EnvLike = process.env): Pool {
    if (isCloudSqlConfigured(env)) {
        return new Pool({
            stream: () => getCloudSqlRuntimeStream()(),
            user: env.WEBSITE_DB_USER,
            database: env.WEBSITE_DB_NAME,
            max: 5,
            idleTimeoutMillis: 30_000,
        });
    }

    return new Pool({
        connectionString: env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30_000,
    });
}
