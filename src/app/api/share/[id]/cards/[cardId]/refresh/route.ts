import type { NextRequest } from 'next/server';

import { slotDepsFor } from '@/lib/chat/shareStore';
import { slotOfQuery, slotRefreshResponse } from '@/lib/studio/slotCards';

type Context = { params: Promise<{ id: string; cardId: string }> };

// GET /api/share/<id>/cards/<cardId>/refresh?slot=<n> → { status, card?, code?, retryable? }
// One data card of a live canvas or card share, drawn on the frame slot n
// of the share in dfo-apis serves now. Public, like the link itself. The
// share page names each card's slot, so the route reads that slot alone;
// without one it answers 404. dfo-apis' ETag goes back with it and the
// browser's If-None-Match goes on to dfo-apis, so an unchanged card answers
// 304. POST answers the same, for pages that send it. See
// src/lib/studio/slotCards.
export const GET = async (request: NextRequest, { params }: Context) => {
    const { id } = await params;

    return slotRefreshResponse(
        slotDepsFor(request.headers),
        id,
        slotOfQuery(request.nextUrl.searchParams.get('slot')),
        request.headers.get('if-none-match'),
    );
};

export const POST = GET;
