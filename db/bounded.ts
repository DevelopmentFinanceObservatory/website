import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import {
    BigQuery,
    type Job,
    type JobLoadMetadata,
    type Table,
    type TableField,
    type TableMetadata,
} from '@google-cloud/bigquery';
import type { Pool } from 'pg';

import { buildRuntimePool } from './connection.ts';

/**
 * The export Job's clients (db/export-events.ts), every call on them bounded
 * in time: ExportDb for Postgres, whose pool bounds each statement, and
 * ExportBigQuery for BigQuery, which bounds each call and load itself. The
 * export modules reach Postgres and BigQuery only through these, as
 * eslint.config.mjs enforces.
 */

export type { TableField };

/**
 * How long past its server-side bound a statement or a BigQuery query may
 * run before the Job stops waiting for it, for a connection that stalls
 * where the server's timeout cannot reach it.
 */
export const QUERY_GRACE_MS = 5_000;

/** How long an export pool waits for a connection, its checkout included. */
export const CONNECTION_TIMEOUT_MS = 30_000;

/**
 * A pool of one connection for one export phase. Postgres stops each of its
 * statements at `statementMs` (`statement_timeout`), and the Job stops
 * waiting for any of them, a BEGIN or COMMIT included, `graceMs` later
 * (`query_timeout`), whether or not the server can still answer. A
 * connection not made in `connectionMs` fails the call that asked for it.
 */
export const exportPool = (
    env: Record<string, string | undefined>,
    {
        statementMs,
        graceMs = QUERY_GRACE_MS,
        connectionMs = CONNECTION_TIMEOUT_MS,
    }: { statementMs: number; graceMs?: number; connectionMs?: number },
): Pool =>
    buildRuntimePool(env, {
        max: 1,
        statement_timeout: statementMs,
        query_timeout: statementMs + graceMs,
        connectionTimeoutMillis: connectionMs,
    });

/** An export phase's database, each statement bounded by its pool (exportPool). */
export type ExportDb = {
    /** One statement on a pooled connection. */
    query<T>(sql: string, params?: unknown[]): Promise<T[]>;
    /** `read`'s statements in one REPEATABLE READ READ ONLY transaction. */
    snapshot<T>(read: (query: ExportDb['query']) => Promise<T>): Promise<T>;
};

/**
 * The ExportDb over `pool`. A call that fails returns its connection with
 * the error, which destroys it: a statement the Job stopped waiting for is
 * still in flight on it, and a failed snapshot leaves its transaction open.
 * The next call opens a new connection.
 */
export const exportDb = (pool: Pool): ExportDb => ({
    async query(sql, params) {
        // pool.query returns its client with any error.
        const { rows } = await pool.query(sql, params);

        return rows;
    },
    async snapshot(read) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

            const value = await read(async (sql, params) => (await client.query(sql, params)).rows);

            await client.query('COMMIT');
            client.release();

            return value;
        } catch (error) {
            client.release(error instanceof Error ? error : true);
            throw error;
        }
    },
});

/** How long one BigQuery query may run on the server (`jobTimeoutMs`). */
const BIGQUERY_TIMEOUT_MS = 2 * 60_000;

/**
 * How long the Job waits for one BigQuery call, a query or a table read or
 * create, before it gives up on it: BIGQUERY_TIMEOUT_MS plus the grace.
 * The client bounds each HTTP attempt, retries it, and polls a query until
 * its job ends, so nothing bounds a call as a whole.
 */
const BIGQUERY_CALL_MS = BIGQUERY_TIMEOUT_MS + QUERY_GRACE_MS;

/** The most one BigQuery query may bill (`maximumBytesBilled`). */
export const MAX_BYTES_BILLED = 1e9;

/** How long one BigQuery load may run, upload included. */
export const LOAD_TIMEOUT_MS = 2 * 60_000;

/** How long the cancel of a load past its timeout is waited for. */
export const CANCEL_TIMEOUT_MS = 10_000;

/**
 * How long the final state of a load past its timeout is read for, after
 * its cancel. BigQuery cancels a job on a best-effort basis, so a cancelled
 * load can still have replaced its table.
 */
export const CONFIRM_TIMEOUT_MS = 20_000;

