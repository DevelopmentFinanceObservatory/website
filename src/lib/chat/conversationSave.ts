import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { SavedConversation } from './history.ts';

import { conversation, studioSessionOwner } from '../../../db/schema.ts';

/**
 * Saving a Studio conversation, and the account a harness conversation
 * belongs to. Each function takes the database handle first;
 * `conversationStore.ts` binds it to the server's pool, and `node --test`
 * runs them against a migrated test database.
 */

export type SaveDb = Pick<NodePgDatabase, 'select' | 'insert'>;

/**
 * Insert or replace `userId`'s saved conversation: the client owns the id and
 * sends the full document. A save naming a harness conversation that belongs
 * to no account yet makes it `userId`'s (studioSessionOwner). A harness
 * conversation that already belongs to an account stays with it, whoever
 * saves a document naming it.
 */
export const saveConversation = async (
    db: SaveDb,
    userId: string,
    saved: SavedConversation,
): Promise<void> => {
    const values = {
        id: saved.id,
        userId,
        title: saved.title,
        agentSessionId: saved.sessionId,
        turnCount: saved.turnCount,
        data: saved,
        updatedAt: new Date(saved.updatedAt),
    };

    if (saved.sessionId) {
        await db
            .insert(studioSessionOwner)
            .values({ agentSessionId: saved.sessionId, userId })
            .onConflictDoNothing({ target: studioSessionOwner.agentSessionId });
    }

    await db
        .insert(conversation)
        .values(values)
        .onConflictDoUpdate({
            target: conversation.id,
            set: {
                title: values.title,
                agentSessionId: values.agentSessionId,
                turnCount: values.turnCount,
                data: values.data,
                updatedAt: values.updatedAt,
            },
            // A conflict on someone else's id must not overwrite their row.
            setWhere: eq(conversation.userId, userId),
        });
};

/** The account the harness conversation `agentSessionId` belongs to, as a
 *  list of none or one (src/lib/studio/studioAccess). */
export const sessionOwners = async (db: SaveDb, agentSessionId: string): Promise<string[]> => {
    const rows = await db
        .select({ userId: studioSessionOwner.userId })
        .from(studioSessionOwner)
        .where(eq(studioSessionOwner.agentSessionId, agentSessionId));

    return rows.map((row) => row.userId);
};
