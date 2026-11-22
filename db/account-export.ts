import fs from 'node:fs/promises';

import type { BigQuery, TableField } from '@google-cloud/bigquery';
import type { Pool, PoolClient } from 'pg';

import { exportDigest } from '../src/lib/proxy/account.ts';

import {
    callWithin,
    LOAD_SLOT_MS,
    loadOutcome,
    loadWithin,
    type FailedOutcome,
    type LoadResult,
    QUERY_GRACE_MS,
} from './bounded.ts';

/**
 * The account export, which the event export Job (db/export-events.ts) runs
 * after the event export, so the event days load first. It copies the Postgres view `account_daily`
 * (migrations 0020, 0021 and 0025) into the BigQuery table `account_daily`,
 * and the view `account_organisation` (migration 0025) into the table
 * `account_organisation`, and the view `conversation_export` (migration 0026)
 * into the table `conversation`, replacing each whole table in one load job,
 * and logs each failed load with what BigQuery confirms the table holds,
 * `kept` or `unknown` (loadWithin). A load that BigQuery confirms finished
 * after the Job stopped waiting for it replaced its table, and counts as
 * loaded. `account_daily` counts new
 * accounts per UTC day and organisation, for every day from the first
 * account's through yesterday's. `account_organisation` holds one row per
 * account counted there, keyed by `user_hash`, the digest the event export
 * writes for the account's events, with its organisation and no creation
 * day. All three views leave out accounts being deleted. `conversation` holds
 * one row per saved conversation of such an account: the SHA-256 digests of its id
 * and of its agent session id, the user's `user_hash` and its creation time, and no title
 * or content. The agent session id is a bearer credential for the agent, and the
 * conversation id can equal it, so neither leaves raw. A query joins Langfuse sessions
 * with `to_hex(sha256(session_id))`. No table holds an email address, a user id, or a
 * session id.
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
    // lower-case hex SHA-256 of the conversation id, computed by the view
    id_sha256: string;
    // lower-case hex SHA-256 of the agent session id, null before the conversation's first turn
    agent_session_sha256: string | null;
    // exportDigest of the user id under EXPORT_ID_HMAC_KEY, the events' `user_hash`
    user_hash: string;
    // UTC, 2026-10-20T09:30:00.123456Z
    created_at: string;
};

export const CONVERSATION_SCHEMA: TableField[] = [
    {
        name: 'id_sha256',
        type: 'STRING',
        mode: 'REQUIRED',
        description:
            "Lower-case hex SHA-256 of the conversation's id, the `id` of the Studio conversation",
    },
    {
        name: 'agent_session_sha256',
        type: 'STRING',
        description:
            "Lower-case hex SHA-256 of the agent's session id for the conversation, NULL " +
            'before its first turn. Equals `to_hex(sha256(session_id))` of the Langfuse ' +
            'session, so it joins the agent traces',
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
    idSha256: string;
    agentSessionSha256: string | null;
    userId: string;
    createdAt: string;
};

/**
 * What the read of `account_daily` and `account_organisation` returns.
 * `webmailDomains` comes from the view `account_daily_source`: whether
 * `webmail_domain` holds any domain.
 */
export type AccountSnapshot = {
    rows: AccountRow[];
    organisations: AccountOrganisationSource[];
    webmailDomains: boolean;
};

/**
 * How long one of the account export's two reads may take, its connection
 * included. The server stops each of its statements at the same bound, and
 * the Job stops waiting QUERY_GRACE_MS later, for a connection that stalls
 * where the server's timeout cannot reach it. Each read scans its tables
 * once: `user` (one row an account) with `webmail_domain` (about 31,000
 * domains, hashed once) for the first, and `conversation` (one row a saved
 * conversation, its content left in TOAST) joined to `user` with two
 * SHA-256 digests a row for the second. Postgres reads such rows at well
 * over 100,000 a second, so even a million conversations, far past what
 * the accounts can have saved, read in about 10 s, a third of the bound.
 * runAccountExport logs each read's duration, so the bound can follow the
 * measured times.
 */
export const ACCOUNT_READ_MS = 30_000;

/**
 * The most the account export can take from its start: its two reads,
 * 35 s each with the grace, then a load for each of its three tables,
 * LOAD_SLOT_MS (150 s) each, 520 s. Each step has its own bound, so a slow
 * read or load cannot take a later one's time. The event export stops in
 * time to leave the account export this much before the Job's deadline
 * (EVENT_PHASE_MS in db/event-export.ts).
 */
export const ACCOUNT_EXPORT_MS = 2 * (ACCOUNT_READ_MS + QUERY_GRACE_MS) + 3 * LOAD_SLOT_MS;

/** An account read's bound, and how long past it the Job waits for a stalled connection. */
type ReadBounds = { timeoutMs: number; graceMs: number };

