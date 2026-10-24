import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { listConversations, searchConversations } from '@/lib/chat/conversationStore';
import { unauthorizedProblem } from '@/lib/proxy/problem';

// GET  /api/conversations       → the signed-in user's history (list columns only)
// GET  /api/conversations?q=…   → the ones whose title or transcript match
export const GET = async (request: Request) => {
    const user = await getUser();

    if (!user) {
        return unauthorizedProblem();
    }

    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';

    return NextResponse.json({
        conversations: q
            ? await searchConversations(user.id, q.slice(0, 200))
            : await listConversations(user.id),
    });
};