/** How often the final state of such a load is read. */
const CONFIRM_POLL_MS = 2_000;

/**
 * The most one load can take from its start to its outcome (loadWithin):
 * 120 s for the load, 10 s for its cancel, and 20 s to confirm its job's
 * final state, 150 s.
 */
export const LOAD_SLOT_MS = LOAD_TIMEOUT_MS + CANCEL_TIMEOUT_MS + CONFIRM_TIMEOUT_MS;

/**
 * What a load left in its table, as far as BigQuery confirms it.
 * `replaced`: the job is DONE without an error, and `late` says when that
 * was confirmed: null when the client reported it in time, `failure` after
 * the client reported a failure, `timeout` after the load's timeout and its
 * cancel. `kept`: no request was sent, the job is DONE with an error, or
 * BigQuery refused the job's insert and knows no job of its id. `unknown`:
 * anything else, such as a job still running, a job id BigQuery does not
 * know after a request that got no answer, or a state that cannot be read.
 */
export type Load =
    | { outcome: 'replaced'; late: null | 'timeout' | 'failure' }
    | { outcome: 'kept' | 'unknown'; error: Error };

/** A load that did not replace its table. */
export type FailedLoad = Extract<Load, { error: Error }>;

/** What `within` resolves to when `work` is still running at `ms`. */
export const TIMED_OUT = Symbol('timed out');

/**
 * `work`'s outcome, or TIMED_OUT once `ms` pass with `work` left running.
 * The timer is cleared when `work` settles first.
 */
export const within = async <T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> => {
    const timer = new AbortController();

    try {
        return await Promise.race([
            work,
            sleep<typeof TIMED_OUT>(ms, TIMED_OUT, { signal: timer.signal }).catch(
                (): typeof TIMED_OUT => TIMED_OUT,
            ),
        ]);
    } finally {
        timer.abort();
    }
};

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/** The HTTP status a client error carries, as the BigQuery client's ApiError `code`. */
const httpStatus = (error: unknown): number | undefined =>
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
        ? error.code
        : undefined;

/**
 * The statuses of a job insert BigQuery refused for its caller: a request
 * it did not authenticate or authorise creates no job.
 */
const UNAUTHORISED = new Set([401, 403]);

/**
 * The statuses of a job insert BigQuery answered and refused, whose job id
 * still has to read as unknown before the table counts as kept.
 */
const REFUSED = new Set([400, 404]);

/**
 * One read of a job's state: DONE without an error (`replaced`) or with one
 * (`kept`), not yet DONE (`running`), an id BigQuery does not know
 * (`absent`), or a read that failed otherwise (`unreadable`).
 */
const readState = async (
    job: Job,
): Promise<'replaced' | 'kept' | 'running' | 'absent' | 'unreadable'> => {
    try {
        const [metadata] = await job.getMetadata();

        if (metadata.status?.state !== 'DONE') {
            return 'running';
        }

        return metadata.status.errorResult ? 'kept' : 'replaced';
    } catch (error) {
        return httpStatus(error) === 404 ? 'absent' : 'unreadable';
    }
};

/**
 * The job's final state, read every `pollMs` until it is DONE or `ms`
 * pass: `kept` when the job failed, since a failed WRITE_TRUNCATE load
 * leaves its table as it was, `replaced` when it succeeded, and `unknown`
 * when no read by `ms` found it DONE.
 */
const finalState = async (
    job: Job,
    ms: number,
    pollMs: number,
): Promise<'replaced' | 'kept' | 'unknown'> => {
    const until = Date.now() + ms;

    for (;;) {
        const state = await within(readState(job), Math.max(0, until - Date.now()));

        if (state === 'replaced' || state === 'kept') {
            return state;
        }

        const wait = Math.min(pollMs, until - Date.now());

        if (wait <= 0) {
            return 'unknown';
        }

        await sleep(wait);
    }
};

