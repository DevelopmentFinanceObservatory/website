import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BigQuery } from '@google-cloud/bigquery';
import freeEmailDomains from 'free-email-domains';
import { Pool } from 'pg';
import {
    ACCOUNT_SCHEMA,
    type AccountRow,
    bigQueryAccountTable,
    readAccountDaily,
    runAccountExport,
} from '../account-export.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { EXPORT_READER_ROLE } from '../local-roles.ts';
import { syncWebmailDomains } from '../webmail-domains.ts';
import { createTestDatabase, type TestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

// As db/migrate.ts runs them.
const migrate = async (database: TestDatabase) => {
    const pool = database.migratorPool();

    await applyMigrations(pool, {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });
    await syncWebmailDomains(pool);
};

const sorted = (rows: AccountRow[]) =>
    rows.toSorted((a, b) =>
        `${a.day} ${a.organisation}`.localeCompare(`${b.day} ${b.organisation}`),
    );

/**
 * Reads `account_daily` as a login member of `website_export_reader`, the
 * way the Job's IAM user reads it, over users seeded either side of the
 * rules: a domain with 3 accounts and one with 2, mixed case, an address
 * whose local part holds an `@`, a subdomain and its parent, webmail
 * domains with fewer and more than 3 accounts, accounts either side of two
 * UTC midnights, a day without accounts, and accounts today. The days count
 * back from today's UTC date, so a run across a UTC midnight can fail. The
 * reader's session runs 12 or 14 hours off UTC, whichever puts its date on
 * another day than UTC's, so a day or a today taken in the session's time
 * zone would move.
 */
test('the export reader reads accounts per UTC day and organisation, and not "user"', async (t) => {
    const database = await createTestDatabase();
    const admin = database.adminPool();
    const reader = `test_export_${randomBytes(4).toString('hex')}`;
    const password = randomBytes(16).toString('hex');
    let readerPool: Pool | null = null;

    t.after(async () => {
        await readerPool?.end();
        await admin.query(`drop role if exists "${reader}"`);
        await database.teardown();
    });

    await migrate(database);
    await admin.query(
        `create role "${reader}" login password '${password}' in role ${EXPORT_READER_ROLE}`,
    );

    // [email, days before today, UTC time of day]
    const users: [string, number, string][] = [
        ['p@gmail.com', 4, '23:59:59.999999'],
        ['q@GMail.com', 3, '00:00:00'],
        ['r@googlemail.com', 3, '13:00:00'],
        ['s@proton.me', 3, '14:00:00'],
        ['t@hotmail.co.uk', 3, '15:00:00'],
        ['a@one.org', 3, '10:00:00'],
        ['B@ONE.ORG', 3, '12:00:00'],
        ['x@two.org', 3, '10:00:00'],
        ['y@Two.org', 3, '11:00:00'],
        ['"c@home"@One.Org', 1, '09:00:00'],
        ['m1@Mail.Example.ORG', 1, '08:00:00'],
        ['m2@mail.example.org', 1, '08:00:00'],
        ['m3@MAIL.example.org', 1, '08:00:00'],
        ['n@example.org', 1, '08:00:00'],
        ['u@yahoo.fr', 1, '10:00:00'],
        ['v@yahoo.fr', 1, '11:00:00'],
        ['w@YAHOO.FR', 1, '12:00:00'],
        ['late@gmail.com', 1, '23:59:59.999999'],
        ['today@gmail.com', 0, '00:00:00'],
        ['now@gmail.com', 0, '00:00:00.000001'],
    ];

    await database.runtimePool().query(
        `insert into "user" (id, name, email, created_at)
         select email, 'Name', email,
                ((now() at time zone 'UTC')::date - back)::timestamp + at::time
         from unnest($1::text[], $2::int[], $3::text[]) as seed (email, back, at)`,
        [users.map(([email]) => email), users.map(([, back]) => back), users.map(([, , at]) => at)],
    );

    const { rows: clock } = await admin.query<{ today: string; hour: number }>(
        `select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as today,
                extract(hour from now() at time zone 'UTC')::int as hour`,
    );
    const { today, hour } = clock[0]!;
    const day = (back: number) =>
        new Date(Date.parse(today) - back * 86_400_000).toISOString().slice(0, 10);

    readerPool = new Pool({
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5433),
        user: reader,
        password,
        database: database.databaseName,
        max: 1,
        // POSIX names: Etc/GMT-14 is UTC+14, a day ahead from 10:00 UTC, and
        // Etc/GMT+12 is UTC-12, a day behind until 12:00 UTC.
        options: `-c TimeZone=${hour >= 12 ? 'Etc/GMT-14' : 'Etc/GMT+12'}`,
    });

    assert.deepEqual(
        sorted(await readAccountDaily(readerPool)),
        sorted([
            { day: day(4), organisation: 'Personal email', accounts: 1 },
            { day: day(3), organisation: 'Other organisations', accounts: 2 },
            { day: day(3), organisation: 'Personal email', accounts: 4 },
            { day: day(3), organisation: 'one.org', accounts: 2 },
            { day: day(2), organisation: null, accounts: 0 },
            { day: day(1), organisation: 'Other organisations', accounts: 1 },
            { day: day(1), organisation: 'Personal email', accounts: 4 },
            { day: day(1), organisation: 'mail.example.org', accounts: 3 },
            { day: day(1), organisation: 'one.org', accounts: 1 },
        ]),
    );
    await assert.rejects(readerPool.query('select 1 from "user"'), /permission denied/);
    await assert.rejects(readerPool.query('select 1 from webmail_domain'), /permission denied/);
});

