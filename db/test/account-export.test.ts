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
    ACCOUNT_ORGANISATION_SCHEMA,
    ACCOUNT_SCHEMA,
    ACCOUNT_TABLES,
    type AccountOrganisationRow,
    type AccountRead,
    type AccountRow,
    type AccountTable,
    bigQueryAccountTable,
    readAccounts,
    runAccountExport,
} from '../account-export.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { exportRow, exportRules } from '../event-export.ts';
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

const HMAC_KEY = 'test-export-key';

// The `user_hash` the event export writes on an event the account made.
const eventUserHash = (userId: string) =>
    exportRow(
        {
            id: 1,
            createdAt: '2026-10-20T00:00:00.000000Z',
            name: 'search.query',
            userId,
            visitorId: null,
            page: null,
            props: {},
        },
        HMAC_KEY,
        exportRules(HMAC_KEY),
    ).user_hash;

/** A `replace` that keeps each table's loaded rows, parsed. */
const capture = () => {
    const loaded: { table: AccountTable; text: string }[] = [];
    const replace = async (table: AccountTable, file: string) => {
        loaded.push({ table, text: await fs.readFile(file, 'utf8') });
    };
    const rows = (table: AccountTable): unknown[] =>
        loaded
            .filter((load) => load.table === table)
            .flatMap(({ text }) =>
                text
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => JSON.parse(line)),
            );

    return { loaded, replace, rows };
};

const scratchFile = () =>
    path.join(
        os.tmpdir(),
        `account-export-test-${process.pid}-${randomBytes(4).toString('hex')}.ndjson`,
    );

