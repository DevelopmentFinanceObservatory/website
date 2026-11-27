import { setTimeout as sleep } from 'node:timers/promises';
import { asc, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { asRecord } from '../src/lib/asRecord.ts';
import {
    readShare,
    readSlotFile,
    SharesError,
    type SharesBackend,
} from '../src/lib/chat/apisShares.ts';
import { libraryArtifact } from './schema.ts';

/**
 * The Library share check (db/check-library-shares.ts): every published
 * Library artifact's share read from dfo-apis' public share routes, as a
 * reader's page reads it. The share (`GET .../shares/{id}`), then the rows
 * of each slot that draws a frame (`GET .../shares/{id}/slots/{n}/data`,
 * JSON). A slot that draws no frame, a note's, has no rows to read.
 * docs/development.md ("Library share check") describes the run.
 */

/** The event name of each failure line, which a log-based metric matches. */
export const FAILURE_EVENT = 'library_share_check_failed';
/** The event name of the run's last line, its counts. */
export const SUMMARY_EVENT = 'library_share_check_summary';

/**
 * Why a read failed. `share_gone`: dfo-apis holds no share under the id
 * (404). `frame_unavailable`: a slot's frame can no longer be drawn (404
 * `frame_unavailable`). `no_rows`: a live slot answered 200 with no rows.
 * `refused`: any other refusal or an answer the check cannot read.
 * `transient`: a server fault (5xx), a 429, a timeout or no answer.
 */
export type FailureClass = 'share_gone' | 'frame_unavailable' | 'no_rows' | 'refused' | 'transient';

/** One failed read: the slot it read (null for the share), dfo-apis'
 *  status (null when there was no answer) and the refusal's code. */
export type Failure = {
    class: FailureClass;
    slot: number | null;
    status: number | null;
    code: string;
};

export type LiveArtifact = { id: string; slug: string; shareId: string };

export type ArtifactCheck = { artifact: LiveArtifact; failures: Failure[] };

const NO_ANSWER = new Set(['backend_unreachable', 'backend_timeout']);

/** The failure a share route's error stands for, read at `slot` (null for
 *  the share itself). Anything other than a SharesError is a fault of the
 *  check, and is thrown. */
export const failureOf = (error: unknown, slot: number | null): Failure => {
    if (!(error instanceof SharesError)) {
        throw error;
    }

    const status = error.status ?? null;
    const failure = (kind: FailureClass): Failure => ({
        class: kind,
        slot,
        status,
        code: error.code,
    });

    if (status === null) {
        return failure(NO_ANSWER.has(error.code) ? 'transient' : 'refused');
    }

    if (status >= 500 || status === 429) {
        return failure('transient');
    }

    if (status === 404 && error.code === 'frame_unavailable') {
        return failure('frame_unavailable');
    }

    if (status === 404 && slot === null) {
        return failure('share_gone');
    }

    return failure('refused');
};

/** The failure a slot's JSON rows document stands for, or null when it
 *  holds rows, or none in a snapshot, which shows what it was published
 *  with. */
export const rowsFailure = (
    document: unknown,
    { slot, live }: { slot: number; live: boolean },
): Failure | null => {
    const rows = asRecord(document)?.['rows'];

    if (!Array.isArray(rows)) {
        return { class: 'refused', slot, status: 200, code: 'backend_invalid' };
    }

    return live && rows.length === 0
        ? { class: 'no_rows', slot, status: 200, code: 'no_rows' }
        : null;
};

/** Read `artifact`'s share and the rows of each of its slots that draws a
 *  frame, in turn. A share that cannot be read ends the check there. */
export const checkArtifact = async (
    backend: SharesBackend,
    artifact: LiveArtifact,
): Promise<ArtifactCheck> => {
    const share = await readShare(backend, artifact.shareId).catch((error: unknown) =>
        failureOf(error, null),
    );

    if (share === null) {
        return {
            artifact,
            failures: [{ class: 'share_gone', slot: null, status: 404, code: 'not_found' }],
        };
    }

    if ('class' in share) {
        return { artifact, failures: [share] };
    }

    const failures: Failure[] = [];

    for (const { slot, card } of share.slots) {
        if (card?.frame == null) {
            continue;
        }

        try {
            const res = await readSlotFile(backend, artifact.shareId, slot, {
                format: 'json',
                bundle: 'false',
            });
            const failure = rowsFailure(await res.json().catch(() => null), {
                slot,
                live: share.mode === 'live',
            });

            if (failure) {
                failures.push(failure);
            }
        } catch (error) {
            failures.push(failureOf(error, slot));
        }
    }

    return { artifact, failures };
};

/** Every published artifact, oldest first. */
export const readLiveArtifacts = (db: Pick<NodePgDatabase, 'select'>): Promise<LiveArtifact[]> =>
    db
        .select({
            id: libraryArtifact.id,
            slug: libraryArtifact.slug,
            shareId: libraryArtifact.shareId,
        })
        .from(libraryArtifact)
        .where(isNull(libraryArtifact.withdrawnAt))
        .orderBy(asc(libraryArtifact.publishedAt), asc(libraryArtifact.id));

// Artifacts read at once. Each reads its slots in turn, so at most this
// many reads are in flight.
const CONCURRENCY = 4;

// How long the run waits before reading again each artifact a transient
// failure stopped.
export const RETRY_DELAY_MS = 30_000;

const checkAll = async (
    artifacts: LiveArtifact[],
    check: (artifact: LiveArtifact) => Promise<ArtifactCheck>,
): Promise<ArtifactCheck[]> => {
    const results: ArtifactCheck[] = new Array(artifacts.length);
    let next = 0;
    const worker = async () => {
        while (next < artifacts.length) {
            const index = next++;

            results[index] = await check(artifacts[index]);
        }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, artifacts.length) }, worker));

    return results;
};

