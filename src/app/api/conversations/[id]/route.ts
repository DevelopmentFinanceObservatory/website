import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/session';
import {
    deleteConversation,
    getConversation,
    upsertConversation,
} from '@/lib/chat/conversationStore';
import { isSaveableConversation } from '@/lib/chat/conversationSave';
import type { SavedConversation } from '@/lib/chat/history';
import { missingProblem, requestInvalidProblem, unauthorizedProblem } from '@/lib/proxy/problem';
import { MAX_CONVERSATION_ID_CHARS } from '@/lib/studio/studioAccess';

type Params = { params: Promise<{ id: string }> };

// GET    /api/conversations/:id → the full saved document
// PUT    /api/conversations/:id → save (insert or replace)
// DELETE /api/conversations/:id
export const GET = async (_request: Request, { params }: Params) => {
    const user = await getUser();

    if (!user) {
        return unauthorizedProblem();
    }

    const { id } = await params;
    const saved = await getConversation(user.id, id);

    if (!saved) {
        return missingProblem('There is no such conversation.');
    }

    return NextResponse.json({ conversation: saved });
};

export const PUT = async (request: Request, { params }: Params) => {
    const user = await getUser();

    if (!user) {
        return unauthorizedProblem();
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as SavedConversation | null;

    if (!isSaveableConversation(id, body)) {
        return requestInvalidProblem(
            `The body needs the conversation id from the path, a title, and a list of messages, with ids of at most ${MAX_CONVERSATION_ID_CHARS} characters.`,
        );
    }

    await upsertConversation(user.id, body);

    return NextResponse.json({ ok: true });
};

export const DELETE = async (_request: Request, { params }: Params) => {
    const user = await getUser();

    if (!user) {
        return unauthorizedProblem();
    }

    const { id } = await params;

    await deleteConversation(user.id, id);

    return NextResponse.json({ ok: true });
};
