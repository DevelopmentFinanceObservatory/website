/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are validated field by field below */
import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/session';
import type { SavedConversation } from '@/lib/chat/history';
import { createShare, ShareKind } from '@/lib/chat/shareStore';
import {
    createSearchShare,
    isSearchSharePart,
    type SearchShareMode,
} from '@/lib/search/searchShare';

const KINDS: ShareKind[] = ['conversation', 'canvas', 'card'];
const MODES: SearchShareMode[] = ['live', 'snapshot'];

// POST /api/share { kind: 'search', mode, query, parts } → { id }
// A search result's link: dataset references only, no numbers. The search
// page is public, so an account is optional here (the share is simply
// unowned without one).
const shareSearch = async (body: any) => {
    const parts = Array.isArray(body?.parts) ? body.parts : [];
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 500) : '';

    if (
        !MODES.includes(body?.mode) ||
        !query ||
        parts.length === 0 ||
        !parts.every(isSearchSharePart)
    ) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const user = await getUser();

    try {
        return NextResponse.json(
            await createSearchShare(user?.id ?? null, body.mode, query, parts),
        );
    } catch (error) {
        // The platform refused the register/mint — say which, don't store a
        // link that can't open. The log names the datasets and the cause.
        const { message, cause } = error as Error;

        console.error('share: search share capture failed', {
            mode: body.mode,
            specIds: parts.map((part: { specId: string }) => part.specId),
            error: message,
            cause: cause instanceof Error ? cause.message : undefined,
        });

        return NextResponse.json({ error: 'platform_refused', detail: message }, { status: 502 });
    }
};

// POST /api/share { kind, conversation, cardId? } → { id, title }
// A frozen copy of what the caller is looking at, under a short public id.
export const POST = async (request: Request) => {
    const body = (await request.json().catch(() => null)) as {
        kind?: ShareKind;
        cardId?: string;
        conversation?: SavedConversation;
    } | null;

    if (body?.kind === 'search') {
        return shareSearch(body);
    }

    const user = await getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const saved = body?.conversation;

    if (
        !body?.kind ||
        !KINDS.includes(body.kind) ||
        !saved ||
        typeof saved.id !== 'string' ||
        !Array.isArray(saved.widgets) ||
        (body.kind === 'card' && typeof body.cardId !== 'string')
    ) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const created = await createShare(user.id, body.kind, saved, body.cardId);

    return NextResponse.json(created);
};
