/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are validated field by field below */
import { after, NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { readStudioShareRequest, shareCreateProps } from '@/lib/chat/shareMode';
import { createShare, liveShareRefusalFor } from '@/lib/chat/shareStore';
import { track } from '@/lib/events/track';
import { createSearchShare } from '@/lib/search/searchShare';
import { readSearchShareRequest } from '@/lib/search/searchShareRequest';

// POST /api/share { kind: 'search', mode, query, parts } → { id }
// A search result's link: dataset references only, no numbers. The search
// page is public, so an account is optional here (the share is simply
// unowned without one).
const shareSearch = async (body: any, headers: Headers) => {
    const request = readSearchShareRequest(body);

    if (!request) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
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

        return NextResponse.json({ error: 'platform_refused', detail: message }, { status: 502 });
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
// `mode` is 'live' or 'snapshot' for a canvas or a card and 'snapshot' for a
// conversation. A request that names none stores a snapshot. A live share is
// refused when its data cards cannot all be refreshed (`liveShareRefusal` in
// src/lib/studio/liveShare), and the refusal names the cards in the way.
export const POST = async (request: Request) => {
    const body = await request.json().catch(() => null);

    if (body?.kind === 'search') {
        return shareSearch(body, request.headers);
    }

    const user = await getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const read = readStudioShareRequest(body);

    if ('error' in read) {
        return NextResponse.json(read, { status: 400 });
    }

    const refusal = read.mode === 'live' ? await liveShareRefusalFor(read) : null;

    if (refusal) {
        return NextResponse.json(refusal.body, { status: refusal.status });
    }

    const created = await createShare({ userId: user.id, ...read });

    // Recorded after the response, so the link does not wait on analytics.
    after(() =>
        track(
            'share.create',
            shareCreateProps({ id: created.id, kind: read.kind, mode: read.mode }),
            { userId: user.id, headers: request.headers },
        ),
    );

    return NextResponse.json(created);
};
