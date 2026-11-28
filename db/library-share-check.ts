import { setTimeout as sleep } from 'node:timers/promises';
import { asc, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { asRecord } from '../src/lib/asRecord.ts';
import {
    bodyText,
    readShareRecord,
    readSlotCard,
    readSlotFile,
    SharesError,
    type ShareRecord,
    type SharesBackend,
} from '../src/lib/chat/apisShares.ts';
import { BackendError } from '../src/lib/studio/liveBackend.ts';
import { drawSlotCard, pageCards, type PageCard } from '../src/lib/studio/slotCards.ts';
import { libraryArtifact } from './schema.ts';

/**
 * The Library share check (db/check-library-shares.ts): every published
 * Library artifact's share read from dfo-apis' public share routes, as a
 * reader's page reads and draws it. The share (`GET .../shares/{id}`), then
 * each card the page draws from a slot (`pageCards`): the slot's card (`GET
 * .../shares/{id}/slots/{n}`), drawn as the page draws it (`drawSlotCard`),
 * and each such slot's rows (`GET .../shares/{id}/slots/{n}/data`, JSON). A
 * card whose slot is empty, a card that draws nothing, and any refused read
 * fail the artifact. docs/development.md ("Library share check") describes
 * the run.
 */

/** The event name of each failure line, which a log-based metric matches. */
export const FAILURE_EVENT = 'library_share_check_failed';
/** The event name of the line for an artifact that reads. */
export const OK_EVENT = 'library_share_check_ok';
/** The event name of the run's last line, its counts. */
export const SUMMARY_EVENT = 'library_share_check_summary';

/**
 * Why a read failed. `share_gone`: dfo-apis holds no share under the id
 * (404). `empty_slot`: the page draws a card from a slot that holds none,
 * or names no slot. `undrawable`: a slot's card resolves nothing the page
 * can draw. `frame_unavailable`: dfo-apis cannot draw a slot's frame (404
 * `frame_unavailable`). `no_rows`: a live slot answered 200 with no rows.
 * `refused`: any other refusal, a data card with no frame, or an answer the
 * check cannot read. `transient`: a server fault (5xx), a 429, a timeout,
 * or an answer that stopped before its end or never came. The class names
 * the fault; `retryable` decides whether the read is made again.
 */
export type FailureClass =
    | 'share_gone'
    | 'empty_slot'
    | 'undrawable'
    | 'frame_unavailable'
    | 'no_rows'
    | 'refused'
    | 'transient';

const CLASSES: readonly FailureClass[] = [
    'share_gone',
    'empty_slot',
    'undrawable',
    'frame_unavailable',
    'no_rows',
    'refused',
    'transient',
];

/** Which read failed: the share, a page card's slot card (`widget` names
 *  the card), or a slot's rows. */
export type ReadKind = 'share' | 'card' | 'data';

/** One failed read: what it read, dfo-apis' status (null when there was no
 *  answer), the refusal's code, and whether reading again may succeed. */
export type Failure = {
    read: ReadKind;
    slot: number | null;
    widget: string | null;
    class: FailureClass;
    status: number | null;
    code: string;
    retryable: boolean;
};

export type LiveArtifact = { id: string; slug: string; shareId: string };

/** An artifact's reads: the share once read (null while it is not), and
 *  the reads that failed. */
export type ArtifactCheck = {
    artifact: LiveArtifact;
    share: ShareRecord | null;
    failures: Failure[];
};

type ReadAt = Pick<Failure, 'read' | 'slot' | 'widget'>;

const NO_ANSWER = new Set(['backend_unreachable', 'backend_timeout']);

/** The failure a share route's error stands for, at the read `at`. A read
 *  is made again when it met no answer, a 429, a refusal dfo-apis marks
 *  `retryable`, or a 5xx with no problem document of dfo-apis' own, such as
 *  a gateway's. Anything other than a SharesError or BackendError is a
 *  fault of the check, and is thrown. */
export const failureOf = (error: unknown, at: ReadAt): Failure => {
    if (!(error instanceof SharesError || error instanceof BackendError)) {
        throw error;
    }

    const status = error.status ?? null;
    const noAnswer = status === null && NO_ANSWER.has(error.code);
    const retryable =
        noAnswer ||
        status === 429 ||
        error.retryable ||
        (status !== null && status >= 500 && error.code === 'backend_refused');
    const failure = (kind: FailureClass): Failure => ({
        ...at,
        class: kind,
        status,
        code: error.code,
        retryable,
    });

    if (noAnswer || (status !== null && (status >= 500 || status === 429))) {
        return failure('transient');
    }

    if (status === 404 && error.code === 'frame_unavailable') {
        return failure('frame_unavailable');
    }

    if (status === 404 && at.read === 'share') {
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
    const at = { read: 'data' as const, slot, widget: null, status: 200, retryable: false };

    if (!Array.isArray(rows)) {
        return { ...at, class: 'refused', code: 'backend_invalid' };
    }

    return live && rows.length === 0 ? { ...at, class: 'no_rows', code: 'no_rows' } : null;
};

const parsed = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

// A page card read and drawn as the page draws it.
const readCard = async (
    backend: SharesBackend,
    share: ShareRecord,
    page: PageCard,
): Promise<Failure | null> => {
    const at: ReadAt = { read: 'card', slot: page.slot, widget: page.id };

    if (page.slot === null || page.ref === null) {
        return {
            ...at,
            class: 'empty_slot',
            status: null,
            code: page.slot === null ? 'no_slot' : 'slot_empty',
            retryable: false,
        };
    }

    try {
        const { body } = await readSlotCard(backend, share.id, page.slot);

        if (body === null) {
            return {
                ...at,
                class: 'refused',
                status: 304,
                code: 'backend_invalid',
                retryable: false,
            };
        }

        return drawSlotCard(page.held, body)
            ? null
            : {
                  ...at,
                  class: 'undrawable',
                  status: 200,
                  code: 'card_undrawable',
                  retryable: false,
              };
    } catch (error) {
        return failureOf(error, at);
    }
};

// A slot's rows, which its card's data file and table are drawn from.
const readRows = async (
    backend: SharesBackend,
    share: ShareRecord,
    slot: number,
): Promise<Failure | null> => {
    const at: ReadAt = { read: 'data', slot, widget: null };

    if (share.slots.find((entry) => entry.slot === slot)?.card?.frame == null) {
        return { ...at, class: 'refused', status: null, code: 'no_frame', retryable: false };
    }

    try {
        const res = await readSlotFile(backend, share.id, slot, {
            format: 'json',
            bundle: 'false',
        });

        return rowsFailure(parsed(await bodyText(res)), { slot, live: share.mode === 'live' });
    } catch (error) {
        return failureOf(error, at);
    }
};

// The reads of a share's page: each page card's slot card, then the rows of
// each filled slot those cards name, once each.
const pageReads = (share: ShareRecord): ReadAt[] => {
    const cards = pageCards(share);
    const slots = new Set(
        cards.flatMap((page) => (page.ref && page.slot !== null ? [page.slot] : [])),
    );

    return [
        ...cards.map((page): ReadAt => ({ read: 'card', slot: page.slot, widget: page.id })),
        ...[...slots].map((slot): ReadAt => ({ read: 'data', slot, widget: null })),
    ];
};

const runRead = (
    backend: SharesBackend,
    share: ShareRecord,
    at: ReadAt,
): Promise<Failure | null> => {
    if (at.read === 'data' && at.slot !== null) {
        return readRows(backend, share, at.slot);
    }

    const page = pageCards(share).find((card) => card.id === at.widget);

    return page ? readCard(backend, share, page) : Promise.resolve(null);
};

const runReads = async (
    backend: SharesBackend,
    share: ShareRecord,
    reads: ReadAt[],
): Promise<Failure[]> => {
    const failures: Failure[] = [];

    for (const at of reads) {
        const failure = await runRead(backend, share, at);

        if (failure) {
            failures.push(failure);
        }
    }

    return failures;
};

/**
 * Read `artifact`'s share and every read its page makes, in turn. Given
 * `previous`, a check of the same artifact, only its retryable reads are
 * made again and its other failures stand. A share that cannot be read ends
 * the check there.
 */
export const checkArtifact = async (
    backend: SharesBackend,
    artifact: LiveArtifact,
    previous?: ArtifactCheck,
): Promise<ArtifactCheck> => {
    if (previous?.share) {
        const { share } = previous;
        const again = previous.failures.filter((failure) => failure.retryable);
        const kept = previous.failures.filter((failure) => !failure.retryable);

        return { artifact, share, failures: [...kept, ...(await runReads(backend, share, again))] };
    }

    let share: ShareRecord;

    try {
        share = await readShareRecord(backend, artifact.shareId);
    } catch (error) {
        return {
            artifact,
            share: null,
            failures: [failureOf(error, { read: 'share', slot: null, widget: null })],
        };
    }

    return { artifact, share, failures: await runReads(backend, share, pageReads(share)) };
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

// Artifacts read at once. Each makes its reads in turn, so at most this
// many reads are in flight. Under that cap, reading an artifact's slots at
// once would shorten no run that outlasts the cap's first round: a dfo-apis
// that answers nothing makes every read wait out its 35 s call deadline,
// four at a time either way. RUN_DEADLINE_MS bounds that case.
const CONCURRENCY = 4;

/**
 * How long a run has, from the Job command's start, before it stops reading:
 * 57 minutes, three under the Job's 3600 s task timeout. When it passes,
 * every read in flight is aborted and the run logs what it has and exits.
 * The three minutes cover the container's start before the clock does, the
 * log lines and the pool's close after it, and leave the report out well
 * before the platform kills the task.
 */
export const RUN_DEADLINE_MS = 57 * 60_000;

// How long the run waits before making again the reads that failed in a
// way that may pass.
export const RETRY_DELAY_MS = 30_000;

// HTTP statuses whose response has no body.
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/** `backend` with its calls counted: requests made, and bytes of the
 *  bodies read. */
export const meteredBackend = (
    backend: SharesBackend,
): { backend: SharesBackend; stats: { requests: number; bytes: number } } => {
    const stats = { requests: 0, bytes: 0 };
    const fetch: typeof globalThis.fetch = async (input, init) => {
        stats.requests += 1;

        const res = await backend.fetch(input, init);

        if (!res.body || NULL_BODY.has(res.status)) {
            return res;
        }

        const counted = res.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                    stats.bytes += chunk.byteLength;
                    controller.enqueue(chunk);
                },
            }),
        );

        return new Response(counted, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
        });
    };

    return { backend: { ...backend, fetch }, stats };
};

