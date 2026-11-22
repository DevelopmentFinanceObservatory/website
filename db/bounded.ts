import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import type { Job, JobLoadMetadata, Table } from '@google-cloud/bigquery';

/**
 * Time bounds for the export Job's calls (db/export-events.ts) whose
 * clients take none: a database query over a connection that stalls past
 * Postgres's own timeout, a BigQuery call, and a BigQuery load of a local
 * file and its cancel.
 */

/** The `statement_timeout` of the export Job's pool. */
export const STATEMENT_TIMEOUT_MS = 5 * 60_000;

/**
 * How long past its server-side bound a query may run before the Job stops
 * waiting for it, for a connection that stalls where the server's timeout
 * cannot reach it.
 */
export const QUERY_GRACE_MS = 5_000;

/** How long one BigQuery load may run, upload included. */
export const LOAD_TIMEOUT_MS = 2 * 60_000;

/**
 * How long a load that did not succeed in time may take to find its job and
 * cancel it: the wait for an unfinished upload to create the job, or the
 * read of whether a failed upload created it, and then the cancel.
 */
export const CANCEL_TIMEOUT_MS = 10_000;

/**
 * How long the final state of a load that did not report success in time
 * is read for, after its cancel. BigQuery cancels a job on a best-effort
 * basis, so a cancelled or failed load can still have replaced its table.
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
 * What a load left in its table: the file's rows (`replaced`), the table
 * as it was (`kept`), or either when BigQuery did not confirm the job's
 * final state in time (`unknown`).
 */
type LoadOutcome = 'kept' | 'replaced' | 'unknown';

/** What a failed load left in its table. Only these outcomes are failures. */
export type FailedOutcome = Exclude<LoadOutcome, 'replaced'>;

/**
 * What a load that replaced its table resolves to. `late` is null for a
 * load whose client reported success in time. Otherwise BigQuery confirmed
 * the job finished only after the Job stopped waiting for it: after the
 * load's timeout (`timeout`), or after the client reported a failure
 * (`failure`).
 */
export type LoadResult = { late: null | 'timeout' | 'failure' };

/** What loadWithin throws: the failure and the outcome BigQuery confirmed. */
export class LoadError extends Error {
    readonly outcome: FailedOutcome;

    constructor(message: string, outcome: FailedOutcome, options?: ErrorOptions) {
        super(message, options);
        this.name = 'LoadError';
        this.outcome = outcome;
    }
}

/**
 * What a failed load left in its table. Any error but a LoadError comes
 * from before the load started, so the table is `kept`.
 */
export const loadOutcome = (error: unknown): FailedOutcome =>
    error instanceof LoadError ? error.outcome : 'kept';

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

/** `call`'s result, or a throw of `timedOut()` once `ms` pass with it still running. */
export const callWithin = async <T>(
    call: Promise<T>,
    ms: number,
    timedOut: () => Error,
): Promise<T> => {
    const result = await within(call, ms);

    if (result === TIMED_OUT) {
        throw timedOut();
    }

    return result;
};

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * The job's final state, read until it is DONE or `ms` pass: `kept` when
 * the job failed, since a failed WRITE_TRUNCATE load leaves its table as it
 * was, `replaced` when it succeeded, `unknown` when it is still pending or
 * running, or its state could not be read, at `ms`.
 */
const finalState = async (job: Job, ms: number, pollMs: number): Promise<LoadOutcome> => {
    const until = Date.now() + ms;
    const read = async (): Promise<LoadOutcome | null> => {
        const [metadata] = await job.getMetadata();

        if (metadata.status?.state !== 'DONE') {
            return null;
        }

        return metadata.status.errorResult ? 'kept' : 'replaced';
    };

    for (;;) {
        const state = await within(
            read().catch(() => null),
            Math.max(0, until - Date.now()),
        );

        if (state !== TIMED_OUT && state !== null) {
            return state;
        }

        const wait = Math.min(pollMs, until - Date.now());

        if (wait <= 0) {
            return 'unknown';
        }

        await sleep(wait);
    }
};

/** Whether `error` is BigQuery's answer for a job id it does not know. */
const isNotFound = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 404;

/**
 * Loads `file` into `table` under a job id of its own, and resolves once
 * the upload is done and the load job has finished. The client takes no
 * timeout for an upload, so a load still running at `timeoutMs` stops
 * being waited for. A load that did not succeed in time, by its timeout or
 * by a client error, then has its job found and cancelled within
 * `cancelTimeoutMs`, and the job's final state read for at most
 * `confirmTimeoutMs`, since a cancel can fail or come too late and a client
 * error can hide a job that is still running or finished:
 *
 * - an upload still unfinished at the end of the cancel's wait may yet
 *   create its job, so the outcome is `unknown`;
 * - an upload or create call that failed is followed by a read of its job
 *   id: a job id BigQuery does not know leaves the table `kept`, a state
 *   that cannot be read is `unknown`, and a job that exists is cancelled;
 * - a cancelled job that finished cleanly replaced the table, so the call
 *   resolves with `late`, and any other final state throws a LoadError
 *   whose `outcome` says what the table holds.
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
}): Promise<LoadResult> => {
    const jobId = `website_export_${randomUUID()}`;
    let job: Job | undefined;
    // The client deletes `jobId` from the metadata it is given.
    const created = table.createLoadJob(file, { ...metadata, jobId }).then(([createdJob]) => {
        job = createdJob;
        return createdJob;
    });
    const load = created.then((createdJob) => createdJob.promise());

    // A load left running past its timeout settles unobserved.
    load.catch(() => undefined);

    let failure: unknown;
    let late: 'timeout' | 'failure';

    try {
        if ((await within(load, timeoutMs)) !== TIMED_OUT) {
            return { late: null };
        }

        late = 'timeout';
    } catch (error) {
        failure = error;
        late = 'failure';
    }

    const cancelBy = Date.now() + cancelTimeoutMs;
    const what =
        late === 'timeout'
            ? `load ran past ${timeoutMs / 1000} s`
            : `load failed: ${messageOf(failure)}`;
    const left = () => Math.max(0, cancelBy - Date.now());

    if (job === undefined) {
        const upload = await within(
            created.then(
                () => 'created' as const,
                () => 'failed' as const,
            ),
            left(),
        );

        if (upload === TIMED_OUT) {
            throw new LoadError(`${what} with its upload unfinished`, 'unknown', {
                cause: failure,
            });
        }

        if (upload === 'failed') {
            const handle = table.bigQuery.job(jobId, { location: table.location });
            const known = await within(
                handle.getMetadata().then(
                    () => 'exists' as const,
                    (error: unknown) => (isNotFound(error) ? ('missing' as const) : null),
                ),
                left(),
            );

            if (known === 'missing') {
                throw new LoadError(`${what}, no job created`, 'kept', { cause: failure });
            }

            if (known !== 'exists') {
                throw new LoadError(`${what}, its job could not be read`, 'unknown', {
                    cause: failure,
                });
            }

            job = handle;
        }
    }

    const found: Job = job ?? (await created);
    const cancelled = await within(
        found.cancel().then(
            () => true,
            () => false,
        ),
        left(),
    );
    const outcome = await finalState(found, confirmTimeoutMs, pollMs);

    if (outcome === 'replaced') {
        return { late };
    }

    throw new LoadError(
        `${what}, ${cancelled === true ? 'cancel sent' : 'cancel failed'}`,
        outcome,
        {
            cause: failure,
        },
    );
};