/**
 * Reads `account_daily` and `account_organisation` as a login member of
 * `website_export_reader`, the way the Job's IAM user reads them, and
 * exports what it read, over users seeded either side of the
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

    // Ids unlike the emails, so a leaked id and a leaked email are told apart.
    const idOf = (email: string) => `id-${users.findIndex(([seeded]) => seeded === email)}`;

    await database.runtimePool().query(
        `insert into "user" (id, name, email, created_at)
         select id, 'Name', email,
                ((now() at time zone 'UTC')::date - back)::timestamp + at::time
         from unnest($1::text[], $2::text[], $3::int[], $4::text[]) as seed (id, email, back, at)`,
        [
            users.map(([email]) => idOf(email)),
            users.map(([email]) => email),
            users.map(([, back]) => back),
            users.map(([, , at]) => at),
        ],
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

    const read = await readAccounts(readerPool);
    const { rows, accounts, webmailDomains } = read;

    assert.deepEqual({ accounts, webmailDomains }, { accounts: true, webmailDomains: true });
    assert.deepEqual(
        sorted(rows),
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

    // Each account created before today, with the label its domain has in
    // account_daily, keyed by the digest its events carry.
    const organisationOf: Record<string, string> = {
        'p@gmail.com': 'Personal email',
        'q@GMail.com': 'Personal email',
        'r@googlemail.com': 'Personal email',
        's@proton.me': 'Personal email',
        't@hotmail.co.uk': 'Personal email',
        'a@one.org': 'one.org',
        'B@ONE.ORG': 'one.org',
        'x@two.org': 'Other organisations',
        'y@Two.org': 'Other organisations',
        '"c@home"@One.Org': 'one.org',
        'm1@Mail.Example.ORG': 'mail.example.org',
        'm2@mail.example.org': 'mail.example.org',
        'm3@MAIL.example.org': 'mail.example.org',
        'n@example.org': 'Other organisations',
        'u@yahoo.fr': 'Personal email',
        'v@yahoo.fr': 'Personal email',
        'w@YAHOO.FR': 'Personal email',
        'late@gmail.com': 'Personal email',
    };
    const byHash = (rows: AccountOrganisationRow[]) =>
        rows.toSorted((a, b) => a.user_hash.localeCompare(b.user_hash));
    const { loaded, replace, rows: exported } = capture();

    await runAccountExport({
        read: async () => read,
        replace,
        hmacKey: HMAC_KEY,
        scratchFile: scratchFile(),
        log: () => {},
    });

    assert.deepEqual(
        byHash(exported('account_organisation') as AccountOrganisationRow[]),
        byHash(
            users
                .filter(([email]) => email in organisationOf)
                .map(([email]) => ({
                    user_hash: eventUserHash(idOf(email))!,
                    organisation: organisationOf[email]!,
                })),
        ),
    );
    assert.deepEqual(sorted(exported('account_daily') as AccountRow[]), sorted(rows));

    // No id, email address, `@`, or domain below the threshold reaches a load.
    const text = loaded.map((load) => load.text).join('');

    assert.ok(!text.includes('@'));
    assert.ok(!text.includes('two.org'));
    for (const [email] of users) {
        assert.ok(!text.includes(`"${idOf(email)}"`), idOf(email));
    }

    await assert.rejects(readerPool.query('select 1 from "user"'), /permission denied/);
    await assert.rejects(readerPool.query('select 1 from webmail_domain'), /permission denied/);
});

test('account_daily and account_organisation name a domain only once it holds 3 accounts before today', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await migrate(database);
    await database.runtimePool().query(
        `insert into "user" (id, name, email, created_at)
         select email, 'Name', email, (now() at time zone 'UTC')::date - back
         from unnest(array['a@three.org', 'b@three.org', 'c@three.org'], array[2, 1, 0])
              as seed (email, back)`,
    );

    const { rows, organisations } = await readAccounts(database.adminPool());

    assert.deepEqual(
        rows.map(({ organisation, accounts }) => [organisation, accounts]),
        [
            ['Other organisations', 1],
            ['Other organisations', 1],
        ],
    );
    assert.deepEqual(
        organisations.map(({ userId, organisation }) => [userId, organisation]),
        [
            ['a@three.org', 'Other organisations'],
            ['b@three.org', 'Other organisations'],
        ],
    );
});

test('account_daily and account_organisation leave out an account being deleted', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await migrate(database);
    // Three live accounts at one domain, and a fourth being deleted.
    await database.runtimePool().query(
        `insert into "user" (id, name, email, created_at, deleting_at)
         select email, 'Name', email, (now() at time zone 'UTC')::date - 2,
                case when email like 'gone%' then now() end
         from unnest(array['a@three.org', 'b@three.org', 'c@three.org', 'gone@three.org']) as seed (email)`,
    );

    const { rows, organisations } = await readAccounts(database.adminPool());

    assert.deepEqual(
        rows
            .filter((row) => row.accounts > 0)
            .map(({ organisation, accounts }) => [organisation, accounts]),
        [['three.org', 3]],
    );
    assert.deepEqual(organisations.map(({ userId }) => userId).sort(), [
        'a@three.org',
        'b@three.org',
        'c@three.org',
    ]);
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
            read: async () => {
                const read = await readAccounts(database.adminPool());

                assert.deepEqual(read.organisations, []);
                return read;
            },
            replace: async () => {
                replaced = true;
            },
            hmacKey: HMAC_KEY,
            scratchFile: scratchFile(),
            log: () => {},
        }),
        /webmail_domain is empty/,
    );
    assert.equal(replaced, false);
});

test('account_daily_source tells accounts only from today from an empty user table', async (t) => {
    const cases: [string, string[], boolean][] = [
        ['an account today', ['a@one.org'], true],
        ['no account', [], false],
    ];

    for (const [label, emails, accounts] of cases) {
        await t.test(label, async (t) => {
            const database = await createTestDatabase();
            t.after(() => database.teardown());

            await migrate(database);
            await database.runtimePool().query(
                `insert into "user" (id, name, email, created_at)
                 select email, 'Name', email, now() at time zone 'UTC'
                 from unnest($1::text[]) as email`,
                [emails],
            );

            assert.deepEqual(await readAccounts(database.adminPool()), {
                rows: [],
                organisations: [],
                accounts,
                webmailDomains: true,
            });
        });
    }
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
                createLoadJob: async (file: string, metadata: Record<string, unknown>) => {
                    loads.push({ table: `${dataset}.${table}`, file, metadata });
                    return [{ promise: async () => [{}] }];
                },
            }),
        }),
    } as unknown as BigQuery;

    return { bigquery, loads };
};

test('bigQueryAccountTable replaces the whole table in one load', async (t) => {
    const cases: [AccountTable, typeof ACCOUNT_SCHEMA][] = [
        ['account_daily', ACCOUNT_SCHEMA],
        ['account_organisation', ACCOUNT_ORGANISATION_SCHEMA],
    ];

    assert.deepEqual(
        cases.map(([table]) => table),
        Object.keys(ACCOUNT_TABLES),
    );

    for (const [table, fields] of cases) {
        await t.test(table, async () => {
            const { bigquery, loads } = fakeBigQuery();

            await bigQueryAccountTable({ datasetId: 'd', bigquery })(table, '/tmp/accounts.ndjson');

            assert.deepEqual(loads, [
                {
                    table: `d.${table}`,
                    file: '/tmp/accounts.ndjson',
                    metadata: {
                        sourceFormat: 'NEWLINE_DELIMITED_JSON',
                        writeDisposition: 'WRITE_TRUNCATE',
                        schema: { fields },
                    },
                },
            ]);
            assert.ok(fields.every((field) => field.description));
        });
    }
});

test(
    'readAccounts fails a read that hangs past its bound and destroys its client',
    { timeout: 5_000 },
    async () => {
        const queries: string[] = [];
        const released: unknown[] = [];
        const pool = {
            connect: async () => ({
                // BEGIN answers, and the view's read never does, as over a stalled tunnel.
                query: (text: string) => {
                    queries.push(text.trim().split(/\s/, 1)[0]!);
                    return text.startsWith('BEGIN')
                        ? Promise.resolve({ rows: [] })
                        : new Promise(() => undefined);
                },
                release: (error?: unknown) => released.push(error),
            }),
        } as unknown as Pool;

        await assert.rejects(readAccounts(pool, { timeoutMs: 20 }), /account read ran past 0.02 s/);
        assert.deepEqual(queries, ['BEGIN', 'SELECT']);
        assert.equal(released.length, 1);
        assert.ok(released[0] instanceof Error);
    },
);

const ROWS: AccountRow[] = [
    { day: '2026-10-20', organisation: 'Personal email', accounts: 4 },
    { day: '2026-10-21', organisation: 'one.org', accounts: 3 },
];

const ORGANISATIONS: AccountRead['organisations'] = [
    { userId: 'user-1', organisation: 'Personal email' },
    { userId: 'user-2', organisation: 'one.org' },
];

test('runAccountExport loads each table in one file, digests the user ids, and removes the file', async () => {
    const file = scratchFile();
    const { loaded, replace, rows } = capture();

    await runAccountExport({
        read: async () => ({
            rows: ROWS,
            organisations: ORGANISATIONS,
            accounts: true,
            webmailDomains: true,
        }),
        replace,
        hmacKey: HMAC_KEY,
        scratchFile: file,
        log: () => {},
    });

    assert.deepEqual(
        loaded.map(({ table }) => table),
        ['account_daily', 'account_organisation'],
    );
    assert.deepEqual(rows('account_daily'), ROWS);
    assert.deepEqual(rows('account_organisation'), [
        {
            user_hash: eventUserHash('user-1'),
            organisation: 'Personal email',
        },
        { user_hash: eventUserHash('user-2'), organisation: 'one.org' },
    ]);
    await assert.rejects(fs.access(file));
});

test('runAccountExport empties the table when every account is from today, and rejects other empty reads', async (t) => {
    const cases: [string, Omit<AccountRead, 'rows' | 'organisations'>, RegExp | null][] = [
        ['every account from today', { accounts: true, webmailDomains: true }, null],
        ['no account', { accounts: false, webmailDomains: true }, /read no accounts/],
        [
            'an empty webmail_domain',
            { accounts: true, webmailDomains: false },
            /webmail_domain is empty/,
        ],
    ];

    for (const [label, source, rejects] of cases) {
        await t.test(label, async () => {
            const { loaded, replace } = capture();
            const run = runAccountExport({
                read: async () => ({ rows: [], organisations: [], ...source }),
                replace,
                hmacKey: HMAC_KEY,
                scratchFile: scratchFile(),
                log: () => {},
            });

            if (rejects === null) {
                await run;
                assert.deepEqual(loaded, [
                    { table: 'account_daily', text: '' },
                    { table: 'account_organisation', text: '' },
                ]);
            } else {
                await assert.rejects(run, rejects);
                assert.deepEqual(loaded, []);
            }
        });
    }
});
