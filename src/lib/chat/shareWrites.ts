import { randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { share } from '../../../db/schema.ts';
import { limiterBucket } from '../proxy/caller.ts';
import { reserveHit, type CounterDb } from '../proxy/limitCounter.ts';
import type { SavedConversation } from './history.ts';
import { GUEST_SHARES, isStudioKind, type ShareMode, type StudioShareKind } from './shareMode.ts';
import { pruneForShare } from './sharePrune.ts';

/**
 * Writes to the `share` table for Studio shares, each taking the database
 * handle as its first argument. `shareStore.ts` binds them to the server's
 * pool. With no path-alias dependency, they run under `node --test` against
 * a migrated test database.
 */

export type ShareDb = Pick<NodePgDatabase, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const shortId = (length = 8): string => {
    const bytes = randomBytes(length);
    let out = '';

    for (let i = 0; i < length; i += 1) {
        out += ALPHABET[bytes[i]! % ALPHABET.length];
    }

    return out;
};

// The title a live card share gets when its sharer set none. The page title
// and the embed's title come from the row, and a live card's own title is
// withheld from the page with its data, so it stays out of them too.
export const LIVE_CARD_TITLE = 'Live card';

export type NewStudioShare = {
    // Null for a guest's share, which no one owns.
    userId: string | null;
    kind: StudioShareKind;
    mode: ShareMode;
    saved: SavedConversation;
    cardId?: string;
};

const DAY_S = 86_400;

/**
 * Spend one of today's GUEST_SHARES for the guest at `address`, counted by
 * network (limiterBucket) per UTC day. False when they are spent. Throws what
 * the database throws.
 */
export const spendGuestShare = async (db: CounterDb, address: string): Promise<boolean> =>
    (await reserveHit(db, `share-guest:${limiterBucket(address)}`, GUEST_SHARES, DAY_S)).admitted;

export const insertStudioShare = async (
    db: ShareDb,
    { userId, kind, mode, saved, cardId }: NewStudioShare,
): Promise<{ id: string; title: string }> => {
    const data = pruneForShare(saved, kind, cardId);
    const storedTitle = () =>
        data.widgets
            .map((widget) => (widget.kind === 'key_number' ? widget.label : widget.title))
            .find(Boolean) ?? data.textCards?.[0]?.title;
    const cardTitle =
        cardId && (data.titles?.[cardId] ?? (mode === 'live' ? LIVE_CARD_TITLE : storedTitle()));
    const title = (kind === 'card' && cardTitle) || saved.title;
    const id = shortId();

    await db.insert(share).values({
        id,
        userId,
        kind,
        mode,
        conversationId: saved.id,
        cardId: cardId ?? null,
        title,
        data,
    });

    return { id, title };
};

/**
 * What an owner's write to a share came to. `not_found` covers a share that
 * does not exist and one that belongs to someone else, so the answer does
 * not reveal which ids are taken. `unsupported_kind` is the owner's own search
 * share, which has no owner writes.
 */
export type OwnerWriteResult = 'done' | 'not_found' | 'unsupported_kind';

const refusalFor = async (
    db: ShareDb,
    id: string,
    userId: string,
): Promise<Exclude<OwnerWriteResult, 'done'> | null> => {
    const [row] = await db
        .select({ kind: share.kind, userId: share.userId })
        .from(share)
        .where(eq(share.id, id))
        .limit(1);

    if (!row || row.userId !== userId) {
        return 'not_found';
    }

    return isStudioKind(row.kind) ? null : 'unsupported_kind';
};

const owned = (id: string, userId: string) => and(eq(share.id, id), eq(share.userId, userId));

/** Switch the caller's Studio share to snapshot. A snapshot stays one. */
export const snapshotOwnedShare = async (
    db: ShareDb,
    id: string,
    userId: string,
): Promise<OwnerWriteResult> => {
    const refusal = await refusalFor(db, id, userId);

    if (refusal) {
        return refusal;
    }

    const updated = await db
        .update(share)
        .set({ mode: 'snapshot' })
        .where(owned(id, userId))
        .returning({ id: share.id });

    return updated.length ? 'done' : 'not_found';
};

/** Delete the caller's Studio share. */
export const deleteOwnedShare = async (
    db: ShareDb,
    id: string,
    userId: string,
): Promise<OwnerWriteResult> => {
    const refusal = await refusalFor(db, id, userId);

    if (refusal) {
        return refusal;
    }

    const deleted = await db.delete(share).where(owned(id, userId)).returning({ id: share.id });

    return deleted.length ? 'done' : 'not_found';
};
