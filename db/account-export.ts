import fs from 'node:fs/promises';

import type { BigQuery, TableField } from '@google-cloud/bigquery';
import type { Pool } from 'pg';

/**
 * The account export, which the event export Job (db/export-events.ts) runs
 * before the event export: copies the Postgres view `account_daily`
 * (migration 0020) into the BigQuery table `account_daily`, replacing the
 * whole table in one load job, so a failed run leaves the previous table.
 * The view counts new accounts per UTC day and organisation, for every day
 * from the first account's through yesterday's, and the rows hold no email
 * address or user id.
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

/** Every row of the view, oldest day first. */
export const readAccountDaily = async (pool: Pool): Promise<AccountRow[]> => {
    const { rows } = await pool.query<AccountRow>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, organisation, accounts
         FROM account_daily
         ORDER BY day, organisation`,
    );

    return rows;
};

/** Replaces the BigQuery table `account_daily` with the rows in `file`, one JSON object a line. */
export const bigQueryAccountTable =
    ({ datasetId, bigquery }: { datasetId: string; bigquery: BigQuery }) =>
    async (file: string): Promise<void> => {
        // Creates the table when it does not exist. Resolves once the load
        // job is done, and throws if it failed.
        await bigquery
            .dataset(datasetId)
            .table('account_daily')
            .load(file, {
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                writeDisposition: 'WRITE_TRUNCATE',
                schema: { fields: ACCOUNT_SCHEMA },
            });
    };

/**
 * One account export run. Writes every row to `scratchFile`, then replaces
 * the table with it. The view holds a row for every day since the first
 * account's, so a read with no rows is a fault (a wrong database, an
 * emptied table) unless every account is from today, and rejects with the
 * table kept.
 */
export const runAccountExport = async ({
    read,
    replace,
    scratchFile,
    log,
}: {
    read: () => Promise<AccountRow[]>;
    replace: (file: string) => Promise<void>;
    scratchFile: string;
    log: (line: string) => void;
}): Promise<void> => {
    const rows = await read();

    if (rows.length === 0) {
        throw new Error('account export: account_daily read no rows, table kept');
    }

    try {
        await fs.writeFile(scratchFile, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
        await replace(scratchFile);
    } finally {
        await fs.rm(scratchFile, { force: true });
    }

    log(`account_daily: ${rows.length} rows loaded`);
};
