import { apisFetch } from '@/lib/apisAuth';
import { db } from '@/lib/db';
import { refreshResponse } from '@/lib/studio/liveShare';

type Context = { params: Promise<{ id: string; cardId: string }> };

// POST /api/share/<id>/cards/<cardId>/refresh → { status, card?, retry_after_s?, code? }
// One data card of a live canvas or card share on current data. Public, like
// the link itself. The server calls dfo-apis or dfo-ai with a credential
// that stays here. The route sits outside the /api/studio proxy, which
// forwards any path. See src/lib/studio/liveShare.
export const POST = async (_request: Request, { params }: Context) => {
    const { id, cardId } = await params;

    return refreshResponse({ db, env: process.env, fetch: apisFetch }, id, cardId);
};
