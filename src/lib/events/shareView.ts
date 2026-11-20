// No db or server-only imports, so src/lib/test/events-bounded-lookup.test.ts
// can run it under plain node. src/app/s/[id]/page.tsx and
// src/app/embed/[id]/page.tsx pass in the session and owner reads.

import { boundedLookup } from './boundedLookup.ts';
import { anonymousWho, type InternalEngUser } from './internalEng.ts';

type SessionUser = InternalEngUser & { id: string };

type Session = { user: SessionUser };

/**
 * Who opened a share, as the `viewer` prop of `share.open` and `embed.view`:
 * - `owner`: a signed-in viewer who made the share.
 * - `other`: a signed-in viewer who did not make it, a guest's share
 *   included, since a guest share has no maker account.
 * - `signed_out`: the session read answered with no session.
 * - `unknown`: the session read or the owner read failed or took over
 *   LOOKUP_TIMEOUT_MS, so the viewer may be the owner.
 */
export const SHARE_VIEWERS = ['owner', 'other', 'signed_out', 'unknown'] as const;

export type ShareViewer = (typeof SHARE_VIEWERS)[number];

/**
 * The props and `Who` of a `share.open` or `embed.view` event, with
 * `viewer` added to `props`. The session and the owner lookup are each
 * bounded by boundedLookup. Only an `other` or `signed_out` view keeps
 * `shareId`: share.create carries the maker's user id and the same share
 * id, so an owner's view with the id would tie that account to the row, and
 * an `unknown` view may be the owner's. Every view is still recorded, so the
 * event table holds every page load.
 */
export const shareViewEvent = async ({
    shareId,
    props,
    label,
    readSession,
    ownsShare,
}: {
    shareId: string;
    props: Record<string, unknown>;
    label: string;
    readSession: () => Promise<Session | null>;
    ownsShare: (shareId: string, userId: string) => Promise<boolean>;
}): Promise<{ props: Record<string, unknown>; who: ReturnType<typeof anonymousWho> }> => {
    // undefined marks a failed read, apart from null for no session.
    const session = await boundedLookup<Session | null | undefined>(
        readSession,
        undefined,
        `${label}: session read`,
    );
    const viewer = await viewerOf({ shareId, session, ownsShare, label });

    return {
        props:
            viewer === 'other' || viewer === 'signed_out'
                ? { ...props, shareId, viewer }
                : { ...props, viewer },
        who: anonymousWho(session?.user),
    };
};

const viewerOf = async ({
    shareId,
    session,
    ownsShare,
    label,
}: {
    shareId: string;
    session: Session | null | undefined;
    ownsShare: (shareId: string, userId: string) => Promise<boolean>;
    label: string;
}): Promise<ShareViewer> => {
    if (session === undefined) {
        return 'unknown';
    }

    if (session === null) {
        return 'signed_out';
    }

    const userId = session.user.id;
    // null marks a failed read.
    const owns = await boundedLookup<boolean | null>(
        () => ownsShare(shareId, userId),
        null,
        `${label}: owner read`,
    );

    if (owns === null) {
        return 'unknown';
    }

    return owns ? 'owner' : 'other';
};
