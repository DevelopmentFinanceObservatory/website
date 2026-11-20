// No db or server-only imports, so src/lib/test/events-share-view.test.ts can
// run it under plain node. src/app/s/[id]/page.tsx and
// src/app/embed/[id]/page.tsx pass in the session and owner reads.

import { boundedLookup } from './boundedLookup.ts';
import { anonymousWho, type InternalEngUser } from './internalEng.ts';

type SessionUser = InternalEngUser & { id: string };

/**
 * The props and `Who` of a `share.open` or `embed.view` event. The session
 * and the owner lookup are each bounded by boundedLookup, so a stalled read
 * records the event as a signed-out view. A view by the share's owner drops
 * `shareId`: share.create carries the maker's user id and the same share id,
 * so an owner's view with the id would tie that account to the row. The row
 * still counts, with `owner: true`, so the event table holds every page
 * load.
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
    readSession: () => Promise<{ user: SessionUser } | null>;
    ownsShare: (shareId: string, userId: string) => Promise<boolean>;
}): Promise<{ props: Record<string, unknown>; who: ReturnType<typeof anonymousWho> }> => {
    const session = await boundedLookup(readSession, null, `${label}: session read`);
    const userId = session?.user.id;
    const owner = userId
        ? await boundedLookup(() => ownsShare(shareId, userId), false, `${label}: owner read`)
        : false;

    return {
        props: owner ? { ...props, owner } : { ...props, shareId, owner },
        who: anonymousWho(session?.user),
    };
};
