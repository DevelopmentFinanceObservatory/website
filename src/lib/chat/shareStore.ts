import { eq } from 'drizzle-orm';

import type { StudioShareRequest } from './shareMode';
import { pruneForShare, shareForViewer, type ShareKind } from './sharePrune';
import {
    deleteOwnedShare,
    insertStudioShare,
    type NewStudioShare,
    type OwnerWriteResult,
} from './shareWrites';

import { db } from '@/lib/db';
import { liveShareRefusal, type LiveShareRefusal } from '@/lib/studio/liveShare';
import { snapshotLiveShare } from '@/lib/studio/liveShareResults';
import { share } from '../../../db/schema';

/**
 * Public shares (Postgres). A share is a pruned copy of a conversation under
 * a short id:
 *   conversation → chat + canvas, as saved
 *   canvas       → the canvas only (transcript and activity dropped, since
 *                  the link must not leak the chat the sharer didn't share)
 *   card         → one card, with just its layout/title/note/view
 * The stored copy is fixed at creation while the owner's conversation keeps
 * evolving. A snapshot share shows that copy as stored. A live canvas or
 * card share (`isLiveStudioShare` in shareMode.ts) is the same stored copy
 * with `share.mode` set to `live`, whose data cards the viewer redraws on
 * current data (src/lib/studio/liveShare.ts). `getShare` returns the row
 * through `shareForViewer`, so no read carries the owner's `sessionId`.
 *
 * The writes live in shareWrites.ts, which takes the database handle as an
 * argument. This module binds them to the server's pool.
 */

export type { ShareKind };

export { shortId } from './shareWrites';

export const createShare = (input: NewStudioShare): Promise<{ id: string; title: string }> =>
    insertStudioShare(db, input);

/** Why the copy this request would store cannot be a live share, or null
 *  when it can. */
export const liveShareRefusalFor = ({
    saved,
    kind,
    cardId,
}: StudioShareRequest): Promise<LiveShareRefusal | null> =>
    liveShareRefusal({ env: process.env, fetch }, pruneForShare(saved, kind, cardId));

export const getShare = async (id: string) => {
    const [row] = await db.select().from(share).where(eq(share.id, id)).limit(1);

    return row ? shareForViewer(row) : null;
};

/** Switch the caller's Studio share to snapshot, dropping the stored
 *  refresh answers of its cards. */
export const snapshotShare = (id: string, userId: string): Promise<OwnerWriteResult> =>
    snapshotLiveShare(db, id, userId);

/** Delete the caller's Studio share. */
export const deleteShare = (id: string, userId: string): Promise<OwnerWriteResult> =>
    deleteOwnedShare(db, id, userId);
