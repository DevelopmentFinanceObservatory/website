import { headers } from 'next/headers';
import { cache } from 'react';

import {
    createOwnedShare,
    ownerShareWrite,
    readShare,
    type CreateShareBody,
    type ShareRecord,
    type SharesBackend,
} from './apisShares';
import type { ShareKind } from './sharePrune';

import { apisFetch } from '@/lib/apisAuth';
import { db } from '@/lib/db';
import { setApisCaller } from '@/lib/proxy/caller';
import { searchApiBase } from '@/lib/searchApi';
import type { SlotDeps } from '@/lib/studio/slotCards';

/**
 * Public shares, held in dfo-apis (src/lib/chat/apisShares.ts) and bound
 * here to the server's pool, its dfo-apis origin, and the caller of the
 * request at hand. A share is a pruned copy of what its maker was looking
 * at under a short id that dfo-apis mints:
 *   conversation → chat + canvas, as saved
 *   canvas       → the canvas only (transcript and activity dropped, since
 *                  the link must not leak the chat the sharer didn't share)
 *   card         → one card, with just its layout/title/note/view
 *   search       → a search result's dataset references (lib/search/searchShare.ts)
 * The data cards of a canvas or card share are its slots, and the rest of
 * the copy is the website's payload (src/lib/chat/sharePayload.ts). A
 * signed-in maker's write token is kept in `share_token`.
 */

export type { ShareKind, ShareRecord };

/** dfo-apis' share routes, naming the caller of `incoming`. */
export const sharesBackendFor = (incoming: Headers): SharesBackend => ({
    base: searchApiBase(),
    fetch: apisFetch,
    nameCaller: (outgoing) => setApisCaller(outgoing, incoming),
});

/** A share by id, or null. One read per request, however many readers. */
export const getShare = cache(async (id: string): Promise<ShareRecord | null> =>
    readShare(sharesBackendFor(await headers()), id),
);

/** Make a share for `userId` (null for a guest), keeping a signed-in
 *  maker's write token. */
export const makeShare = (
    incoming: Headers,
    userId: string | null,
    body: CreateShareBody,
): Promise<{ id: string }> =>
    createOwnedShare({ db, backend: sharesBackendFor(incoming) }, userId, body);

/** Switch the caller's live share to snapshot, or take it down. */
export const writeOwnShare = (
    incoming: Headers,
    write: { shareId: string; userId: string; action: 'snapshot' | 'delete' },
): Promise<'done' | 'not_found'> =>
    ownerShareWrite({ db, backend: sharesBackendFor(incoming) }, write);

/** What the share pages, the live card routes, and a live share's check
 *  draw with: dfo-apis' share routes and public component reads. */
export const slotDepsFor = (incoming: Headers): SlotDeps => ({
    shares: sharesBackendFor(incoming),
});
