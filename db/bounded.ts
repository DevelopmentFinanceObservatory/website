import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import {
    BigQuery,
    type Job,
    type Table,
    type TableField,
    type TableMetadata,
} from '@google-cloud/bigquery';
import type { Pool } from 'pg';

import { buildRuntimePool } from './connection.ts';
import { type LoadConfiguration, type LoadRequest, loadUpload, uploadUrl } from './load-upload.ts';

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
 * cancel. `kept`: the job is DONE with an error, or the load created no job
 * (loadWithin lists when). `unknown`: anything else, such as a job still
 * running, a job id BigQuery does not know after a whole request that got no
 * answer, or a state that cannot be read.
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
 * The codes of a request that never reached BigQuery: its host was not
 * found, or no connection to it could be made, so no byte of it was sent.
 */
const UNCONNECTED = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
]);

const unconnected = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    UNCONNECTED.has(error.code);

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
 * when no read by `ms` found it DONE, with no read after one left
 * unanswered at `ms`. `onRunning` runs after each read that
 * finds the job running, given half the time left, and when it says it
 * acted the job is read again at once, in the other half.
 */
const finalState = async (
    job: Job,
    ms: number,
    pollMs: number,
    onRunning: (ms: number) => Promise<boolean> = async () => false,
): Promise<'replaced' | 'kept' | 'unknown'> => {
    const until = Date.now() + ms;

    for (;;) {
        const state = await within(readState(job), Math.max(0, until - Date.now()));

        if (state === 'replaced' || state === 'kept') {
            return state;
        }

        // A read still unanswered when its timer ends has spent the time
        // left, though Date.now() can still read short of `until`: a timer
        // runs on the event loop's cached clock, which lags Date.now().
        if (state === TIMED_OUT) {
            return 'unknown';
        }

        if (
            state === 'running' &&
            Date.now() < until &&
            (await onRunning(Math.max(0, until - Date.now()) / 2))
        ) {
            continue;
        }

        const wait = Math.min(pollMs, until - Date.now());

        if (wait <= 0) {
            return 'unknown';
        }

        await sleep(wait);
    }
};

/**
 * One cancel of `job`, waited for at most `ms`: what BigQuery answered, and
 * whether it knew no job of that id then (a 404), so the job, created
 * later, has had no cancel.
 */
const cancelJob = async (job: Job, ms: number): Promise<{ answer: string; absent: boolean }> => {
    const answer = await within(
        job.cancel().then(
            () => null,
            (error: unknown) => ({ error }),
        ),
        ms,
    );

    if (answer === TIMED_OUT) {
        return { answer: `cancel unanswered after ${ms / 1000} s`, absent: false };
    }

    if (answer === null) {
        return { answer: 'cancel accepted', absent: false };
    }

    return {
        answer: `cancel refused: ${messageOf(answer.error)}`,
        absent: httpStatus(answer.error) === 404,
    };
};

/**
 * The job `jobId` of `table`'s project and location, as BigQuery's own
 * reference `project:location.job` (`bq show -j` takes it), within its
 * sentence of a load's error.
 */
const jobName = (table: Table, jobId: string): string =>
    `job ${table.dataset.projectId}:${table.location === undefined ? '' : `${table.location}.`}${jobId}`;

