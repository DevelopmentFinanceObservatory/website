/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are validated field by field below */
import { after, NextResponse, type NextRequest } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { GUEST_SHARES, readStudioShareRequest, shareCreateProps } from '@/lib/chat/shareMode';
import { createShare, liveShareRefusalFor, spendGuestShare } from '@/lib/chat/shareStore';
import { clientIp } from '@/lib/proxy/forward';
import { readBoundedText } from '@/lib/proxy/boundedBody';
import { problem, requestInvalidProblem } from '@/lib/proxy/problem';
import { track } from '@/lib/events/track';
import { createSearchShare } from '@/lib/search/searchShare';
import { readSearchShareRequest } from '@/lib/search/searchShareRequest';

// The largest share request read, in bytes; a larger one gets 413.
const MAX_SHARE_BODY = 10_000_000;

// POST /api/share { kind: 'search', mode, query, parts } → { id }
// A search result's link: dataset references only, no numbers. The search
// page is public, so an account is optional here (the share is simply
// unowned without one).
const shareSearch = async (body: any, headers: Headers) => {
    const request = readSearchShareRequest(body);

    if (!request) {
        return requestInvalidProblem('The request is not a search share.');
    }

    const user = await getUser();

    let created: { id: string };

    try {
        created = await createSearchShare(
            user?.id ?? null,
            request.mode,
            request.query,
            request.parts,
        );
    } catch (error) {
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
// A pruned copy of what the caller is looking at, under a short public id.
// An account is optional. A guest's share has no owner, so nobody can switch
// or remove it: a guest gets snapshots only (403 `live_needs_account`), and
// GUEST_SHARES a day per network address (429 `guest_limit`).
// `mode` is 'live' or 'snapshot' for a canvas or a card and 'snapshot' for a
// conversation. A request that names none stores a snapshot. A live share is
// refused when its data cards cannot all be refreshed (`liveShareRefusal` in
// src/lib/studio/liveShare), and the refusal names the cards in the way.
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

    const user = await getUser();

    if (!user) {
        if (read.mode === 'live') {
            return problem({
                status: 403,
                code: 'live_needs_account',
                detail: 'Sign in to make a live share. Without an account, a share is a snapshot.',
                retryable: false,
            });
        }

        if (!(await spendGuestShare(clientIp(request)))) {
            return problem({
                status: 429,
                code: 'guest_limit',
                detail: `This network has made today's ${GUEST_SHARES} guest shares. Sign in to make more.`,
                retryable: false,
            });
        }
    }

    const refusal = read.mode === 'live' ? await liveShareRefusalFor(read) : null;

    if (refusal) {
        return refusal;
    }

    const created = await createShare({ userId: user?.id ?? null, ...read });

    // Recorded after the response, so the link does not wait on analytics.
    after(() =>
        track(
            'share.create',
            shareCreateProps({ id: created.id, kind: read.kind, mode: read.mode }),
            { userId: user?.id ?? null, headers: request.headers },
        ),
    );

    return NextResponse.json(created);
};
