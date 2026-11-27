import { headers } from 'next/headers';
import { cache } from 'react';

import {
    createOwnedShare,
    createShare,
    keepForCleanup,
    ownerShareWrite,
    readShare,
    SharesError,
    takeDown,
    takeDownUserShares,
    type CreateShareBody,
    type ShareRecord,
    type SharesBackend,
} from './apisShares';
import type { ShareKind } from './sharePrune';
import { ownsShare } from './shareTokens';

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

/** dfo-apis' share routes, naming the caller of `incoming`. Every call is
 *  the site's own, made for a page or route it serves, so its surface is
 *  `website`. */
export const sharesBackendFor = (incoming: Headers): SharesBackend => ({
    base: searchApiBase(),
    fetch: apisFetch,
    nameCaller: (outgoing) => setApisCaller(outgoing, incoming, 'website'),
});

/** A share by id, or null. One read per request, however many readers. */
export const getShare = cache(async (id: string): Promise<ShareRecord | null> =>
    readShare(sharesBackendFor(await headers()), id),
);

/** Whether `userId` made the share, for the `viewer` prop of its view
 *  events. A failed read rejects, so shareViewEvent records `unknown`. */
export const viewerOwnsShare = (
    shareId: string,
    userId: string | null | undefined,
): Promise<boolean> => ownsShare(db, { shareId, userId });

/** Make a share for `userId` (null for a guest), keeping a signed-in
 *  maker's write token. */
export const makeShare = (
    incoming: Headers,
    userId: string | null,
    body: CreateShareBody,
): Promise<{ id: string }> =>
    createOwnedShare({ db, backend: sharesBackendFor(incoming) }, userId, body);

/** Make a share whose write token the caller keeps, as the Library does
 *  in `library_artifact`. No `share_token` row is written, so the share
 *  belongs to no account. */
export const makeTokenShare = (
    incoming: Headers,
    body: CreateShareBody,
): Promise<{ id: string; writeToken: string }> => createShare(sharesBackendFor(incoming), body);

/** Take down a share with its write token. Answers `done` once dfo-apis
 *  holds no such share, one it had already lost included, and otherwise
 *  the code of the failure (`SharesError`), so the caller can keep the
 *  token for another try or for an operator. */
export const takeDownTokenShare = async (
    incoming: Headers,
    { shareId, writeToken }: { shareId: string; writeToken: string },
): Promise<string> => {
    try {
        await takeDown(sharesBackendFor(incoming), shareId, writeToken);

        return 'done';
    } catch (error) {
        if (error instanceof SharesError) {
            return error.code === 'not_found' ? 'done' : error.code;
        }

        return String(error);
    }
};

/** Keep a share no take-down removed in `share_cleanup`, for an operator,
 *  with the alerted `share_cleanup_recorded` line. */
export const keepShareForCleanup = (row: {
    shareId: string;
    userId: string;
    writeToken: string;
    reason: string;
}): Promise<void> => keepForCleanup(db, row);

/** Switch the caller's live share to snapshot, or take it down. */
export const writeOwnShare = (
    incoming: Headers,
    write: { shareId: string; userId: string; action: 'snapshot' | 'delete' },
): ReturnType<typeof ownerShareWrite> =>
    ownerShareWrite({ db, backend: sharesBackendFor(incoming) }, write);

/** Take down every share `userId` keeps a token for, before their account
 *  is deleted. Throws when one cannot be taken down. */
export const takeDownSharesOf = (incoming: Headers, userId: string): Promise<void> =>
    takeDownUserShares({ db, backend: sharesBackendFor(incoming) }, userId);

/** What the share pages, the live card routes, and a live share's check
 *  draw with: dfo-apis' share routes and public component reads. */
export const slotDepsFor = (incoming: Headers): SlotDeps => ({
    shares: sharesBackendFor(incoming),
});
