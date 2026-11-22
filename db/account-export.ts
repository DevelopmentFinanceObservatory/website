import fs from 'node:fs/promises';

import type { BigQuery, TableField } from '@google-cloud/bigquery';
import type { Pool, PoolClient } from 'pg';

import { exportDigest } from '../src/lib/proxy/account.ts';

import { callWithin, loadWithin, QUERY_GRACE_MS, STATEMENT_TIMEOUT_MS } from './bounded.ts';

/**
 * The account export, which the event export Job (db/export-events.ts) runs
 * after the event export, so the event days load first. It copies the Postgres view `account_daily`
 * (migrations 0020, 0021 and 0025) into the BigQuery table `account_daily`,
 * and the view `account_organisation` (migration 0025) into the table
 * `account_organisation`, and the view `conversation_export` (migration 0026)
 * into the table `conversation`, replacing each whole table in one load job,
 * so a failed load leaves that table as it was. `account_daily` counts new
 * accounts per UTC day and organisation, for every day from the first
 * account's through yesterday's. `account_organisation` holds one row per
 * account counted there, keyed by `user_hash`, the digest the event export
 * writes for the account's events, with its organisation and no creation
 * day. All three views leave out accounts being deleted. `conversation` holds
 * one row per saved conversation of such an account: its id, its `agent_session_id`, the
 * user's `user_hash` and its creation time, and no title or content. No table holds an
 * email address or a user id.
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
];

/** One row of the view `account_organisation`, as the Job reads it. */
export type AccountOrganisationSource = {
    userId: string;
    organisation: string;
};

/** One `conversation` row. */
export type ConversationExportRow = {
    id: string;
    agent_session_id: string | null;
    // exportDigest of the user id under EXPORT_ID_HMAC_KEY, the events' `user_hash`
    user_hash: string;
    // UTC, 2026-10-20T09:30:00.123456Z
    created_at: string;
};

export const CONVERSATION_SCHEMA: TableField[] = [
    {
        name: 'id',
        type: 'STRING',
        mode: 'REQUIRED',
        description: "The conversation's id, the `id` of the Studio conversation",
    },
    {
        name: 'agent_session_id',
        type: 'STRING',
        description:
            "The agent's session id for the conversation, NULL before its first turn. " +
            'Joins the agent traces',
    },
    {
        name: 'user_hash',
        type: 'STRING',
        mode: 'REQUIRED',
        description:
            "The owner's digest, HMAC-SHA256 of its user id under EXPORT_ID_HMAC_KEY, " +
            'equal to `user_hash` on the events it made',
    },
    {
        name: 'created_at',
        type: 'TIMESTAMP',
        mode: 'REQUIRED',
        description: 'When the conversation was first saved, UTC',
    },
];

/** One row of the view `conversation_export`, as the Job reads it. */
export type ConversationSource = {
    id: string;
    agentSessionId: string | null;
    userId: string;
    createdAt: string;
};

/**
 * What one read of the views returns. `webmailDomains` comes from the view
 * `account_daily_source`: whether `webmail_domain` holds any domain.
 */
export type AccountRead = {
    rows: AccountRow[];
    organisations: AccountOrganisationSource[];
    conversations: ConversationSource[];
    webmailDomains: boolean;
};