/**
 * Loads `file` into `table` under a job id of its own, and resolves with
 * what BigQuery confirms the load left in the table (Load), read for that
 * job id in the table's location. It never rejects.
 *
 * The job's insert and its file go in one request (`send`, loadUpload by
 * default), which BigQuery acts on only once it has the whole body, and the
 * body ends only once the file has been read to its end. Nothing shows what
 * the request has sent before BigQuery answers, and the request and the
 * kernel take in a file of up to about 512 KiB whole before the server reads
 * any of it, the size set by the socket buffers, so the read of such a file
 * ends at once and says nothing of the send. A request that never
 * connected, or that BigQuery refused for its caller, created no job either.
 * So, with `kept` at once and no cancel:
 *
 * - a file that cannot be read, or request headers with credentials that
 *   cannot be had within `timeoutMs`, which the request needs before it
 *   sends any byte;
 * - an upload that fails, or that BigQuery has not answered by
 *   `timeoutMs`, before the file was read to its end, whose request is
 *   aborted, which closes its connection;
 * - an upload whose host was not found or refused the connection
 *   (UNCONNECTED);
 * - a job insert BigQuery answered with a 401 or 403, or with a 400 or 404
 *   when its job id then reads as unknown to BigQuery.
 *
 * A request that failed in any other way after its body ended, such as a
 * connection reset, may have reached BigQuery whole, so:
 *
 * - Its job's state is read until `timeoutMs` from the start, since the job
 *   may still be running or not yet created.
 * - A load with no confirmed final state at `timeoutMs`, whether its client
 *   is still waiting or failed earlier, is cancelled, the cancel waited for
 *   at most `cancelTimeoutMs`, and the job's state then read for at most
 *   `confirmTimeoutMs`. An upload still unanswered then is aborted first.
 *   One aborted after its body ended may have reached BigQuery whole and
 *   create its job after a cancel BigQuery refused with a 404, so while the
 *   last cancel was refused that way, each read in those
 *   `confirmTimeoutMs` that finds the job running sends another, waited for
 *   at most half the time left, and the job is read again once it is
 *   answered or that half passes. A job with no confirmed final state by
 *   then is `unknown`, including one BigQuery creates after the last read.
 *
 * The error of every outcome whose job may exist names the job (jobName),
 * so its log line is enough to read or cancel it later.
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
    send = loadUpload,
}: {
    table: Table;
    file: string;
    metadata: LoadConfiguration;
    timeoutMs?: number;
    cancelTimeoutMs?: number;
    confirmTimeoutMs?: number;
    pollMs?: number;
    /** The upload's stream, which emits `job` and `complete` as loadUpload's does. */
    send?: (request: LoadRequest) => Writable;
}): Promise<Load> => {
    const deadline = Date.now() + timeoutMs;
    const jobId = `website_export_${randomUUID()}`;
    const named = jobName(table, jobId);
    let headers: Headers;

    // The request needs its credentials before it sends any byte, so a load
    // whose file or credentials fail here, or whose credentials take past
    // the deadline, sent nothing.
    try {
        await fs.stat(file);

        const authorised = await within(
            table.bigQuery.authClient.getRequestHeaders(uploadUrl(table)),
            Math.max(0, deadline - Date.now()),
        );

        if (authorised === TIMED_OUT) {
            return {
                outcome: 'kept',
                error: new Error(`load not sent: no credentials after ${timeoutMs / 1000} s`),
            };
        }

        headers = authorised;
    } catch (error) {
        return {
            outcome: 'kept',
            error: new Error(`load not sent: ${messageOf(error)}`, { cause: error }),
        };
    }

    try {
        const job = table.bigQuery.job(jobId, { location: table.location });
        // BigQuery answered the insert with a job.
        let inserted = false;
        // The file was read to its end, so the pipe ended the request's body.
        let sourceEnded = false;
        const upload = send({ table, metadata, jobId, headers });
        const source = createReadStream(file);
        const load = new Promise<void>((resolve, reject) => {
            source.on('end', () => {
                sourceEnded = true;
            });
            source.on('error', reject);
            upload.on('job', () => {
                inserted = true;
            });
            // The upload emits `complete` once the job is DONE without an
            // error, and fails on a job DONE with one.
            upload.on('complete', () => resolve());
            upload.on('error', reject);
        });

        source.pipe(upload);

        // A load left running past its timeout settles unobserved.
        load.catch(() => undefined);

        let failure: { error: unknown } | undefined;
        // An upload aborted at the timeout after its body ended.
        let aborted = false;

        try {
            if ((await within(load, Math.max(0, deadline - Date.now()))) !== TIMED_OUT) {
                return { outcome: 'replaced', late: null };
            }

            // The upload's request is aborted, or with its job inserted, its
            // reads of the job stop: the cancel and the reads below own it.
            source.destroy();
            upload.destroy();

            if (!inserted) {
                aborted = true;

                // An incomplete request creates no job, so there is none to cancel.
                if (!sourceEnded) {
                    return {
                        outcome: 'kept',
                        error: new Error(
                            `upload ran past ${timeoutMs / 1000} s and was aborted before its body ended`,
                        ),
                    };
                }
            }
        } catch (error) {
            failure = { error };
            source.destroy();
            upload.destroy();

            const kept = (): Load => ({
                outcome: 'kept',
                error: new Error(`load failed: ${messageOf(error)}`, { cause: error }),
            });
            // A job read DONE with an error, which its error names.
            const keptJob = (): Load => ({
                outcome: 'kept',
                error: new Error(`load failed: ${messageOf(error)}, ${named}`, { cause: error }),
            });

            // An incomplete or unconnected request, or one refused for its
            // caller, creates no job.
            if (
                !inserted &&
                (!sourceEnded || unconnected(error) || UNAUTHORISED.has(httpStatus(error) ?? 0))
            ) {
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
                return keptJob();
            }
        }

        let cancel = await cancelJob(job, cancelTimeoutMs);
        const outcome = await finalState(job, confirmTimeoutMs, pollMs, async (ms) => {
            if (!cancel.absent) {
                return false;
            }

            cancel = await cancelJob(job, ms);
            return true;
        });

        if (outcome === 'replaced') {
            return { outcome: 'replaced', late: 'timeout' };
        }

        const ended = aborted
            ? `upload ran past ${timeoutMs / 1000} s and was aborted after its body ended`
            : failure === undefined
              ? `load ran past ${timeoutMs / 1000} s`
              : `load failed: ${messageOf(failure.error)}, its job unconfirmed after ${timeoutMs / 1000} s`;
        return {
            outcome,
            error: new Error(`${ended}, ${cancel.answer}, ${named}`, { cause: failure?.error }),
        };
    } catch (error) {
        // A fault once the request may have started, which can have created the job.
        return {
            outcome: 'unknown',
            error: new Error(`load failed: ${messageOf(error)}, ${named}`, { cause: error }),
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
    /** The dataset's location, where every query and load job runs and is read back. */
    location: string;
    tableExists(table: string): Promise<boolean>;
    createTable(table: string, options: TableMetadata): Promise<void>;
    /** The table's schema fields, none for a table without a schema. */
    tableFields(table: string): Promise<TableField[]>;
    /**
     * A query's rows, with the dataset as its default, so it names the
     * dataset's tables alone. Its job stops on the server past 2 minutes or
     * MAX_BYTES_BILLED.
     */
    query<T>(sql: string, params?: Record<string, string>): Promise<T[]>;
    /** Loads `file` into `table` (loadWithin). Never rejects. */
    load(table: string, file: string, metadata: LoadConfiguration): Promise<Load>;
};

/**
 * The ExportBigQuery over the dataset `datasetId` in `location`, where each
 * query and load runs and is read back. Without `location` it reads the
 * dataset's own once, in one bounded call, and throws when that gives none.
 * Every call but `load` throws once `callMs` pass with it unanswered.
 */
export const exportBigQuery = async ({
    projectId,
    datasetId,
    location,
    bigquery = new BigQuery({ projectId }),
    callMs = BIGQUERY_CALL_MS,
}: {
    projectId: string;
    datasetId: string;
    location?: string;
    bigquery?: BigQuery;
    callMs?: number;
}): Promise<ExportBigQuery> => {
    const call = async <T>(work: Promise<T>): Promise<T> => {
        const result = await within(work, callMs);

        if (result === TIMED_OUT) {
            throw new Error(`a BigQuery call ran past ${callMs / 1000} s`);
        }

        return result;
    };

    const datasetLocation =
        location ?? (await call(bigquery.dataset(datasetId).getMetadata()))[0].location;

    if (!datasetLocation) {
        throw new Error(
            `no location for the dataset ${datasetId}: EXPORT_BQ_LOCATION is unset and the dataset names none`,
        );
    }

    // Each table of the dataset takes its location, and each load with it.
    const dataset = bigquery.dataset(datasetId, { location: datasetLocation });

    return {
        location: datasetLocation,
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
                    defaultDataset: { projectId, datasetId },
                    maximumBytesBilled: String(MAX_BYTES_BILLED),
                    jobTimeoutMs: BIGQUERY_TIMEOUT_MS,
                    location: datasetLocation,
                }),
            );

            return rows;
        },
        load: (table, file, metadata) =>
            loadWithin({ table: dataset.table(table), file, metadata }),
    };
};
