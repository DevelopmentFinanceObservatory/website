import { slotDepsFor } from '@/lib/chat/shareStore';
import { slotRefreshResponse } from '@/lib/studio/slotCards';

type Context = { params: Promise<{ id: string; cardId: string }> };

// GET /api/share/<id>/cards/<cardId>/refresh → { status, card?, code?, retryable? }
// One data card of a live canvas or card share, drawn on the frame its slot
// in dfo-apis serves now. Public, like the link itself. dfo-apis' ETag goes
// back with it and the browser's If-None-Match goes on to dfo-apis, so an
// unchanged card answers 304. POST answers alike for pages loaded before
// the refresh became a GET. See src/lib/studio/slotCards.
export const GET = async (request: Request, { params }: Context) => {
    const { id, cardId } = await params;

    return slotRefreshResponse(
        slotDepsFor(request.headers),
        id,
        cardId,
        request.headers.get('if-none-match'),
    );
};

export const POST = GET;