/**
 * `read`'s result from one read-only REPEATABLE READ transaction over a
 * client of `pool`, so its queries share one `now()` and one snapshot.
 * The connection counts towards `timeoutMs`, each statement stops on the
 * server at `timeoutMs`, and a read still running `graceMs` later
 * throws `timedOut()`. A failed or timed-out read leaves the transaction
 * open, or a query in flight, and a release with the error discards the
 * connection with it.
 */
const readInTransaction = async <T>(
    pool: Pool,
    { timeoutMs, graceMs }: ReadBounds,
    read: (client: PoolClient) => Promise<T>,
    timedOut: () => Error,
): Promise<T> => {
    let client: PoolClient | undefined;
    let abandoned = false;

    try {
        const result = await callWithin(
            (async () => {
                const connected = await pool.connect();

                // A connection that arrives after the bound is not used.
                if (abandoned) {
                    connected.release(true);
                    throw new Error('connected after the read was abandoned');
                }

                client = connected;
                await client.query(
                    `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
                     SET LOCAL statement_timeout = ${Math.max(1, Math.round(timeoutMs))}`,
                );

                const value = await read(client);

                await client.query('COMMIT');

                return value;
            })(),
            timeoutMs + graceMs,
            timedOut,
        );

        client?.release();

        return result;
    } catch (error) {
        abandoned = true;
        client?.release(error instanceof Error ? error : true);

        throw error;
    }
};

/**
 * Every row of `account_daily`, oldest day first, every row of
 * `account_organisation`, and the facts that say why `account_daily` holds
 * none, from one snapshot. A read still running past `timeoutMs` plus the
 * grace, as over a connection that stalls past Postgres's timeout, throws.
 */
export const readAccounts = async (
    pool: Pool,
    { timeoutMs = ACCOUNT_READ_MS, graceMs = QUERY_GRACE_MS }: Partial<ReadBounds> = {},
): Promise<AccountSnapshot> =>
    readInTransaction(
        pool,
        { timeoutMs, graceMs },
        async (client) => {
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
                throw new Error(
                    `account export: account_daily_source returned ${source.length} rows`,
                );
            }

            const { rows: organisations } = await client.query<AccountOrganisationSource>(
                `SELECT user_id AS "userId", organisation
                 FROM account_organisation
                 ORDER BY user_id`,
            );

            return { rows, organisations, ...source[0]! };
        },
        () => new Error(`account read ran past ${(timeoutMs + graceMs) / 1000} s`),
    );

/**
 * Every row of `conversation_export`, in its own read, so a failure here
 * leaves the account tables to load, and theirs leaves this one. A read
 * still running past `timeoutMs` plus the grace throws.
 */
export const readConversations = async (
    pool: Pool,
    { timeoutMs = ACCOUNT_READ_MS, graceMs = QUERY_GRACE_MS }: Partial<ReadBounds> = {},
): Promise<ConversationSource[]> =>
    readInTransaction(
        pool,
        { timeoutMs, graceMs },
        async (client) => {
            const { rows } = await client.query<ConversationSource>(
                `SELECT id_sha256 AS "idSha256", agent_session_sha256 AS "agentSessionSha256",
                        user_id AS "userId",
                        to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                            AS "createdAt"
                 FROM conversation_export
                 ORDER BY id_sha256`,
            );

            return rows;
        },
        () => new Error(`conversation read ran past ${(timeoutMs + graceMs) / 1000} s`),
    );

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
 * The `conversation` row for one saved conversation. The view
 * `conversation_export` has already digested the conversation id and the agent
 * session id (unkeyed SHA-256, so the session digest joins Langfuse's session
 * id), so no raw id reaches the Job. The user id becomes exportDigest under
 * `hmacKey`, as in accountOrganisationRow.
 */
