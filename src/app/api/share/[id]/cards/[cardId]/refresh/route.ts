import { slotDepsFor } from '@/lib/chat/shareStore';
import { slotRefreshResponse } from '@/lib/studio/slotCards';

type Context = { params: Promise<{ id: string; cardId: string }> };

// POST /api/share/<id>/cards/<cardId>/refresh → { status, card?, code?, retryable? }
// One data card of a live canvas or card share, drawn on the frame its slot
// in dfo-apis serves now. Public, like the link itself. See
// src/lib/studio/slotCards.
export const POST = async (request: Request, { params }: Context) => {
    const { id, cardId } = await params;

    return slotRefreshResponse(slotDepsFor(request.headers), id, cardId);
};
