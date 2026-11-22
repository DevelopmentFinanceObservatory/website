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

// Make `userId` the owner of a harness conversation no account owns yet.
const bindSessionOwner = async (db: SaveDb, agentSessionId: string, userId: string) => {
    await db
        .insert(studioSessionOwner)
        .values({ agentSessionId, userId })
        .onConflictDoNothing({ target: studioSessionOwner.agentSessionId });
};

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
        await bindSessionOwner(db, saved.sessionId, userId);
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
 *  list of none or one (src/lib/studio/studioAccess). A null owner is an
 *  account since deleted: the conversation belongs to nobody. */
export const sessionOwners = async (
    db: SaveDb,
    agentSessionId: string,
): Promise<(string | null)[]> => {
    const rows = await db
        .select({ userId: studioSessionOwner.userId })
        .from(studioSessionOwner)
        .where(eq(studioSessionOwner.agentSessionId, agentSessionId));

    return rows.map((row) => row.userId);
};

/**
 * Make `userId` the owner of the harness conversation `agentSessionId` if no
 * account owns it, and answer its owner (src/lib/studio/studioAccess). Of
 * concurrent claims, the first insert wins and every claim answers the
 * winner.
 */
export const claimSessionOwner = async (
    db: SaveDb,
    agentSessionId: string,
    userId: string,
): Promise<(string | null)[]> => {
    await bindSessionOwner(db, agentSessionId, userId);

    return sessionOwners(db, agentSessionId);
};
