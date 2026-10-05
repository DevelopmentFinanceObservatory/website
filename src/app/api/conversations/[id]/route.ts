import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/session';
import {
    deleteConversation,
    getConversation,
    upsertConversation,
} from '@/lib/chat/conversationStore';
import type { SavedConversation } from '@/lib/chat/history';

type Params = { params: Promise<{ id: string }> };

// GET    /api/conversations/:id → the full saved document
// PUT    /api/conversations/:id → save (insert or replace)
// DELETE /api/conversations/:id
export const GET = async (_request: Request, { params }: Params) => {
    const user = await getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const saved = await getConversation(user.id, id);

    if (!saved) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ conversation: saved });
};

export const PUT = async (request: Request, { params }: Params) => {
    const user = await getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as SavedConversation | null;

    if (
        !body ||
        body.id !== id ||
        typeof body.title !== 'string' ||
        !Array.isArray(body.messages)
    ) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    await upsertConversation(user.id, body);

    return NextResponse.json({ ok: true });
};

export const DELETE = async (_request: Request, { params }: Params) => {
    const user = await getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await deleteConversation(user.id, id);

    return NextResponse.json({ ok: true });
};
