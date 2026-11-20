import fs from 'node:fs/promises';

import type { BigQuery, TableField } from '@google-cloud/bigquery';
import type { Pool, PoolClient } from 'pg';

import { exportDigest } from '../src/lib/proxy/account.ts';

import { callWithin, loadWithin, QUERY_GRACE_MS, STATEMENT_TIMEOUT_MS } from './bounded.ts';

/**
 * The account export, which the event export Job (db/export-events.ts) runs
 * before the event export. It copies the Postgres view `account_daily`
 * (migrations 0020, 0021 and 0025) into the BigQuery table `account_daily`,
 * and the view `account_organisation` (migration 0025) into the table
 * `account_organisation`, replacing each whole table in one load job, so a
 * failed load leaves that table as it was. `account_daily` counts new
 * accounts per UTC day and organisation, for every day from the first
 * account's through yesterday's. `account_organisation` holds one row per
 * account counted there, keyed by `user_hash`, the digest the event export
 * writes for the account's events. Neither table holds an email address or
 * a user id.
 */

/** One `account_daily` row. */
export type AccountRow = {
    // UTC, 2026-10-20
    day: string;
    // Null on a day without new accounts, its one row
    organisation: string | null;
    accounts: number;
};

export const ACCOUNT_SCHEMA: TableField[] = [
    {
        name: 'day',
        type: 'DATE',
        mode: 'REQUIRED',
        description: 'The UTC day the accounts were created',
    },
    {
        name: 'organisation',
        type: 'STRING',
        description:
            'The lower-cased email domain once it holds at least 3 accounts, ' +
            '`Personal email` for a webmail domain, `Other organisations` for any other. ' +
            'NULL on a day without new accounts, whose one row has 0 accounts',
    },
    {
        name: 'accounts',
        type: 'INT64',
        mode: 'REQUIRED',
        description: 'The accounts created that day in that organisation, 0 on a day without any',
    },
];

/** One `account_organisation` row. */
export type AccountOrganisationRow = {
    // exportDigest of the user id under EXPORT_ID_HMAC_KEY, the events' `user_hash`
    user_hash: string;
    organisation: string;
    // UTC, 2026-10-20
    created_day: string;
};

export const ACCOUNT_ORGANISATION_SCHEMA: TableField[] = [
    {
        name: 'user_hash',
        type: 'STRING',
        mode: 'REQUIRED',
        description:
            "The account's digest, HMAC-SHA256 of its user id under EXPORT_ID_HMAC_KEY, " +
            'equal to `user_hash` on the events it made',
    },
    {
        name: 'organisation',
        type: 'STRING',
        mode: 'REQUIRED',
        description:
            'The lower-cased email domain once it holds at least 3 accounts, ' +
            '`Personal email` for a webmail domain, `Other organisations` for any other. ' +
            'The `organisation` of `account_daily`',
    },
    {
        name: 'created_day',
        type: 'DATE',
        mode: 'REQUIRED',
        description: 'The UTC day the account was created',
    },
];

/** One row of the view `account_organisation`, as the Job reads it. */
export type AccountOrganisationSource = {
    userId: string;
    organisation: string;
    createdDay: string;
};

/**
 * What one read of the views returns. `accounts` and `webmailDomains` come
 * from the view `account_daily_source`: whether the user table holds any
 * account, and whether `webmail_domain` holds any domain.
 */
export type AccountRead = {
    rows: AccountRow[];
    organisations: AccountOrganisationSource[];
    accounts: boolean;
    webmailDomains: boolean;
};

