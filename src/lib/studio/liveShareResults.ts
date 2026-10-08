import { and, eq, getTableColumns, sql } from 'drizzle-orm';

import { share, shareCardResult } from '../../../db/schema.ts';
import { snapshotOwnedShare, type OwnerWriteResult, type ShareDb } from '../chat/shareWrites.ts';
import type { FrameRef } from '../chat/widgets.ts';
import type { LiveCard } from './liveBackend.ts';

/**
 * The last answer of each live card's refresh, and the lease that bounds the
 * back-end calls a card can cause (table `share_card_result`).
 *
 * A request answers from the card's row while the row is fresh. Once it is
 * stale, the one request whose `takeLease` moves `lease_until` into the
 * future asks the back end and stores the answer. Every other request
 * answers from the row while it is fresh, and `pending` while the holder
 * works, so no viewer settles on an answer older than its window. A card
 * therefore costs one back-end refresh per window whatever the traffic,
 * across every server instance. A holder that dies leaves a lease that
 * lapses after `LEASE_SECONDS`.
 *
 * Each function takes the database handle first, so `node --test` runs them
 * on a migrated test database.
 */

export type LiveResult =
    | { status: 'current'; card: LiveCard }
    | { status: 'redrawn'; card: LiveCard; frame: FrameRef }
    | { status: 'pending'; retryAfterS: number }
    // `retryable` is what the refusing back end said about asking again.
    // `retryAfterS` is how long the stored answer stands, so the whole
    // seconds after which a request reaches the back end again.
    | { status: 'error'; code: string; retryable?: boolean; retryAfterS?: number };

type Env = Record<string, string | undefined>;

type CardKey = { shareId: string; cardId: string };

// A 'current' or 'redrawn' answer stands this long. dfo-apis rechecks a
// dataset's head at most every 900 seconds (`head_recheck_seconds`), so a
// longer window would only delay a redraw.
const DEFAULT_WINDOW_SECONDS = 300;
const MAX_WINDOW_SECONDS = 900;

// An 'error' answer stands this long, so a failure that clears is retried
// within half a minute and one that persists costs two back-end calls a
// minute for the card.
const ERROR_WINDOW_SECONDS = 30;

// A 'pending' answer stands for the wait it asks of the viewer, so the
// viewer's next call is the one that reaches the back end and moves a
// queued rebuild or a resumed replay forward. The wait the back end names
// is held within these bounds.
const DEFAULT_PENDING_SECONDS = 5;
const MIN_PENDING_SECONDS = 2;
const MAX_PENDING_SECONDS = 60;

// How long one request may hold a card's lease. `REFRESH_DEADLINE_MS` is
// shorter, so a holder has answered or given up before its lease lapses. That
// deadline holds the 60 seconds the call to dfo-ai may take
// (`AI_REFRESH_TIMEOUT_MS`) and 15 for the component read before the call.
export const LEASE_SECONDS = 90;
export const REFRESH_DEADLINE_MS = 75_000;

// The wait asked of a request that found another holding the lease of a card
// with no fresh answer.
const LEASE_WAIT_SECONDS = 2;

/** How long a 'current' or 'redrawn' answer stands, in seconds:
 *  `LIVE_SHARE_WINDOW_S` when it is a positive number, capped at 900. */
export const liveWindowSeconds = (env: Env): number => {
    const override = Number(env.LIVE_SHARE_WINDOW_S);

    return Number.isFinite(override) && override > 0
        ? Math.min(override, MAX_WINDOW_SECONDS)
        : DEFAULT_WINDOW_SECONDS;
};

/** The wait a 'pending' answer asks, from the wait the back end named. */
export const pendingSeconds = (named: number | null): number =>
    named === null || !Number.isFinite(named)
        ? DEFAULT_PENDING_SECONDS
        : Math.min(Math.max(Math.ceil(named), MIN_PENDING_SECONDS), MAX_PENDING_SECONDS);

const freshSeconds = (result: LiveResult, windowSeconds: number): number => {
    if (result.status === 'pending') {
        return result.retryAfterS;
    }

    return result.status === 'error' ? ERROR_WINDOW_SECONDS : windowSeconds;
};

const inSeconds = (seconds: number) => sql`now() + make_interval(secs => ${seconds})`;

const keyed = ({ shareId, cardId }: CardKey) =>
    and(eq(shareCardResult.shareId, shareId), eq(shareCardResult.cardId, cardId));

/** The share was deleted, or switched to snapshot, so it has no card results. */
export class ShareGone extends Error {
    constructor() {
        super('live share gone');
        this.name = 'ShareGone';
    }
}

// A share keeps card results only while it is a live share.
const isLive = (shareId: string) => and(eq(share.id, shareId), eq(share.mode, 'live'));

/**
 * Take the card's lease. 'taken' for exactly one of any number of concurrent
 * callers, and only when the row is stale and no live lease stands. The
 * upsert's condition is evaluated under the row's lock, so a second caller
 * sees the first one's lease. The row is written only while the share is
 * live, under a share lock on its row, so a switch to snapshot (which drops
 * the results) cannot be followed by a result written for it. 'gone' when the
 * share is no longer live, 'held' when another caller holds the lease or the
 * row is fresh.
 */