test('account_daily holds no rows while webmail_domain is empty, and the export fails', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    // The migrations without the list, as after a failed syncWebmailDomains.
    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });
    await database.runtimePool().query(
        `insert into "user" (id, name, email, created_at)
         select email, 'Name', email, (now() at time zone 'UTC')::date - 2
         from unnest(array['a@gmail.com', 'b@gmail.com', 'c@gmail.com']) as email`,
    );

    let replaced = false;

    await assert.rejects(
        runAccountExport({
            read: () => readAccountDaily(database.adminPool()),
            replace: async () => {
                replaced = true;
            },
            scratchFile: path.join(os.tmpdir(), `account-export-test-${process.pid}.ndjson`),
            log: () => {},
        }),
        /read no rows/,
    );
    assert.equal(replaced, false);
});

test('syncWebmailDomains rewrites webmail_domain to the package list', async (t) => {
    const database = await createTestDatabase();
    const admin = database.adminPool();
    t.after(() => database.teardown());

    await migrate(database);
    await admin.query(`insert into webmail_domain values ('stale.example')`);
    await admin.query(`delete from webmail_domain where domain = 'gmail.com'`);
    await migrate(database);

    const { rows } = await admin.query<{ domain: string }>('select domain from webmail_domain');

    assert.deepEqual(
        rows.map(({ domain }) => domain).sort(),
        [...new Set(freeEmailDomains)].sort(),
    );
});

const fakeBigQuery = () => {
    const loads: { table: string; file: string; metadata: Record<string, unknown> }[] = [];
    const bigquery = {
        dataset: (dataset: string) => ({
            table: (table: string) => ({
                load: async (file: string, metadata: Record<string, unknown>) => {
                    loads.push({ table: `${dataset}.${table}`, file, metadata });
                    return [{}];
                },
            }),
        }),
    } as unknown as BigQuery;

    return { bigquery, loads };
};

test('bigQueryAccountTable replaces the whole table in one load', async () => {
    const { bigquery, loads } = fakeBigQuery();

    await bigQueryAccountTable({ datasetId: 'd', bigquery })('/tmp/accounts.ndjson');

    assert.deepEqual(loads, [
        {
            table: 'd.account_daily',
            file: '/tmp/accounts.ndjson',
            metadata: {
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                writeDisposition: 'WRITE_TRUNCATE',
                schema: { fields: ACCOUNT_SCHEMA },
            },
        },
    ]);
    assert.ok(ACCOUNT_SCHEMA.every((field) => field.description));
});

const ROWS: AccountRow[] = [
    { day: '2026-10-20', organisation: 'Personal email', accounts: 4 },
    { day: '2026-10-21', organisation: 'one.org', accounts: 3 },
];

test('runAccountExport loads every row in one file and removes it', async () => {
    const scratchFile = path.join(os.tmpdir(), `account-export-test-${process.pid}.ndjson`);
    const loaded: string[] = [];

    await runAccountExport({
        read: async () => ROWS,
        replace: async (file) => {
            loaded.push(await fs.readFile(file, 'utf8'));
        },
        scratchFile,
        log: () => {},
    });

    assert.deepEqual(
        loaded.map((text) =>
            text
                .trimEnd()
                .split('\n')
                .map((line) => JSON.parse(line)),
        ),
        [ROWS],
    );
    await assert.rejects(fs.access(scratchFile));
});

test('runAccountExport rejects a read with no rows and keeps the table', async () => {
    let replaced = false;

    await assert.rejects(
        runAccountExport({
            read: async () => [],
            replace: async () => {
                replaced = true;
            },
            scratchFile: path.join(os.tmpdir(), `account-export-test-${process.pid}.ndjson`),
            log: () => {},
        }),
        /read no rows/,
    );
    assert.equal(replaced, false);
});
