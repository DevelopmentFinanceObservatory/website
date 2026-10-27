import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import type { SavedConversation } from './history';

import { db } from '@/lib/db';
import { conversation } from '../../../db/schema';

/**
 * Server-side conversation history (Postgres). One row per conversation:
 * the list columns (title, updated, turns, agent session) plus the whole
 * SavedConversation document as JSON — exactly what the Studio needs to
 * reopen a canvas as it was left. Every query is scoped to the owner.
 */

export type ConversationMeta = {
    id: string;
    title: string;
    updatedAt: number;
    turnCount: number;
    // Search only: the first transcript line that matched, trimmed around it.
    snippet?: string;
};

const LIST_LIMIT = 100;

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

// A search hit's context: the first message containing `q` (case-insensitive),
// cut to a window around the match.
const snippetOf = (messages: unknown, q: string): string | undefined => {
    if (!Array.isArray(messages)) {
        return undefined;
    }

    const needle = q.toLowerCase();

    for (const message of messages as { text?: unknown }[]) {
        const text = typeof message?.text === 'string' ? message.text.replace(/\s+/g, ' ') : '';
        const at = text.toLowerCase().indexOf(needle);

        if (at >= 0) {
            const start = Math.max(0, at - 50);
            const end = Math.min(text.length, at + needle.length + 70);

            return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
        }
    }

    return undefined;
};

/** Title + transcript search (case-insensitive substring over the title and
 *  each message's text, not the plans and chips stored beside it), newest
 *  first. */
export const searchConversations = async (
    userId: string,
    q: string,
): Promise<ConversationMeta[]> => {
    const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const rows = await db
        .select({
            id: conversation.id,
            title: conversation.title,
            updatedAt: conversation.updatedAt,
            turnCount: conversation.turnCount,
            messages: sql<unknown>`${conversation.data} -> 'messages'`,
        })
        .from(conversation)
        .where(
            and(
                eq(conversation.userId, userId),
                or(
                    ilike(conversation.title, pattern),
                    sql`exists (
                        select 1
                        from jsonb_array_elements(
                            case jsonb_typeof(${conversation.data} -> 'messages')
                                when 'array' then ${conversation.data} -> 'messages'
                                else '[]'::jsonb
                            end
                        ) as message
                        where message ->> 'text' ilike ${pattern}
                    )`,
                ),
            ),
        )
        .orderBy(desc(conversation.updatedAt))
        .limit(LIST_LIMIT);

    return rows.map(({ messages, ...row }) => ({
        ...row,
        updatedAt: row.updatedAt.getTime(),
        snippet: snippetOf(messages, q),
    }));
};

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

/** Insert or replace — the client owns the id and sends the full document. */
export const upsertConversation = async (
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

export const deleteConversation = async (userId: string, id: string): Promise<void> => {
    await db
        .delete(conversation)
        .where(and(eq(conversation.userId, userId), eq(conversation.id, id)));
};