export const takeLease = async (db: ShareDb, key: CardKey): Promise<'taken' | 'held' | 'gone'> => {
    const taken = await db.execute(sql`
        insert into ${shareCardResult} (share_id, card_id, lease_until)
        select ${share.id}, ${key.cardId}, ${inSeconds(LEASE_SECONDS)}
        from ${share}
        where ${isLive(key.shareId)}
        for share of ${share}
        on conflict (share_id, card_id) do update
            set lease_until = ${inSeconds(LEASE_SECONDS)}
            where (${shareCardResult.leaseUntil} is null or ${shareCardResult.leaseUntil} <= now())
                and (${shareCardResult.freshUntil} is null or ${shareCardResult.freshUntil} <= now())
        returning card_id
    `);

    if (taken.rows.length > 0) {
        return 'taken';
    }

    const [live] = await db
        .select({ id: share.id })
        .from(share)
        .where(isLive(key.shareId))
        .limit(1);

    return live ? 'held' : 'gone';
};

/** The card's stored answer, or null when it has none. With `freshOnly`, an
 *  answer whose window has passed is none. */
export const storedResult = async (
    db: ShareDb,
    key: CardKey,
    { freshOnly = false }: { freshOnly?: boolean } = {},
): Promise<LiveResult | null> => {
    const [row] = await db
        .select({
            ...getTableColumns(shareCardResult),
            standsForS: sql<
                number | null
            >`extract(epoch from ${shareCardResult.freshUntil} - now())::float`,
        })
        .from(shareCardResult)
        .where(freshOnly ? and(keyed(key), sql`${shareCardResult.freshUntil} > now()`) : keyed(key))
        .limit(1);

    if (!row) {
        return null;
    }

    // The jsonb columns hold what `storeResult` wrote.
    const card = row.card as LiveCard | null;
    const frame = row.frame as FrameRef | null;

    if (row.status === 'current' && card) {
        return { status: 'current', card };
    }

    if (row.status === 'redrawn' && card && frame) {
        return { status: 'redrawn', card, frame };
    }

    if (row.status === 'pending') {
        return { status: 'pending', retryAfterS: row.retryAfterS ?? DEFAULT_PENDING_SECONDS };
    }

    return row.status === 'error'
        ? {
              status: 'error',
              code: row.code ?? 'refresh_failed',
              retryable: row.retryable === true,
              retryAfterS: Math.max(1, Math.ceil(row.standsForS ?? 1)),
          }
        : null;
};

/** Store the answer the lease holder got, and give the lease up. */
export const storeResult = async (
    db: ShareDb,
    key: CardKey,
    result: LiveResult,
    windowSeconds: number,
): Promise<void> => {
    await db
        .update(shareCardResult)
        .set({
            status: result.status,
            card: 'card' in result ? result.card : null,
            frame: result.status === 'redrawn' ? result.frame : null,
            code: result.status === 'error' ? result.code : null,
            retryable: result.status === 'error' ? (result.retryable ?? false) : null,
            retryAfterS: result.status === 'pending' ? result.retryAfterS : null,
            checkedAt: sql`now()`,
            freshUntil: inSeconds(freshSeconds(result, windowSeconds)),
            leaseUntil: null,
        })
        .where(and(keyed(key), sql`exists (select 1 from ${share} where ${isLive(key.shareId)})`));
};

/**
 * The card's answer: the stored one while it is fresh, `pending` while
 * another request holds the lease of a card with no fresh answer, and
 * otherwise the one `refresh` returns, stored for the requests that follow.
 */
export const leasedResult = async (
    db: ShareDb,
    key: CardKey,
    windowSeconds: number,
    refresh: () => Promise<LiveResult>,
): Promise<LiveResult> => {
    const lease = await takeLease(db, key);

    if (lease === 'gone') {
        throw new ShareGone();
    }

    if (lease === 'held') {
        return (
            (await storedResult(db, key, { freshOnly: true })) ?? {
                status: 'pending',
                retryAfterS: LEASE_WAIT_SECONDS,
            }
        );
    }

    let result: LiveResult;

    try {
        result = await refresh();
    } catch (error) {
        console.error('live share: refresh failed', { ...key, error });
        result = { status: 'error', code: 'refresh_failed' };
    }

    await storeResult(db, key, result, windowSeconds);

    return result.status === 'error' ? { ...result, retryAfterS: ERROR_WINDOW_SECONDS } : result;
};

/** Switch the caller's Studio share to snapshot and drop its cards' stored
 *  answers, which only a live share reads. */
export const snapshotLiveShare = async (
    db: ShareDb,
    id: string,
    userId: string,
): Promise<OwnerWriteResult> => {
    const result = await snapshotOwnedShare(db, id, userId);

    if (result === 'done') {
        await db.delete(shareCardResult).where(eq(shareCardResult.shareId, id));
    }

    return result;
};
