import 'server-only';

import { studioShareBody, type StudioShareBody } from './sharePayload';
import type { StudioShareRequest } from './shareMode';
import { slotDepsFor } from './shareStore';

import { readBoundedText } from '@/lib/proxy/boundedBody';
import { problem, requestInvalidProblem } from '@/lib/proxy/problem';
import { liveCardsRefusal } from '@/lib/studio/slotCards';

/**
 * The steps every route that makes a Studio share runs before it creates
 * one: `POST /api/share` and the Library's publish (src/lib/library/admin.ts).
 * Both read the same body and send dfo-apis the same share, so a Library
 * artifact's share is made exactly as a share link is.
 */

/** The largest share request read, in bytes; a larger one gets 413. */
export const MAX_SHARE_BODY = 10_000_000;

/** A share request's JSON body, null when it is not JSON, or the 413
 *  problem document for a body over `MAX_SHARE_BODY`. */
export const readShareJson = async (body: ReadableStream<Uint8Array> | null): Promise<unknown> => {
    const text = await readBoundedText(body, MAX_SHARE_BODY).catch(() => '');

    if (text === null) {
        return problem({
            status: 413,
            code: 'payload_too_large',
            detail: `The request body is over ${MAX_SHARE_BODY} bytes.`,
            retryable: false,
        });
    }

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

/**
 * The create body for the Studio share `request` asks for, or the 400
 * problem document that refuses it. A live share is checked before it is
 * made (`liveCardsRefusal`), so none is left behind when its cards fail:
 * `live_cards_blocked` names a data card it shows that names no component
 * revision, or one that cannot follow newer data, and `live_too_many_cards`
 * gives the cap. A card share whose card has no saved revision is
 * `request_invalid`.
 */
export const buildStudioShare = async (
    headers: Headers,
    request: StudioShareRequest,
): Promise<StudioShareBody | Response> => {
    const share = studioShareBody(request);

    if ('unslotted' in share) {
        return problem({
            status: 400,
            code: 'live_cards_blocked',
            detail: 'Some data cards cannot show live data, so the share cannot be live.',
            retryable: false,
            extra: { cards: share.unslotted.map((id) => ({ id, reason: 'missing_ref' })) },
        });
    }

    // A card saved before cards kept their revision has nothing dfo-apis
    // can draw, and a card share takes at least one card.
    if (share.kind === 'card' && share.cards.length === 0) {
        return requestInvalidProblem('This card has no saved revision, so it cannot be shared.');
    }

    const refusal = share.latest ? await liveCardsRefusal(slotDepsFor(headers), share) : null;

    return refusal ?? share;
};
