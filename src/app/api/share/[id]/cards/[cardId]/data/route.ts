import type { NextRequest } from 'next/server';

import { slotDepsFor } from '@/lib/chat/shareStore';
import { slotDataResponse } from '@/lib/studio/slotCards';

type Context = { params: Promise<{ id: string; cardId: string }> };

// GET /api/share/<id>/cards/<cardId>/data?slot=<n>&format=&bundle= → a file
// The rows behind the card slot n of a share draws, on the frame the slot
// serves now, streamed from dfo-apis. Public, like the link itself; 404
// without a slot. See src/lib/studio/slotCards.
export const GET = async (request: NextRequest, { params }: Context) => {
    const { id } = await params;

    return slotDataResponse(slotDepsFor(request.headers), id, request.nextUrl.searchParams);
};
