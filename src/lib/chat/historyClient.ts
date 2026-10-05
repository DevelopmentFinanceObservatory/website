import type { SavedConversation } from './history';

import type { ConversationMeta } from '@/lib/chat/conversationStore';

/**
 * Browser side of the account history: the /api/conversations calls the
 * Studio makes. All best-effort — a failed save is logged, never surfaced as
 * a blocking error (the canvas keeps working; the next change retries).
 */

export type { ConversationMeta };

export const fetchHistory = async (q?: string): Promise<ConversationMeta[]> => {
    const url = q ? `/api/conversations?q=${encodeURIComponent(q)}` : '/api/conversations';
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
        return [];
    }

    const body = (await res.json()) as { conversations?: ConversationMeta[] };

    return body.conversations ?? [];
};

export const fetchConversation = async (id: string): Promise<SavedConversation | null> => {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        cache: 'no-store',
    });

    if (!res.ok) {
        return null;
    }

    const body = (await res.json()) as { conversation?: SavedConversation };

    return body.conversation ?? null;
};

export const pushConversation = async (saved: SavedConversation): Promise<boolean> => {
    try {
        const res = await fetch(`/api/conversations/${encodeURIComponent(saved.id)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(saved),
        });

        if (!res.ok) {
            console.warn('History save failed', res.status);
        }

        return res.ok;
    } catch (error) {
        console.warn('History save failed', error);

        return false;
    }
};

export const removeConversation = async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });

    return res.ok;
};
