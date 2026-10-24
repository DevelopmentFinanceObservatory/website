import fs from 'node:fs/promises';

import type { BigQuery, TableField } from '@google-cloud/bigquery';
import type { Pool, PoolClient } from 'pg';

import { callWithin, loadWithin, QUERY_GRACE_MS, STATEMENT_TIMEOUT_MS } from './bounded.ts';

/**
 * The account export, which the event export Job (db/export-events.ts) runs
 * before the event export: copies the Postgres view `account_daily`
 * (migrations 0020 and 0021) into the BigQuery table `account_daily`,
 * replacing the whole table in one load job, so a failed run leaves the
 * previous table. The view counts new accounts per UTC day and
 * organisation, for every day from the first account's through
 * yesterday's, and the rows hold no email address or user id.
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

/**
 * What one read of the view returns. `accounts` and `webmailDomains` come
 * from the view `account_daily_source`: whether the user table holds any
 * account, and whether `webmail_domain` holds any domain.
 */
export type AccountRead = {
    rows: AccountRow[];
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

    await client.query('COMMIT');

    return { rows, ...source[0]! };
};

/** How long the account read may take: its two queries at the statement timeout, then the grace. */
const ACCOUNT_READ_MS = 2 * STATEMENT_TIMEOUT_MS + QUERY_GRACE_MS;

/**
 * Every row of the view, oldest day first, with the facts that say why it
 * holds none. One read-only transaction reads both, so they share one
 * `now()` and one snapshot. A read still running at `timeoutMs`, as over a
 * connection that stalls past Postgres's timeout, throws.
 */
export const readAccountDaily = async (
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
 * Replaces the BigQuery table `account_daily` with the rows in `file`, one
 * JSON object a line. A load past its timeout is cancelled and throws
 * (loadWithin).
 */
export const bigQueryAccountTable =
    ({ datasetId, bigquery }: { datasetId: string; bigquery: BigQuery }) =>
    async (file: string): Promise<void> => {
        // Creates the table when it does not exist.
        await loadWithin({
            table: bigquery.dataset(datasetId).table('account_daily'),
            file,
            metadata: {
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                writeDisposition: 'WRITE_TRUNCATE',
                schema: { fields: ACCOUNT_SCHEMA },
            },
        });
    };

/**
 * One account export run. Writes every row to `scratchFile`, then replaces
 * the table with it. The view holds a row for every day from the first
 * account's through yesterday's while `webmail_domain` holds any domain,
 * so a read with no rows means one of three things. While `webmail_domain`
 * is empty, or while the user table holds no account (a wrong database, an
 * emptied table), the run rejects with the table kept. When every account
 * is from today, the table is replaced with no rows, so an account deleted
 * since the last run, and the organisation it named, leave the export.
 */
export const runAccountExport = async ({
    read,
    replace,
    scratchFile,
    log,
}: {
    read: () => Promise<AccountRead>;
    replace: (file: string) => Promise<void>;
    scratchFile: string;
    log: (line: string) => void;
}): Promise<void> => {
    const { rows, accounts, webmailDomains } = await read();

    if (rows.length === 0 && !webmailDomains) {
        throw new Error(
            'account export: account_daily read no rows, webmail_domain is empty, table kept',
        );
    }

    if (rows.length === 0 && !accounts) {
        throw new Error('account export: account_daily read no accounts, table kept');
    }

    try {
        await fs.writeFile(scratchFile, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
        await replace(scratchFile);
    } finally {
        await fs.rm(scratchFile, { force: true });
    }

    log(`account_daily: ${rows.length} rows loaded`);
};
