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
 * What a load left in its table, as far as BigQuery confirms it: the
 * file's rows when its job is DONE without an error (`replaced`), the
 * table as it was when its job is DONE with one (`kept`), and either in
 * every other case (`unknown`): a job still pending or running, a job id
 * BigQuery does not know, which an upload still in flight can yet create,
 * or a state that cannot be read.
 */
type LoadOutcome = 'kept' | 'replaced' | 'unknown';

/** What a failed load left in its table. Only these outcomes are failures. */
export type FailedOutcome = Exclude<LoadOutcome, 'replaced'>;

/**
 * What a load that replaced its table resolves to. `late` is null for a
 * load whose client reported success in time. Otherwise the client did not
 * report it, and BigQuery confirmed the job DONE without an error: within
 * the load's budget after the client reported a failure (`failure`), or
 * after the budget ended and the job was cancelled (`timeout`).
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
 * from before loadWithin was called, so no request reached BigQuery and
 * the table is `kept`.
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
 * The job's final state, read every `pollMs` until it is DONE or `ms`
 * pass: `kept` when the job failed, since a failed WRITE_TRUNCATE load
 * leaves its table as it was, `replaced` when it succeeded, and `unknown`
 * when no read by `ms` found it DONE.
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

/**
 * Loads `file` into `table` under a job id of its own, and resolves once
 * the upload is done and the client reports the job finished. The outcome
 * of any other load is what BigQuery confirms for that job id, read in the
 * table's location:
 *
 * - a client error before `timeoutMs` is followed by reads of the job's
 *   state until `timeoutMs` from the start, since the job may still be
 *   running or not yet created;
 * - a load with no confirmed final state at `timeoutMs`, whether its client
 *   is still waiting or failed earlier, is cancelled, the cancel waited for
 *   at most `cancelTimeoutMs`, and the job's state read for at most
 *   `confirmTimeoutMs`, so no load is left running uncancelled.
 *
 * A job DONE without an error replaced the table, so the call resolves
 * with `late`. Any other state throws a LoadError whose `outcome` says what
 * the table holds (LoadOutcome). No point in the client's upload proves
 * that no request reached BigQuery, so a failure before the job exists is
 * `unknown`. One call thus takes at most `timeoutMs + cancelTimeoutMs +
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
    const job = table.bigQuery.job(jobId, { location: table.location });
    const deadline = Date.now() + timeoutMs;
    // The client deletes `jobId` from the metadata it is given.
    const load = table
        .createLoadJob(file, { ...metadata, jobId })
        .then(([created]) => created.promise());

    // A load left running past its timeout settles unobserved.
    load.catch(() => undefined);

    let failure: { error: unknown } | undefined;

    try {
        if ((await within(load, timeoutMs)) !== TIMED_OUT) {
            return { late: null };
        }
    } catch (error) {
        failure = { error };

        const outcome = await finalState(job, Math.max(0, deadline - Date.now()), pollMs);

        if (outcome === 'replaced') {
            return { late: 'failure' };
        }

        if (outcome === 'kept') {
            throw new LoadError(`load failed: ${messageOf(error)}`, outcome, { cause: error });
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
        return { late: 'timeout' };
    }

    const ended =
        failure === undefined
            ? `load ran past ${timeoutMs / 1000} s`
            : `load failed: ${messageOf(failure.error)}, its job unconfirmed after ${timeoutMs / 1000} s`;

    throw new LoadError(
        `${ended}, ${
            cancel === TIMED_OUT ? `cancel unanswered after ${cancelTimeoutMs / 1000} s` : cancel
        }`,
        outcome,
        { cause: failure?.error },
    );
};