/**
 * Loads `file` into `table` under a job id of its own, and resolves with
 * what BigQuery confirms the load left in the table (Load), read for that
 * job id in the table's location. It never rejects.
 *
 * The job's insert and its file go in one request, which BigQuery acts on
 * only once it has the whole body, and the body ends only once the file has
 * been read to its end. So:
 *
 * - A file that cannot be read sends no request: `kept`.
 * - An upload that fails, or that BigQuery has not answered by `timeoutMs`,
 *   before the file was read to its end is aborted and created no job:
 *   `kept`, at once on a failure, after the cancel and confirm below at
 *   `timeoutMs`.
 * - A job insert BigQuery answered with a 401 or 403 created no job:
 *   `kept`, at once. One answered with a 400 or 404 created none when its
 *   job id then reads as unknown to BigQuery: `kept`, at once.
 * - Any other client error before `timeoutMs` is followed by reads of the
 *   job's state until `timeoutMs` from the start, since the job may still
 *   be running or not yet created.
 * - A load with no confirmed final state at `timeoutMs`, whether its client
 *   is still waiting or failed earlier, is cancelled, the cancel waited for
 *   at most `cancelTimeoutMs`, and the job's state read for at most
 *   `confirmTimeoutMs`, so no load is left running uncancelled. An upload
 *   still unanswered then is aborted first. One aborted after its body
 *   ended may have reached BigQuery whole, so with no job confirmed it
 *   stays `unknown`.
 *
 * One call thus takes at most `timeoutMs + cancelTimeoutMs +
 * confirmTimeoutMs`, LOAD_SLOT_MS by default.
 */
export const loadWithin = async ({
    table,
    file,
    metadata,
    timeoutMs = LOAD_TIMEOUT_MS,
    cancelTimeoutMs = CANCEL_TIMEOUT_MS,
    confirmTimeoutMs = CONFIRM_TIMEOUT_MS,
    pollMs = CONFIRM_POLL_MS,
}: {
    table: Table;
    file: string;
    metadata: JobLoadMetadata;
    timeoutMs?: number;
    cancelTimeoutMs?: number;
    confirmTimeoutMs?: number;
    pollMs?: number;
}): Promise<Load> => {
    try {
        await fs.stat(file);
    } catch (error) {
        return {
            outcome: 'kept',
            error: new Error(`load not sent: ${messageOf(error)}`, { cause: error }),
        };
    }

    try {
        const jobId = `website_export_${randomUUID()}`;
        const job = table.bigQuery.job(jobId, { location: table.location });
        const deadline = Date.now() + timeoutMs;
        // BigQuery answered the insert with a job.
        let inserted = false;
        // The file was read to its end, so the pipe ended the request's body.
        let sent = false;
        // The client deletes `jobId` from the metadata it is given.
        const upload = table.createWriteStream({ ...metadata, jobId });
        const source = createReadStream(file);
        const load = new Promise<void>((resolve, reject) => {
            source.on('end', () => {
                sent = true;
            });
            source.on('error', reject);
            upload.on('job', () => {
                inserted = true;
            });
            // The client emits `complete` once the job is DONE without an
            // error, and fails the stream on a job DONE with one.
            upload.on('complete', () => resolve());
            upload.on('error', reject);
        });

        source.pipe(upload);

        // A load left running past its timeout settles unobserved.
        load.catch(() => undefined);

        let failure: { error: unknown } | undefined;
        // An upload aborted at the timeout, and whether its body had ended.
        let aborted: { sent: boolean } | undefined;

        try {
            if ((await within(load, timeoutMs)) !== TIMED_OUT) {
                return { outcome: 'replaced', late: null };
            }

            if (!inserted) {
                aborted = { sent };
                source.destroy();
                upload.destroy();
            }
        } catch (error) {
            failure = { error };
            source.destroy();
            upload.destroy();

            const kept = (): Load => ({
                outcome: 'kept',
                error: new Error(`load failed: ${messageOf(error)}`, { cause: error }),
            });

            // An incomplete request, or one refused for its caller, creates no job.
            if (!inserted && (!sent || UNAUTHORISED.has(httpStatus(error) ?? 0))) {
                return kept();
            }

            if (
                !inserted &&
                REFUSED.has(httpStatus(error) ?? 0) &&
                (await within(readState(job), Math.max(0, deadline - Date.now()))) === 'absent'
            ) {
                return kept();
            }

            const outcome = await finalState(job, Math.max(0, deadline - Date.now()), pollMs);

            if (outcome === 'replaced') {
                return { outcome: 'replaced', late: 'failure' };
            }

            if (outcome === 'kept') {
                return kept();
            }
        }

        const cancel = await within(
            job.cancel().then(
                () => 'cancel accepted',
                (error: unknown) => `cancel refused: ${messageOf(error)}`,
            ),
            cancelTimeoutMs,
        );
        const outcome = await finalState(job, confirmTimeoutMs, pollMs);

        if (outcome === 'replaced') {
            return { outcome: 'replaced', late: 'timeout' };
        }

        const ended =
            aborted !== undefined
                ? `upload ran past ${timeoutMs / 1000} s and was aborted ${aborted.sent ? 'after' : 'before'} its body ended`
                : failure === undefined
                  ? `load ran past ${timeoutMs / 1000} s`
                  : `load failed: ${messageOf(failure.error)}, its job unconfirmed after ${timeoutMs / 1000} s`;
        const cancelled =
            cancel === TIMED_OUT ? `cancel unanswered after ${cancelTimeoutMs / 1000} s` : cancel;

        return {
            // An incomplete request creates no job.
            outcome: aborted?.sent === false ? 'kept' : outcome,
            error: new Error(`${ended}, ${cancelled}`, { cause: failure?.error }),
        };
    } catch (error) {
        // A fault once the request may have started, which can have created the job.
        return {
            outcome: 'unknown',
            error: new Error(`load failed: ${messageOf(error)}`, { cause: error }),
        };
    }
};