const readInTransaction = async (client: PoolClient): Promise<AccountRead> => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const { rows } = await client.query<AccountRow>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, organisation, accounts
         FROM account_daily
         ORDER BY day, organisation`,
    );
    const { rows: source } = await client.query<{ webmailDomains: boolean }>(
        `SELECT webmail_domains AS "webmailDomains" FROM account_daily_source`,
    );

    // The view always returns one row, so any other count is a read that did
    // not see the schema it expects.
    if (source.length !== 1) {
        throw new Error(`account export: account_daily_source returned ${source.length} rows`);
    }

    const { rows: organisations } = await client.query<AccountOrganisationSource>(
        `SELECT user_id AS "userId", organisation
         FROM account_organisation
         ORDER BY user_id`,
    );

    const { rows: conversations } = await client.query<ConversationSource>(
        `SELECT "id", agent_session_id AS "agentSessionId", user_id AS "userId",
                to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                    AS "createdAt"
         FROM conversation_export
         ORDER BY "id"`,
    );

    await client.query('COMMIT');

    return { rows, organisations, conversations, ...source[0]! };
};

/** How long the account read may take: its four queries at the statement timeout, then the grace. */
const ACCOUNT_READ_MS = 4 * STATEMENT_TIMEOUT_MS + QUERY_GRACE_MS;

/**
 * Every row of `account_daily`, oldest day first, every row of
 * `account_organisation`, every row of `conversation_export`, and the facts that say why `account_daily` holds
 * none. One read-only transaction reads all of them, so they share one
 * `now()` and one snapshot. The loads that follow are separate, so for
 * one run the BigQuery tables can differ, and the next run reconciles them.
 * A read still running at `timeoutMs`, as over a connection that stalls
 * past Postgres's timeout, throws.
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
    { userId, organisation }: AccountOrganisationSource,
    hmacKey: string,
): AccountOrganisationRow => ({
    user_hash: exportDigest(userId, hmacKey),
    organisation,
});

/**
 * The `conversation` row for one saved conversation. The user id becomes
 * exportDigest under `hmacKey`, as in accountOrganisationRow.
 */
export const conversationRow = (
    { id, agentSessionId, userId, createdAt }: ConversationSource,
    hmacKey: string,
): ConversationExportRow => ({
    id,
    agent_session_id: agentSessionId,
    user_hash: exportDigest(userId, hmacKey),
    created_at: createdAt,
});

/** The BigQuery tables the account export replaces, with their schemas. */
export const ACCOUNT_TABLES = {
    account_daily: ACCOUNT_SCHEMA,
    account_organisation: ACCOUNT_ORGANISATION_SCHEMA,
    conversation: CONVERSATION_SCHEMA,
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
 * then `conversation`, writes every row to `scratchFile` and replaces the table with it,
 * so a failed load leaves that table as it was. Each table loads on its own: a
 * failed table does not stop the next, and the run rejects at the end naming
 * every failed table. `account_daily` holds a row for every day from the first
 * account's through yesterday's while `webmail_domain` holds any domain,
 * so a read with no rows means one of two things. While `webmail_domain`
 * is empty, `account_daily` and `account_organisation` fail with their
 * tables kept. Otherwise the read succeeded and the user table holds no
 * account older than today, or none at all, so both tables are replaced
 * with no rows and an account deleted since the last run, and the
 * organisation it named, leave the export. `account_organisation` holds no
 * rows exactly when `account_daily` holds none, since both views read the
 * same accounts. `conversation` does not depend on `webmail_domain` and is
 * replaced from whatever the read returned, an empty list included. A failed
 * or partial read throws in `read`, before any table is replaced.
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
    const { rows, organisations, conversations, webmailDomains } = await read();
    const heldBack = rows.length === 0 && !webmailDomains;

    const tables: [AccountTable, object[], boolean][] = [
        ['account_daily', rows, heldBack],
        [
            'account_organisation',
            organisations.map((source) => accountOrganisationRow(source, hmacKey)),
            heldBack,
        ],
        ['conversation', conversations.map((source) => conversationRow(source, hmacKey)), false],
    ];
    const failures: string[] = [];

    for (const [table, tableRows, kept] of tables) {
        if (kept) {
            failures.push(`${table}: read no rows, webmail_domain is empty, table kept`);
            continue;
        }

        try {
            await fs.writeFile(
                scratchFile,
                tableRows.map((row) => `${JSON.stringify(row)}\n`).join(''),
            );
            await replace(table, scratchFile);
            log(`${table}: ${tableRows.length} rows loaded`);
        } catch (error) {
            failures.push(`${table}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            await fs.rm(scratchFile, { force: true });
        }
    }

    if (failures.length > 0) {
        throw new Error(`account export: ${failures.join('; ')}`);
    }
};