const readInTransaction = async (client: PoolClient): Promise<AccountRead> => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const { rows } = await client.query<AccountRow>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, organisation, accounts
         FROM account_daily
         ORDER BY day, organisation`,
    );
    const { rows: source } = await client.query<{
        accounts: boolean;
        webmailDomains: boolean;
    }>(`SELECT accounts, webmail_domains AS "webmailDomains" FROM account_daily_source`);
    const { rows: organisations } = await client.query<AccountOrganisationSource>(
        `SELECT user_id AS "userId", organisation,
                to_char(created_day, 'YYYY-MM-DD') AS "createdDay"
         FROM account_organisation
         ORDER BY created_day, user_id`,
    );

    await client.query('COMMIT');

    return { rows, organisations, ...source[0]! };
};

/** How long the account read may take: its three queries at the statement timeout, then the grace. */
const ACCOUNT_READ_MS = 3 * STATEMENT_TIMEOUT_MS + QUERY_GRACE_MS;

/**
 * Every row of `account_daily`, oldest day first, every row of
 * `account_organisation`, and the facts that say why `account_daily` holds
 * none. One read-only transaction reads all three, so they share one
 * `now()` and one snapshot, and the organisations sum to the daily counts. A read still running at `timeoutMs`, as over a
 * connection that stalls past Postgres's timeout, throws.
 */
export const readAccounts = async (
    pool: Pool,
    { timeoutMs = ACCOUNT_READ_MS }: { timeoutMs?: number } = {},
): Promise<AccountRead> => {
    const client = await pool.connect();

    try {
        const read = await callWithin(
            readInTransaction(client),
            timeoutMs,
            () => new Error(`account read ran past ${timeoutMs / 1000} s`),
        );

        client.release();

        return read;
    } catch (error) {
        // A failed or timed-out read leaves the transaction open, or a query
        // in flight, and a release with the error discards the connection
        // with it.
        client.release(error instanceof Error ? error : true);
        throw error;
    }
};

/**
 * The `account_organisation` row for one account. The user id becomes
 * exportDigest under `hmacKey`, the function the event export writes
 * `user_hash` with, and the row keeps no other trace of it.
 */
export const accountOrganisationRow = (
    { userId, organisation, createdDay }: AccountOrganisationSource,
    hmacKey: string,
): AccountOrganisationRow => ({
    user_hash: exportDigest(userId, hmacKey),
    organisation,
    created_day: createdDay,
});

/** The BigQuery tables the account export replaces, with their schemas. */
export const ACCOUNT_TABLES = {
    account_daily: ACCOUNT_SCHEMA,
    account_organisation: ACCOUNT_ORGANISATION_SCHEMA,
} satisfies Record<string, TableField[]>;

export type AccountTable = keyof typeof ACCOUNT_TABLES;

/**
 * Replaces the BigQuery table `table` with the rows in `file`, one JSON
 * object a line. A load past its timeout is cancelled and throws
 * (loadWithin).
 */
export const bigQueryAccountTable =
    ({ datasetId, bigquery }: { datasetId: string; bigquery: BigQuery }) =>
    async (table: AccountTable, file: string): Promise<void> => {
        // Creates the table when it does not exist.
        await loadWithin({
            table: bigquery.dataset(datasetId).table(table),
            file,
            metadata: {
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                writeDisposition: 'WRITE_TRUNCATE',
                schema: { fields: ACCOUNT_TABLES[table] },
            },
        });
    };

/**
 * One account export run. For `account_daily`, then `account_organisation`,
 * writes every row to `scratchFile` and replaces the table with it, so a
 * failed `account_organisation` load leaves it as it was beside a new
 * `account_daily`. `account_daily` holds a row for every day from the first
 * account's through yesterday's while `webmail_domain` holds any domain,
 * so a read with no rows means one of three things. While `webmail_domain`
 * is empty, or while the user table holds no account (a wrong database, an
 * emptied table), the run rejects with both tables kept. When every account
 * is from today, both tables are replaced with no rows, so an account
 * deleted since the last run, and the organisation it named, leave the
 * export. `account_organisation` holds no rows exactly when `account_daily`
 * holds none, since both views read the same accounts.
 */
export const runAccountExport = async ({
    read,
    replace,
    hmacKey,
    scratchFile,
    log,
}: {
    read: () => Promise<AccountRead>;
    replace: (table: AccountTable, file: string) => Promise<void>;
    hmacKey: string;
    scratchFile: string;
    log: (line: string) => void;
}): Promise<void> => {
    const { rows, organisations, accounts, webmailDomains } = await read();

    if (rows.length === 0 && !webmailDomains) {
        throw new Error(
            'account export: account_daily read no rows, webmail_domain is empty, tables kept',
        );
    }

    if (rows.length === 0 && !accounts) {
        throw new Error('account export: account_daily read no accounts, tables kept');
    }

    const tables: [AccountTable, object[]][] = [
        ['account_daily', rows],
        [
            'account_organisation',
            organisations.map((source) => accountOrganisationRow(source, hmacKey)),
        ],
    ];

    for (const [table, tableRows] of tables) {
        try {
            await fs.writeFile(
                scratchFile,
                tableRows.map((row) => `${JSON.stringify(row)}\n`).join(''),
            );
            await replace(table, scratchFile);
        } finally {
            await fs.rm(scratchFile, { force: true });
        }

        log(`${table}: ${tableRows.length} rows loaded`);
    }
};
