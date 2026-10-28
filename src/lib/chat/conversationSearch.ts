import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { conversation } from '../../../db/schema.ts';

/**
 * Conversation search over the `conversation` table. It reads the title and,
 * of each saved message, its text and the title of the card a user message
 * names. The plans and chips stored beside them are left out. Each query
 * takes the database handle as its first argument; `conversationStore.ts`
 * binds it to the server's pool. With no path-alias dependency, it runs under
 * `node --test` against a migrated test database.
 */

export type ConversationMeta = {
    id: string;
    title: string;
    updatedAt: number;
    turnCount: number;
    // Search only: the first transcript line that matched, trimmed around it.
    snippet?: string;
};

export type SearchDb = Pick<NodePgDatabase, 'select'>;

export const LIST_LIMIT = 100;

/** The searchable texts of one stored message, in order. */
const searchedTexts = (message: unknown): string[] => {
    if (message === null || typeof message !== 'object') {
        return [];
    }

    const { text, card } = message as { text?: unknown; card?: { title?: unknown } | null };
    const title = card && typeof card === 'object' ? card.title : undefined;

    return [text, title].filter((value): value is string => typeof value === 'string');
};

/** A search hit's context: the first message text or card title containing
 *  `q` (case-insensitive), cut to a window around the match. */
export const snippetOf = (messages: unknown, q: string): string | undefined => {
    if (!Array.isArray(messages)) {
        return undefined;
    }

    const needle = q.toLowerCase();

    for (const raw of messages.flatMap(searchedTexts)) {
        const text = raw.replace(/\s+/g, ' ');
        const at = text.toLowerCase().indexOf(needle);

        if (at >= 0) {
            const start = Math.max(0, at - 50);
            const end = Math.min(text.length, at + needle.length + 70);

            return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
        }
    }

    return undefined;
};

/** Title + transcript search (case-insensitive substring), newest first. */
export const searchConversations = async (
    db: SearchDb,
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
                            or message -> 'card' ->> 'title' ilike ${pattern}
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
