import { Client } from 'pg';

// Only letters, digits, and underscores -- every identifier this module
// quotes is a fixed local name (db/migrate-local.ts) or a randomly
// generated `test_*` suffix (db/test/harness.ts), never user input. This
// still guards against a typo turning into a broken-out-of-the-quotes SQL
// string, the same concern apply-migrations.ts's VALID_IDENTIFIER guards
// against for its own, differently-shaped identifiers (SA emails).
const VALID_IDENTIFIER = /^[A-Za-z0-9_]+$/;

function quoteIdentifier(name: string): string {
    if (!VALID_IDENTIFIER.test(name)) {
        throw new Error(`invalid identifier: ${JSON.stringify(name)}`);
    }

    return `"${name}"`;
}

// `create/alter role ... password '...'` has no placeholder for the password
// (Postgres's role DDL doesn't accept query parameters there), so unlike the
// rest of this module's DDL we can't lean on $1 binding. Doubling embedded
// single quotes is the standard SQL-literal escape and keeps a password
// containing a `'` from breaking out of the string, mirroring the defense
// quoteIdentifier gives the identifier half of the same statements.
function quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export interface AdminConnection {
    host: string;
    port: number;
    user: string;
    password: string;
}

export interface DatabaseRolesOptions {
    databaseName: string;
    migratorUser: string;
    migratorPassword: string;
    runtimeUser: string;
    runtimePassword: string;
}

/**
 * Creates the role if it doesn't exist, otherwise resets its password. The
 * latter keeps a re-run (`just db-migrate` a second time, or a developer
 * who edited the dev password) converging on the requested state instead
 * of silently keeping whatever password the role happened to be created
 * with.
 */
async function ensureRole(client: Client, roleName: string, password: string): Promise<void> {
    const quotedRole = quoteIdentifier(roleName);
    const { rows } = await client.query('select 1 from pg_roles where rolname = $1', [roleName]);

    const quotedPassword = quoteLiteral(password);

    if (rows.length === 0) {
        await client.query(`create role ${quotedRole} login password ${quotedPassword}`);
    } else {
        await client.query(`alter role ${quotedRole} with login password ${quotedPassword}`);
    }
}

async function ensureDatabaseExists(client: Client, databaseName: string): Promise<void> {
    const { rows } = await client.query('select 1 from pg_database where datname = $1', [
        databaseName,
    ]);

    if (rows.length === 0) {
        await client.query(`create database ${quoteIdentifier(databaseName)}`);
    }
}

/**
 * Idempotently brings a local Postgres server to the same role/grant shape
 * dfo-infra's Terraform gives the migrator and runtime roles on Cloud SQL
 * (mirrored by db/test/harness.ts for tests): two login roles, the target
 * database, CONNECT + CREATE on the database for the migrator, CONNECT
 * only for the runtime role, PUBLIC's default CONNECT revoked from the
 * database (GRANT before REVOKE, same order Terraform's provision script
 * uses), and CREATE + USAGE on schema `public` for the migrator plus USAGE
 * for the runtime role (migration 0000's ALTER DEFAULT PRIVILEGES then
 * extends the runtime role's read/write down to every table the migrator
 * creates).
 *
 * `adminConnection` authenticates as a superuser (the `db-up` container's
 * `postgres` role) -- callers never need a database name for it because
 * this function opens its own connections to the `postgres` maintenance
 * database (role/database DDL) and, separately, to `databaseName` (the
 * schema grant, since schema `public` belongs to that database, not
 * `postgres`).
 */
export async function ensureDatabaseRoles(
    adminConnection: AdminConnection,
    options: DatabaseRolesOptions,
): Promise<void> {
    const { databaseName, migratorUser, migratorPassword, runtimeUser, runtimePassword } = options;

    const bootstrap = new Client({ ...adminConnection, database: 'postgres' });
    await bootstrap.connect();

    try {
        await ensureRole(bootstrap, migratorUser, migratorPassword);
        await ensureRole(bootstrap, runtimeUser, runtimePassword);
        await ensureDatabaseExists(bootstrap, databaseName);
        await bootstrap.query(
            `grant connect, create on database ${quoteIdentifier(databaseName)} to ${quoteIdentifier(migratorUser)}`,
        );
        await bootstrap.query(
            `grant connect on database ${quoteIdentifier(databaseName)} to ${quoteIdentifier(runtimeUser)}`,
        );
        await bootstrap.query(
            `revoke connect on database ${quoteIdentifier(databaseName)} from public`,
        );
    } finally {
        await bootstrap.end();
    }

    const withinDatabase = new Client({ ...adminConnection, database: databaseName });
    await withinDatabase.connect();

    try {
        await withinDatabase.query(
            `grant create, usage on schema public to ${quoteIdentifier(migratorUser)}`,
        );
        await withinDatabase.query(
            `grant usage on schema public to ${quoteIdentifier(runtimeUser)}`,
        );
    } finally {
        await withinDatabase.end();
    }
}
