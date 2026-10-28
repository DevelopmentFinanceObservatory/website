/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are validated field by field below */
import { after, NextResponse, type NextRequest } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { SharesError } from '@/lib/chat/apisShares';
import { studioShareBody } from '@/lib/chat/sharePayload';
import { readStudioShareRequest, shareCreateProps } from '@/lib/chat/shareMode';
import { makeShare } from '@/lib/chat/shareStore';
import { readBoundedText } from '@/lib/proxy/boundedBody';
import { problem, requestInvalidProblem } from '@/lib/proxy/problem';
import { track } from '@/lib/events/track';
import { createSearchShare } from '@/lib/search/searchShare';
import { readSearchShareRequest } from '@/lib/search/searchShareRequest';

// The largest share request read, in bytes; a larger one gets 413.
const MAX_SHARE_BODY = 10_000_000;

// What a refusal of dfo-apis' share create says to the browser. A spent
// share allowance (counted by dfo-apis per network address) is 429
// `share_limit`, with dfo-apis' Retry-After. Everything else is a fault the
// sharer cannot fix, 502, retryable when dfo-apis said so.
const sharesRefusal = (error: SharesError): Response => {
    if (error.code === 'allowance_exhausted') {
        return problem({
            status: 429,
            code: 'share_limit',
            detail: "This network has made today's shares. Try again tomorrow.",
            retryable: true,
            headers: error.retryAfterS ? { 'Retry-After': String(error.retryAfterS) } : undefined,
        });
    }

    console.error('share: dfo-apis refused the share', { code: error.code, status: error.status });

    return problem({
        status: 502,
        code: 'transient_unavailable',
        detail: 'The share could not be made right now. Try again in a minute.',
        retryable: error.retryable || error.status === undefined || error.status >= 500,
    });
};

// POST /api/share { kind: 'search', mode, query, parts } → { id }
// A search result's link: dataset references only, no numbers. The search
// page is public, so an account is optional here. A signed-in sharer's
// write token is kept; a guest's share stays as made.
const shareSearch = async (body: any, headers: Headers) => {
    const request = readSearchShareRequest(body);

    if (!request) {
        return requestInvalidProblem('The request is not a search share.');
    }

    const user = await getUser();

    let created: { id: string };

    try {
        created = await createSearchShare(
            headers,
            user?.id ?? null,
            request.mode,
            request.query,
            request.parts,
        );
    } catch (error) {
        if (error instanceof SharesError) {
            return sharesRefusal(error);
        }

        // The platform refused the register/mint — say which, don't store a
        // link that can't open. The log names the datasets and the cause.
        const { message, cause } = error as Error;

        console.error('share: search share capture failed', {
            mode: request.mode,
            specIds: request.parts.map((part) => part.specId),
            error: message,
            cause: cause instanceof Error ? cause.message : undefined,
        });

        return problem({
            status: 502,
            code: 'platform_refused',
            detail: 'The data platform could not capture this result.',
            retryable: false,
            // The platform's own code, which the share box words for the viewer.
            extra: { platform_code: message },
        });
    }

    // Recorded after the response, so the link does not wait on analytics.
    after(() =>
        track(
            'share.create',
            shareCreateProps({ id: created.id, kind: 'search', mode: request.mode }),
            { userId: user?.id ?? null, headers },
        ),
    );

    return NextResponse.json(created);
};

// POST /api/share { kind, conversation, cardId?, mode? } → { id, title }
// A pruned copy of what the caller is looking at, made in dfo-apis
// (src/lib/chat/sharePayload, src/lib/chat/apisShares) under a short public
// id. An account is optional. A signed-in sharer's write token is kept, so
// they can switch the share to a snapshot or remove it later; a guest's
// share, live or snapshot, stays as made. dfo-apis counts shares per
// network address (429 `share_limit`).
// `mode` is 'live' or 'snapshot' for a canvas or a card and 'snapshot' for a
// conversation. A request that names none stores a snapshot. A live share is
// refused when a data card it shows names no component revision
// (400 `live_cards_blocked`, naming the cards).
// Every refusal is a problem document (src/lib/proxy/problem).
export const POST = async (request: NextRequest) => {
    const text = await readBoundedText(request.body, MAX_SHARE_BODY).catch(() => '');

    if (text === null) {
        return problem({
            status: 413,
            code: 'payload_too_large',
            detail: `The request body is over ${MAX_SHARE_BODY} bytes.`,
            retryable: false,
        });
    }

    const body = (() => {
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    })();

    if (body?.kind === 'search') {
        return shareSearch(body, request.headers);
    }

    const read = readStudioShareRequest(body);

    if (read instanceof Response) {
        return read;
    }

    const share = studioShareBody(read);

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

    const user = await getUser();
    let created: { id: string };

    try {
        created = await makeShare(request.headers, user?.id ?? null, share);
    } catch (error) {
        if (error instanceof SharesError) {
            return sharesRefusal(error);
        }

        throw error;
    }

    // Recorded after the response, so the link does not wait on analytics.
    after(() =>
        track(
            'share.create',
            shareCreateProps({ id: created.id, kind: read.kind, mode: read.mode }),
            { userId: user?.id ?? null, headers: request.headers },
        ),
    );

    return NextResponse.json({ id: created.id, title: share.title });
};
