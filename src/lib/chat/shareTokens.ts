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

// How long a deletion's fence holds. Better Auth deletes the user row after
// its before-delete hook with no hook after a failed delete, so a fence the
// deletion left behind would otherwise stop the account sharing for good. A
// deletion request finishes well inside this window, and each attempt sets
// the fence afresh.
const FENCE_HOLDS = sql.raw(`interval '15 minutes'`);

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
                .where(
                    and(
                        eq(user.id, userId),
                        or(
                            isNull(user.deletingAt),
                            lt(user.deletingAt, sql`now() - ${FENCE_HOLDS}`),
                        ),
                    ),
                )
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

/** Mark `userId`'s account as being deleted, after which no token is
 *  stored for it (`putShareToken`). Commits on its own, before the list of
 *  tokens to take down is read. */
export const fenceShareTokens = async (db: ShareTokenDb, userId: string): Promise<void> => {
    await db
        .update(user)
        .set({ deletingAt: sql`now()` })
        .where(eq(user.id, userId));
};

/** Lift the fence from an account whose deletion stopped, so its user can
 *  share again. */
export const unfenceShareTokens = async (db: ShareTokenDb, userId: string): Promise<void> => {
    await db.update(user).set({ deletingAt: null }).where(eq(user.id, userId));
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