// Runs `work` on `items`, CONCURRENCY at a time, starting none once
// `stop` aborts. Resolves with the items it did not start.
const eachOf = async <T>(
    items: T[],
    work: (item: T) => Promise<void>,
    stop: AbortSignal,
): Promise<T[]> => {
    let next = 0;
    const worker = async () => {
        while (next < items.length && !stop.aborted) {
            await work(items[next++]);
        }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

    return items.slice(next);
};

const hasRetryable = ({ failures }: ArtifactCheck): boolean =>
    failures.some((failure) => failure.retryable);

/**
 * Check every artifact in `artifacts`, four at a time. An artifact whose
 * reads all pass, or fail in a way a second read would not change, is
 * logged as it finishes: one `OK_EVENT` line, or one `FAILURE_EVENT` line
 * per failure. Then, once and after `retryDelayMs`, each retryable read is
 * made again, alone, and its artifact logged. Each line names the artifact
 * by its id and slug, with its `result`, and carries no share id.
 *
 * `deadline` aborts every read in flight and the wait before the second
 * reads. An artifact the run has not concluded by then is `unfinished`: its
 * final failures so far, then one `FAILURE_EVENT` line of class
 * `unfinished`. A read the deadline cut off fails as retryable, so a check
 * with no retryable failure stands whenever it ends. The last line,
 * `SUMMARY_EVENT`, counts the artifacts, the unfinished ones, the failures
 * by class, the reads made again, and the requests, response bytes and
 * milliseconds the run took. 0 when every artifact reads, else 1.
 */
export const checkLibraryShares = async ({
    artifacts,
    backend,
    log,
    deadline = AbortSignal.timeout(RUN_DEADLINE_MS),
    retryDelayMs = RETRY_DELAY_MS,
    wait = (ms, signal) => sleep(ms, undefined, { signal }).catch(() => {}),
    now = Date.now,
}: {
    artifacts: LiveArtifact[];
    backend: SharesBackend;
    log: (line: string) => void;
    deadline?: AbortSignal;
    retryDelayMs?: number;
    wait?: (ms: number, signal: AbortSignal) => Promise<unknown>;
    now?: () => number;
}): Promise<0 | 1> => {
    const started = now();
    const metered = meteredBackend(backend);
    const reads: SharesBackend = { ...metered.backend, signal: deadline };
    const byClass = Object.fromEntries(
        [...CLASSES, 'unfinished' as const].map((kind) => [kind, 0]),
    ) as Record<FailureClass | 'unfinished', number>;
    let failed = 0;
    let unfinished = 0;
    const named = (artifact: LiveArtifact) => ({ artifact: artifact.id, slug: artifact.slug });
    const logFailures = (artifact: LiveArtifact, failures: Failure[]) => {
        for (const { class: kind, ...failure } of failures) {
            byClass[kind] += 1;
            log(
                JSON.stringify({
                    severity: 'ERROR',
                    event: FAILURE_EVENT,
                    message: `${FAILURE_EVENT}: ${artifact.slug} ${kind}`,
                    ...named(artifact),
                    result: 'failed',
                    class: kind,
                    ...failure,
                }),
            );
        }
    };
    const finish = ({ artifact, failures }: ArtifactCheck) => {
        if (failures.length === 0) {
            log(
                JSON.stringify({
                    severity: 'INFO',
                    event: OK_EVENT,
                    message: `${OK_EVENT}: ${artifact.slug}`,
                    ...named(artifact),
                    result: 'ok',
                }),
            );

            return;
        }

        failed += 1;
        logFailures(artifact, failures);
    };
    const leave = ({ artifact, failures }: ArtifactCheck) => {
        failed += 1;
        unfinished += 1;
        logFailures(
            artifact,
            failures.filter((failure) => !failure.retryable),
        );
        byClass.unfinished += 1;
        log(
            JSON.stringify({
                severity: 'ERROR',
                event: FAILURE_EVENT,
                message: `${FAILURE_EVENT}: ${artifact.slug} unfinished`,
                ...named(artifact),
                result: 'unfinished',
                read: null,
                slot: null,
                widget: null,
                class: 'unfinished',
                status: null,
                code: 'run_deadline',
                retryable: false,
            }),
        );
    };
    const again: ArtifactCheck[] = [];

    const unstarted = await eachOf(
        artifacts,
        async (artifact) => {
            const result = await checkArtifact(reads, artifact);

            if (!hasRetryable(result)) {
                finish(result);
            } else if (deadline.aborted) {
                leave(result);
            } else {
                again.push(result);
            }
        },
        deadline,
    );

    let retried = 0;

    if (again.length > 0 && !deadline.aborted) {
        await wait(retryDelayMs, deadline);
    }

    const notRetried = await eachOf(
        again,
        async (previous) => {
            retried += previous.failures.filter((failure) => failure.retryable).length;

            const result = await checkArtifact(reads, previous.artifact, previous);

            if (hasRetryable(result) && deadline.aborted) {
                leave(result);
            } else {
                finish(result);
            }
        },
        deadline,
    );

    for (const previous of notRetried) {
        leave(previous);
    }

    for (const artifact of unstarted) {
        leave({ artifact, share: null, failures: [] });
    }

    log(
        JSON.stringify({
            severity: failed > 0 ? 'ERROR' : 'INFO',
            event: SUMMARY_EVENT,
            message: `${SUMMARY_EVENT}: ${artifacts.length - failed} of ${artifacts.length} artifacts read`,
            artifacts: artifacts.length,
            ok: artifacts.length - failed,
            failed,
            unfinished,
            retried,
            failures: byClass,
            requests: metered.stats.requests,
            bytes: metered.stats.bytes,
            durationMs: now() - started,
        }),
    );

    return failed === 0 ? 0 : 1;
};

/**
 * Run `check`, the whole run, and give its exit code. A run that fails
 * before it can count its artifacts (no settings, no database, a fault of
 * the check) logs one `FAILURE_EVENT` line with class `check_failed` and the
 * error's code, so the same alert fires, and gives 1.
 */
export const guardCheck = async (
    check: () => Promise<0 | 1>,
    log: (line: string) => void,
): Promise<0 | 1> => {
    try {
        return await check();
    } catch (error) {
        const code = asRecord(error)?.['code'];

        log(
            JSON.stringify({
                severity: 'ERROR',
                event: FAILURE_EVENT,
                message: `${FAILURE_EVENT}: the check could not run`,
                class: 'check_failed',
                code:
                    typeof code === 'string'
                        ? code
                        : error instanceof Error
                          ? error.name
                          : 'unknown',
                detail: error instanceof Error ? error.message : String(error),
            }),
        );

        return 1;
    }
};
