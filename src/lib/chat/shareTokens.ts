import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { shareToken } from '../../../db/schema.ts';

/**
 * The write tokens dfo-apis issues for signed-in users' shares, in the
 * `share_token` table, each function taking the database handle first. With
 * no path-alias dependency, they run under `node --test` against a migrated
 * test database.
 */

export type ShareTokenDb = Pick<NodePgDatabase, 'select' | 'insert' | 'delete'>;

/**
 * Store `writeToken` as `userId`'s token for `shareId`, replacing the token
 * that user stored for it before. False when the share's token belongs to
 * another user, whose row is left as it was.
 */
export const putShareToken = async (
    db: ShareTokenDb,
    { shareId, userId, writeToken }: { shareId: string; userId: string; writeToken: string },
): Promise<boolean> => {
    const written = await db
        .insert(shareToken)
        .values({ shareId, userId, writeToken })
        .onConflictDoUpdate({
            target: shareToken.shareId,
            set: { writeToken, createdAt: sql`now()` },
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
