import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { SavedConversation } from './history.ts';

import { MAX_CONVERSATION_ID_CHARS } from '../studio/studioAccess.ts';

import { conversation, studioSessionOwner } from '../../../db/schema.ts';

/**
 * Saving a Studio conversation, and the account a harness conversation
 * belongs to. Each function takes the database handle first.
 * `conversationStore.ts` binds it to the server's pool, and `node --test`
 * runs them against a migrated test database.
 */

/** A database handle with or without the app's schema attached. */
export type SaveDb<TSchema extends Record<string, unknown> = Record<string, never>> = Pick<
    NodePgDatabase<TSchema>,
    'select' | 'insert' | 'transaction'
>;

type OwnerDb = Pick<NodePgDatabase, 'select' | 'insert'>;

/**
 * Whether `body` is a saveable document for the conversation `id`. It names
 * `id`, has a title and a list of messages, and its ids fit
 * MAX_CONVERSATION_ID_CHARS.
 */
export const isSaveableConversation = (
    id: string,
    body: SavedConversation | null,
): body is SavedConversation =>
    !!body &&
    body.id === id &&
    id.length <= MAX_CONVERSATION_ID_CHARS &&
    typeof body.title === 'string' &&
    Array.isArray(body.messages) &&
    (body.sessionId == null ||
        (typeof body.sessionId === 'string' && body.sessionId.length <= MAX_CONVERSATION_ID_CHARS));

// Make `userId` the owner of a harness conversation no account owns yet.
const bindSessionOwner = async (db: OwnerDb, agentSessionId: string, userId: string) => {
    await db
        .insert(studioSessionOwner)
        .values({ agentSessionId, userId })
        .onConflictDoNothing({ target: studioSessionOwner.agentSessionId });
};

/**
 * Give an unowned harness conversation to the account that saved it, when
 * every saved conversation naming it belongs to one account. Saves naming it
 * from two accounts leave it unowned. Migration 0027 applies the same rule to
 * the saves on record when it runs; this covers saves written without an
 * owner row since.
 */
const claimFromSaves = async (db: OwnerDb, agentSessionId: string) => {
    await db
        .insert(studioSessionOwner)
        .select(
            db
                .select({
                    agentSessionId: sql<string>`${conversation.agentSessionId}`.as(
                        'agent_session_id',
                    ),
                    userId: sql<string>`min(${conversation.userId})`.as('user_id'),
                    createdAt: sql<Date>`now()`.as('created_at'),
                })
                .from(conversation)
                .where(eq(conversation.agentSessionId, agentSessionId))
                .groupBy(conversation.agentSessionId)
                .having(sql`count(distinct ${conversation.userId}) = 1`),
        )
        .onConflictDoNothing({ target: studioSessionOwner.agentSessionId });
};

const readOwners = async (db: OwnerDb, agentSessionId: string) => {
    const rows = await db
        .select({ userId: studioSessionOwner.userId })
        .from(studioSessionOwner)
        .where(eq(studioSessionOwner.agentSessionId, agentSessionId));

    return rows.map((row) => row.userId);
};

/**
 * Insert or replace `userId`'s saved conversation. The client owns the id and
 * sends the full document. In the same transaction, a save that writes the
 * row makes the harness conversation it names `userId`'s when no account owns
 * it (studioSessionOwner), after claimFromSaves gives it to the account behind
 * earlier saves. A harness conversation that belongs to an account stays with
 * it, whoever saves a document naming it, and a save refused because the id
 * is another account's claims nothing.
 */
export const saveConversation = async <TSchema extends Record<string, unknown>>(
    db: SaveDb<TSchema>,
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

    await db.transaction(async (tx) => {
        if (saved.sessionId) {
            await claimFromSaves(tx, saved.sessionId);
        }

        const written = await tx
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
            })
            .returning({ id: conversation.id });

        if (saved.sessionId && written.length > 0) {
            await bindSessionOwner(tx, saved.sessionId, userId);
        }
    });
};

/** The account the harness conversation `agentSessionId` belongs to, as a
 *  list of none or one (src/lib/studio/studioAccess). A null owner is an
 *  account since deleted, and the conversation belongs to nobody. A harness
 *  conversation with no owner row goes to the account behind its saves when
 *  they agree on one (claimFromSaves). */
export const sessionOwners = async (
    db: OwnerDb,
    agentSessionId: string,
): Promise<(string | null)[]> => {
    const owners = await readOwners(db, agentSessionId);

    if (owners.length > 0) {
        return owners;
    }

    await claimFromSaves(db, agentSessionId);

    return readOwners(db, agentSessionId);
};

/**
 * Make `userId` the owner of the harness conversation `agentSessionId` if no
 * account owns it and its saves name no single account (claimFromSaves), and
 * answer its owner (src/lib/studio/studioAccess). Of concurrent claims, the
 * first insert wins and every claim answers the winner.
 */
export const claimSessionOwner = async (
    db: OwnerDb,
    agentSessionId: string,
    userId: string,
): Promise<(string | null)[]> => {
    await claimFromSaves(db, agentSessionId);
    await bindSessionOwner(db, agentSessionId, userId);

    return readOwners(db, agentSessionId);
};
