import { and, desc, eq } from 'drizzle-orm';

import {
    LIST_LIMIT,
    searchConversations as searchIn,
    type ConversationMeta,
} from './conversationSearch';
import { saveConversation, sessionOwners } from './conversationSave';
import type { SavedConversation } from './history';

import { db } from '@/lib/db';
import { conversation } from '../../../db/schema';

/**
 * Server-side conversation history (Postgres). One row per conversation:
 * the list columns (title, updated, turns, agent session) plus the whole
 * SavedConversation document as JSON — exactly what the Studio needs to
 * reopen a canvas as it was left. Every query is scoped to the owner.
 */

export const listConversations = async (userId: string): Promise<ConversationMeta[]> => {
    const rows = await db
        .select({
            id: conversation.id,
            title: conversation.title,
            updatedAt: conversation.updatedAt,
            turnCount: conversation.turnCount,
        })
        .from(conversation)
        .where(eq(conversation.userId, userId))
        .orderBy(desc(conversation.updatedAt))
        .limit(LIST_LIMIT);

    return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.getTime() }));
};

/** Title + transcript search (see conversationSearch.ts), newest first. */
export const searchConversations = (userId: string, q: string): Promise<ConversationMeta[]> =>
    searchIn(db, userId, q);

export const getConversation = async (
    userId: string,
    id: string,
): Promise<SavedConversation | null> => {
    const [row] = await db
        .select({ data: conversation.data })
        .from(conversation)
        .where(and(eq(conversation.userId, userId), eq(conversation.id, id)))
        .limit(1);

    return row ? (row.data as SavedConversation) : null;
};

/** The account the harness conversation `agentSessionId` belongs to, as a
 *  list of none or one (src/lib/studio/studioAccess). */
export const conversationOwners = (agentSessionId: string): Promise<string[]> =>
    sessionOwners(db, agentSessionId);

/** Insert or replace; see saveConversation for who a harness conversation
 *  belongs to. */
export const upsertConversation = (userId: string, saved: SavedConversation): Promise<void> =>
    saveConversation(db, userId, saved);

export const deleteConversation = async (userId: string, id: string): Promise<void> => {
    await db
        .delete(conversation)
        .where(and(eq(conversation.userId, userId), eq(conversation.id, id)));
};