/**
 * What `load` left in its table. A load that rejects broke its contract
 * after it may have sent a request, so its table is `unknown`.
 */
export const settleLoad = async (load: () => Promise<Load>): Promise<Load> => {
    try {
        return await load();
    } catch (error) {
        return {
            outcome: 'unknown',
            error: new Error(`load failed: ${messageOf(error)}`, { cause: error }),
        };
    }
};

/** The export's BigQuery dataset, each call bounded in time. */
export type ExportBigQuery = {
    tableExists(table: string): Promise<boolean>;
    createTable(table: string, options: TableMetadata): Promise<void>;
    /** The table's schema fields, none for a table without a schema. */
    tableFields(table: string): Promise<TableField[]>;
    /** A query's rows. Its job stops on the server past 2 minutes or MAX_BYTES_BILLED. */
    query<T>(sql: string, params?: Record<string, string>): Promise<T[]>;
    /** Loads `file` into `table` (loadWithin). Never rejects. */
    load(table: string, file: string, metadata: JobLoadMetadata): Promise<Load>;
};

/**
 * The ExportBigQuery over the dataset `datasetId`, in `location`, where
 * each load runs and is read back. Every call but `load` throws once
 * `callMs` pass with it unanswered.
 */
export const exportBigQuery = ({
    projectId,
    datasetId,
    location,
    bigquery = new BigQuery({ projectId, location }),
    callMs = BIGQUERY_CALL_MS,
}: {
    projectId: string;
    datasetId: string;
    location: string;
    bigquery?: BigQuery;
    callMs?: number;
}): ExportBigQuery => {
    const dataset = bigquery.dataset(datasetId);

    const call = async <T>(work: Promise<T>): Promise<T> => {
        const result = await within(work, callMs);

        if (result === TIMED_OUT) {
            throw new Error(`a BigQuery call ran past ${callMs / 1000} s`);
        }

        return result;
    };

    return {
        async tableExists(table) {
            const [exists] = await call(dataset.table(table).exists());

            return exists;
        },
        async createTable(table, options) {
            await call(dataset.createTable(table, options));
        },
        async tableFields(table) {
            const [metadata] = await call(dataset.table(table).getMetadata());

            return metadata.schema?.fields ?? [];
        },
        async query(sql, params) {
            const [rows] = await call(
                bigquery.query({
                    query: sql,
                    params,
                    maximumBytesBilled: String(MAX_BYTES_BILLED),
                    jobTimeoutMs: BIGQUERY_TIMEOUT_MS,
                }),
            );

            return rows;
        },
        load: (table, file, metadata) =>
            loadWithin({ table: dataset.table(table), file, metadata }),
    };
};
