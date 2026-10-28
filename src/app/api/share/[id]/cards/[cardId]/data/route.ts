import type { NextRequest } from 'next/server';

import { slotDepsFor } from '@/lib/chat/shareStore';
import { slotDataResponse } from '@/lib/studio/slotCards';

type Context = { params: Promise<{ id: string; cardId: string }> };

// GET /api/share/<id>/cards/<cardId>/data?format=&bundle= → a file
// The rows behind a live share's card on the frame its slot serves now,
// streamed from dfo-apis. Public, like the link itself. See
// src/lib/studio/slotCards.
export const GET = async (request: NextRequest, { params }: Context) => {
    const { id, cardId } = await params;

    return slotDataResponse(slotDepsFor(request.headers), id, cardId, request.nextUrl.searchParams);
};
