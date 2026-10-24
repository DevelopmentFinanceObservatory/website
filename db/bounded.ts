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

/**
 * Loads `file` into `table` and resolves once the upload is done and the
 * load job has finished, or throws if it failed. The client takes no
 * timeout for an upload, so a load still running at `timeoutMs` is
 * cancelled, the cancel waited for at most `cancelTimeoutMs`, and the call
 * throws. A cancel that comes too late leaves the table holding the whole
 * file.
 */
export const loadWithin = async ({
    table,
    file,
    metadata,
    timeoutMs = LOAD_TIMEOUT_MS,
    cancelTimeoutMs = CANCEL_TIMEOUT_MS,
}: {
    table: Table;
    file: string;
    metadata: JobLoadMetadata;
    timeoutMs?: number;
    cancelTimeoutMs?: number;
}): Promise<void> => {
    let job: Job | undefined;
    const load = (async () => {
        [job] = await table.createLoadJob(file, metadata);
        await job.promise();
    })();

    // A load left running past its timeout settles unobserved.
    load.catch(() => undefined);

    if ((await within(load, timeoutMs)) === TIMED_OUT) {
        if (job) {
            await within(
                job.cancel().catch(() => undefined),
                cancelTimeoutMs,
            );
        }

        throw new Error(`load ran past ${timeoutMs / 1000} s and was cancelled`);
    }
};
