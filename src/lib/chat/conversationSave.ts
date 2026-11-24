import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { SavedConversation } from './history.ts';

import { isConversationId } from '../studio/studioAccess.ts';

import { conversation, studioSessionOwner, user } from '../../../db/schema.ts';

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

/** The longest `saveWriter` a saved conversation may carry. */
export const MAX_SAVE_WRITER_CHARS = 64;

/**
 * The order of one page's saves. The page mints `saveWriter` once per load
 * and raises `saveSeq` for each snapshot it takes, so saveConversation keeps
 * the newest snapshot of a writer whatever order its saves arrive in.
 */
type SaveOrder = { saveWriter?: unknown; saveSeq?: unknown };

/** Whether a document carries both order fields, well formed, or neither. */
const hasSaveOrder = ({ saveWriter, saveSeq }: SavedConversation & SaveOrder): boolean =>
    saveWriter === undefined && saveSeq === undefined
        ? true
        : typeof saveWriter === 'string' &&
          saveWriter.length <= MAX_SAVE_WRITER_CHARS &&
          isConversationId(saveWriter) &&
          typeof saveSeq === 'number' &&
          Number.isSafeInteger(saveSeq) &&
          saveSeq >= 0;

/**
 * Whether `body` is a saveable document for the conversation `id`. It names
 * `id`, has a title and a list of messages, its ids pass isConversationId,
 * and it carries both save order fields (SaveOrder) or neither: `saveWriter`
 * a string of 1 to 64 characters with no control characters, and `saveSeq`
 * a non-negative safe integer.
 */
export const isSaveableConversation = (
    id: string,
    body: SavedConversation | null,
): body is SavedConversation =>
    !!body &&
    body.id === id &&
    isConversationId(id) &&
    typeof body.title === 'string' &&
    Array.isArray(body.messages) &&
    hasSaveOrder(body) &&
    (body.sessionId == null ||
        (typeof body.sessionId === 'string' && isConversationId(body.sessionId)));

/**
 * A saved conversation as the Studio reopens it. Saves from older releases
 * stored any `sessionId`, including `''`. One that isConversationId refuses
 * would make isSaveableConversation and the Studio proxy refuse the
 * conversation, so it reads as null, a conversation with no harness
 * conversation yet.
 */
export const readSavedConversation = (data: SavedConversation): SavedConversation =>
    data.sessionId == null ||
    (typeof data.sessionId === 'string' && isConversationId(data.sessionId))
        ? data
        : { ...data, sessionId: null };

/**
 * Give an unowned harness conversation to the account behind the oldest
 * saved conversation naming it, ordered by `conversation.created_at`, then
 * `id`. A copy of a share is always newer than the conversation it came
 * from, and shares from older releases stored the owner's harness id
 * (src/lib/chat/sharePrune.ts), so the account that started the harness
 * conversation wins over its copiers. Migration 0027 applied the same rule
 * to the saves on record. With no save naming it, this writes nothing.
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
                    userId: conversation.userId,
                    createdAt: sql<Date>`now()`.as('created_at'),
                })
                .from(conversation)
                .where(eq(conversation.agentSessionId, agentSessionId))
                .orderBy(asc(conversation.createdAt), asc(conversation.id))
                .limit(1),
        )
        .onConflictDoNothing({ target: studioSessionOwner.agentSessionId });
};

/**
 * Make the harness conversation `agentSessionId` belong to an account if
 * none owns it: the oldest saver when any saved conversation names it
 * (claimFromSaves), whoever `userId` is, and `userId` otherwise. Of
 * concurrent claims, the first insert wins. Throws when `userId` has no user
 * row, so the Studio proxy answers 503 and forwards nothing unowned.
 */
const bindSessionOwner = async (db: OwnerDb, agentSessionId: string, userId: string) => {
    const [caller] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

    if (!caller) {
        throw new Error('The account claiming a harness conversation has no user row.');
    }

    await claimFromSaves(db, agentSessionId);
    await db
        .insert(studioSessionOwner)
        .values({ agentSessionId, userId })
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
 * sends the full document. A save writes unless the stored row has the same
 * `saveWriter` and a higher `saveSeq` (SaveOrder), so one page's older
 * snapshot that arrives last changes nothing and still succeeds. A save from
 * another writer, or from a document without the fields, always writes. In the
 * same transaction, a save that writes the row gives the harness
 * conversation it names an owner if it has none (bindSessionOwner). A save
 * refused because the id is another account's, or because it is older,
 * claims nothing.
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
                // A conflict on someone else's id must not overwrite their
                // row, and a writer's older snapshot must not overwrite its
                // newer one. A missing field makes the comparison null, which
                // coalesce turns into a write.
                setWhere: and(
                    eq(conversation.userId, userId),
                    sql`not coalesce(
                        (${conversation.data} -> 'saveWriter') = (excluded.data -> 'saveWriter')
                            and (${conversation.data} -> 'saveSeq') > (excluded.data -> 'saveSeq'),
                        false
                    )`,
                ),
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
 *  conversation with no owner row goes to the account behind the oldest save
 *  naming it (claimFromSaves). */
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
 * Give the harness conversation `agentSessionId` an owner if it has none
 * (bindSessionOwner), and answer its owner (src/lib/studio/studioAccess).
 * Every concurrent claim answers the same owner.
 */
export const claimSessionOwner = async (
    db: OwnerDb,
    agentSessionId: string,
    userId: string,
): Promise<(string | null)[]> => {
    await bindSessionOwner(db, agentSessionId, userId);

    return readOwners(db, agentSessionId);
};