export const conversationRow = (
    { idSha256, agentSessionSha256, userId, createdAt }: ConversationSource,
    hmacKey: string,
): ConversationExportRow => ({
    id_sha256: idSha256,
    agent_session_sha256: agentSessionSha256,
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
 * object a line. A load that fails throws a LoadError naming what the
 * table holds (loadWithin).
 */
export const bigQueryAccountTable =
    ({ datasetId, bigquery }: { datasetId: string; bigquery: BigQuery }) =>
    async (table: AccountTable, file: string): Promise<LoadResult> =>
        // Creates the table when it does not exist.
        loadWithin({
            table: bigquery.dataset(datasetId).table(table),
            file,
            metadata: {
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                writeDisposition: 'WRITE_TRUNCATE',
                schema: { fields: ACCOUNT_TABLES[table] },
            },
        });

/** A table a run failed to load, and what the table holds after it. */
export type FailedTable = { table: AccountTable; outcome: FailedOutcome };

/** What a run that failed to load some tables throws. */
export class AccountExportError extends AggregateError {
    readonly failedTables: FailedTable[];

    constructor(errors: Error[], failedTables: FailedTable[]) {
        super(errors, `account export: ${errors.map((error) => error.message).join('; ')}`);
        this.name = 'AccountExportError';
        this.failedTables = failedTables;
    }
}

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * One account export run, in two groups that fail apart: `readAccounts`,
 * then `account_daily` and `account_organisation` loaded from its one
 * snapshot, then `readConversations` and `conversation` loaded from it.
 * Each table is written to `scratchFile` and replaces its BigQuery table in
 * one load. A failed read fails its group's tables, which keep what they
 * held, and leaves the other group to run. A failed load fails its table
 * alone. Each failure is logged as it happens with what the table holds,
 * `kept` or `unknown` (FailedOutcome), and the run rejects at the
 * end with an AccountExportError that carries every failed table and its
 * outcome in `failedTables` and every error in `errors`. `account_daily`
 * holds a row for every day from the first account's through yesterday's
 * while `webmail_domain` holds any domain, so a read with no rows means one
 * of two things. While `webmail_domain` is empty, `account_daily` and
 * `account_organisation` fail with their tables kept. Otherwise the read
 * succeeded and the user table holds no account older than today, or none
 * at all, so both tables are replaced with no rows and an account deleted
 * since the last run, and the organisation it named, leave the export.
 * `account_organisation` holds no rows exactly when `account_daily` holds
 * none, since both views read the same accounts. `conversation` does not
 * depend on `webmail_domain` and is replaced from whatever its read
 * returned, an empty list included. A load that BigQuery finished after
 * the Job stopped waiting for it replaced its table, so it is logged once
 * as replaced, with what happened first, and is no failure.
 */
export const runAccountExport = async ({
    readAccounts,
    readConversations,
    replace,
    hmacKey,
    scratchFile,
    log,
}: {
    readAccounts: () => Promise<AccountSnapshot>;
    readConversations: () => Promise<ConversationSource[]>;
    replace: (table: AccountTable, file: string) => Promise<LoadResult | void>;
    hmacKey: string;
    scratchFile: string;
    log: (line: string) => void;
}): Promise<void> => {
    const failedTables: FailedTable[] = [];
    const errors: Error[] = [];

    const fail = (
        table: AccountTable,
        message: string,
        outcome: FailedOutcome,
        cause?: unknown,
    ) => {
        failedTables.push({ table, outcome });
        errors.push(new Error(`${table}: ${message}`, { cause }));
        log(`${table}: ${message}, table ${outcome}`);
    };

    const load = async (table: AccountTable, rows: object[]) => {
        try {
            await fs.writeFile(scratchFile, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
            const late = (await replace(table, scratchFile))?.late;

            log(
                late
                    ? `${table}: ${rows.length} rows loaded, confirmed after the load's ${late}, table replaced`
                    : `${table}: ${rows.length} rows loaded`,
            );
        } catch (error) {
            fail(table, messageOf(error), loadOutcome(error), error);
        }

        try {
            await fs.rm(scratchFile, { force: true });
        } catch (error) {
            log(`${table}: scratch file not removed, ${messageOf(error)}`);
        }
    };

    // Logged on every run, so ACCOUNT_READ_MS can follow the measured times.
    const timed = async <T>(label: string, read: () => Promise<T>): Promise<T> => {
        const started = performance.now();

        try {
            return await read();
        } finally {
            log(`${label} took ${Math.round(performance.now() - started)} ms`);
        }
    };

    let snapshot: AccountSnapshot | undefined;

    try {
        snapshot = await timed('account read', readAccounts);
    } catch (error) {
        fail('account_daily', `read failed, ${messageOf(error)}`, 'kept', error);
        fail('account_organisation', `read failed, ${messageOf(error)}`, 'kept', error);
    }

    if (snapshot !== undefined) {
        const { rows, organisations, webmailDomains } = snapshot;

        if (rows.length === 0 && !webmailDomains) {
            fail('account_daily', 'read no rows, webmail_domain is empty', 'kept');
            fail('account_organisation', 'read no rows, webmail_domain is empty', 'kept');
        } else {
            await load('account_daily', rows);
            await load(
                'account_organisation',
                organisations.map((source) => accountOrganisationRow(source, hmacKey)),
            );
        }
    }

    let conversations: ConversationSource[] | undefined;

    try {
        conversations = await timed('conversation read', readConversations);
    } catch (error) {
        fail('conversation', `read failed, ${messageOf(error)}`, 'kept', error);
    }

    if (conversations !== undefined) {
        await load(
            'conversation',
            conversations.map((source) => conversationRow(source, hmacKey)),
        );
    }

    if (errors.length > 0) {
        throw new AccountExportError(errors, failedTables);
    }
};
