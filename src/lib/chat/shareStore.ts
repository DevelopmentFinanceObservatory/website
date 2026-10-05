import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { SavedConversation } from './history';
import { pruneForShare, shareForViewer, type ShareKind } from './sharePrune';

import { db } from '@/lib/db';
import { share } from '../../../db/schema';

/**
 * Public shares (Postgres). A share is a frozen, pruned copy of a
 * conversation under a short id:
 *   conversation → chat + canvas, as saved
 *   canvas       → the canvas only (transcript and activity dropped — the
 *                  link must not leak the chat the sharer didn't share)
 *   card         → one card, with just its layout/title/note/view
 * A share is frozen at creation — the owner's conversation keeps evolving,
 * the link never changes. `getShare` returns it through `shareForViewer`, so
 * no read carries the owner's `sessionId`.
 */

export type { ShareKind };

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const shortId = (length = 8): string => {
    const bytes = randomBytes(length);
    let out = '';

    for (let i = 0; i < length; i += 1) {
        out += ALPHABET[bytes[i]! % ALPHABET.length];
    }

    return out;
};

export const createShare = async (
    userId: string,
    kind: ShareKind,
    saved: SavedConversation,
    cardId?: string,
): Promise<{ id: string; title: string }> => {
    const data = pruneForShare(saved, kind, cardId);
    const cardTitle =
        cardId &&
        (data.titles?.[cardId] ??
            data.widgets
                .map((widget) => (widget.kind === 'key_number' ? widget.label : widget.title))
                .find(Boolean) ??
            data.textCards?.[0]?.title);
    const title = (kind === 'card' && cardTitle) || saved.title;
    const id = shortId();

    await db.insert(share).values({
        id,
        userId,
        kind,
        conversationId: saved.id,
        cardId: cardId ?? null,
        title,
        data,
    });

    return { id, title };
};

export const getShare = async (id: string) => {
    const [row] = await db.select().from(share).where(eq(share.id, id)).limit(1);

    return row ? shareForViewer(row) : null;
};
