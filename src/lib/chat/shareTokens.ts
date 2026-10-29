import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { shareCleanup, shareToken, user } from '../../../db/schema.ts';

/**
 * The write tokens dfo-apis issues for signed-in users' shares, in the
 * `share_token` table, the fence an account's deletion sets on its `user`
 * row, and the `share_cleanup` rows left for an operator, each function
 * taking the database handle first. With no path-alias dependency, they run
 * under `node --test` against a migrated test database.
 */

export type ShareTokenDb = Pick<NodePgDatabase, 'select' | 'insert' | 'update' | 'delete'>;

// How long a fence holds after its deletion attempt last set it. A running
// attempt sets it again before each take-down, which takes at most 35
// seconds, so its fence does not lapse. The window ends a fence an attempt
// left behind: Better Auth deletes the user row after its before-delete hook
// with no hook after a failed delete, and a request can die mid-loop, so
// such a fence would otherwise stop the account sharing for good.
const FENCE_HOLDS = sql.raw(`interval '15 minutes'`);

// `userId`'s row, when no deletion attempt holds a fence on it.
const unfenced = (userId: string) =>
    and(
        eq(user.id, userId),
        or(isNull(user.deletingAt), lt(user.deletingAt, sql`now() - ${FENCE_HOLDS}`)),
    );

/** One deletion attempt's fence: the `deleting_at` it set, as Postgres
 *  prints it, so it compares equal to the stored value to the microsecond.
 *  Null when the user row is gone. */
export type Fence = string | null;

/**
 * Store `writeToken` as `userId`'s token for `shareId`, replacing the token
 * that user stored for it before. Storing the token already held changes
 * nothing, `created_at` included. False when the share's token belongs to
 * another user, whose row is left as it was, and when `userId`'s account is
 * being deleted (`fenceShareTokens`, for 15 minutes) or is gone.
 *
 * The insert reads the user row `FOR SHARE`, which waits for a fence being
 * set and then sees it, and holds back a fence until the insert commits. So
 * a token either commits before the fence, and the deletion's list of
 * tokens finds it, or is refused.
 */
export const putShareToken = async (
    db: ShareTokenDb,
    { shareId, userId, writeToken }: { shareId: string; userId: string; writeToken: string },
): Promise<boolean> => {
    const written = await db
        .insert(shareToken)
        .select((qb) =>
            qb
                .select({
                    shareId: sql<string>`${shareId}`.as('share_id'),
                    userId: user.id,
                    writeToken: sql<string>`${writeToken}`.as('write_token'),
                    createdAt: sql<Date>`now()`.as('created_at'),
                })
                .from(user)
                .where(unfenced(userId))
                .for('share'),
        )
        .onConflictDoUpdate({
            target: shareToken.shareId,
            set: {
                writeToken,
                createdAt: sql`case when ${shareToken.writeToken} = ${writeToken} then ${shareToken.createdAt} else now() end`,
            },
            setWhere: eq(shareToken.userId, userId),
        })
        .returning({ shareId: shareToken.shareId });

    return written.length > 0;
};

/** `userId`'s write token for `shareId`, or null when that user stored none. */
export const readShareToken = async (
    db: ShareTokenDb,
    { shareId, userId }: { shareId: string; userId: string },
): Promise<string | null> => {
    const [row] = await db
        .select({ writeToken: shareToken.writeToken })
        .from(shareToken)
        .where(and(eq(shareToken.shareId, shareId), eq(shareToken.userId, userId)))
        .limit(1);

    return row?.writeToken ?? null;
};

/** Every share `userId` keeps a write token for, with that token. */
export const listShareTokens = (
    db: ShareTokenDb,
    userId: string,
): Promise<{ shareId: string; writeToken: string }[]> =>
    db
        .select({ shareId: shareToken.shareId, writeToken: shareToken.writeToken })
        .from(shareToken)
        .where(eq(shareToken.userId, userId))
        .orderBy(shareToken.shareId);

/** Delete `userId`'s write token for `shareId`, once the share is taken
 *  down. A token another user stored for it stays. */
export const deleteShareToken = async (
    db: ShareTokenDb,
    { shareId, userId }: { shareId: string; userId: string },
): Promise<void> => {
    await db
        .delete(shareToken)
        .where(and(eq(shareToken.shareId, shareId), eq(shareToken.userId, userId)));
};

/** Whether no token can be stored for `userId` (`putShareToken`): a
 *  deletion attempt holds a fence on the account, or the account is gone. */
export const shareTokensFenced = async (db: ShareTokenDb, userId: string): Promise<boolean> => {
    const [row] = await db.select({ id: user.id }).from(user).where(unfenced(userId)).limit(1);

    return row === undefined;
};

/** Fence `userId`'s account for a deletion attempt, after which no token is
 *  stored for it (`putShareToken`). Commits on its own, before the list of
 *  tokens to take down is read. Returns the attempt's fence, which replaces
 *  any other attempt's. */
export const fenceShareTokens = async (db: ShareTokenDb, userId: string): Promise<Fence> => {
    const [row] = await db
        .update(user)
        .set({ deletingAt: sql`now()` })
        .where(eq(user.id, userId))
        .returning({ fence: sql<string>`${user.deletingAt}::text` });

    return row?.fence ?? null;
};

/** Set `fence` afresh, so it does not lapse while its attempt runs. Null
 *  when the account no longer holds `fence`: another attempt replaced it,
 *  or lifted its own in its place. */
export const refreshFence = async (
    db: ShareTokenDb,
    { userId, fence }: { userId: string; fence: Fence },
): Promise<Fence> => {
    if (fence === null) {
        return null;
    }

    const [row] = await db
        .update(user)
        .set({ deletingAt: sql`now()` })
        .where(and(eq(user.id, userId), eq(user.deletingAt, sql`${fence}::timestamptz`)))
        .returning({ fence: sql<string>`${user.deletingAt}::text` });

    return row?.fence ?? null;
};

/** Lift `fence` from an account whose deletion attempt stopped, so its user
 *  can share again. A fence another attempt has set since stays. */
export const unfenceShareTokens = async (
    db: ShareTokenDb,
    { userId, fence }: { userId: string; fence: Fence },
): Promise<void> => {
    if (fence === null) {
        return;
    }

    await db
        .update(user)
        .set({ deletingAt: null })
        .where(and(eq(user.id, userId), eq(user.deletingAt, sql`${fence}::timestamptz`)));
};

/** Keep `shareId` and its token for an operator to take down, with the
 *  code its take-down failed with. A share already recorded keeps its first
 *  row. */
export const recordShareCleanup = async (
    db: ShareTokenDb,
    row: { shareId: string; userId: string; writeToken: string; reason: string },
): Promise<void> => {
    await db.insert(shareCleanup).values(row).onConflictDoNothing();
};