/**
 * Check every artifact in `artifacts`, then read again, once and after
 * `retryDelayMs`, each one a transient failure stopped, and keep the second
 * result. Logs one `FAILURE_EVENT` line per failure that remains, then one
 * `SUMMARY_EVENT` line with the counts. 0 when every artifact reads, else 1.
 */
export const checkLibraryShares = async ({
    artifacts,
    check,
    log,
    retryDelayMs = RETRY_DELAY_MS,
    wait = (ms) => sleep(ms),
}: {
    artifacts: LiveArtifact[];
    check: (artifact: LiveArtifact) => Promise<ArtifactCheck>;
    log: (line: string) => void;
    retryDelayMs?: number;
    wait?: (ms: number) => Promise<unknown>;
}): Promise<0 | 1> => {
    const first = await checkAll(artifacts, check);
    const transient = (result: ArtifactCheck) =>
        result.failures.some((failure) => failure.class === 'transient');
    const retry = first.filter(transient).map((result) => result.artifact);
    let results = first;

    if (retry.length > 0) {
        await wait(retryDelayMs);

        const second = new Map(
            (await checkAll(retry, check)).map((result) => [result.artifact.id, result]),
        );

        results = first.map((result) => second.get(result.artifact.id) ?? result);
    }

    const byClass: Record<FailureClass, number> = {
        share_gone: 0,
        frame_unavailable: 0,
        no_rows: 0,
        refused: 0,
        transient: 0,
    };

    for (const { artifact, failures } of results) {
        for (const failure of failures) {
            byClass[failure.class] += 1;
            log(
                JSON.stringify({
                    severity: 'ERROR',
                    event: FAILURE_EVENT,
                    message: `${FAILURE_EVENT}: ${artifact.slug} ${failure.class}`,
                    artifact: artifact.id,
                    slug: artifact.slug,
                    share: artifact.shareId,
                    slot: failure.slot,
                    class: failure.class,
                    status: failure.status,
                    code: failure.code,
                }),
            );
        }
    }

    const failed = results.filter((result) => result.failures.length > 0).length;

    log(
        JSON.stringify({
            severity: failed > 0 ? 'ERROR' : 'INFO',
            event: SUMMARY_EVENT,
            message: `${SUMMARY_EVENT}: ${results.length - failed} of ${results.length} artifacts read`,
            artifacts: results.length,
            ok: results.length - failed,
            failed,
            retried: retry.length,
            failures: byClass,
        }),
    );

    return failed === 0 ? 0 : 1;
};
