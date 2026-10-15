import type { NextRequest } from 'next/server';

import { apisFetch } from '@/lib/apisAuth';
import { db } from '@/lib/db';
import { dataResponse } from '@/lib/studio/liveShare';

type Context = { params: Promise<{ id: string; cardId: string }> };

// GET /api/share/<id>/cards/<cardId>/data?format=&bundle= → a file
// The rows behind a live share's card as its last refresh drew it, streamed
// from dfo-apis. Public, like the link itself. See src/lib/studio/liveShare.
export const GET = async (request: NextRequest, { params }: Context) => {
    const { id, cardId } = await params;

    return dataResponse(
        { db, env: process.env, fetch: apisFetch },
        id,
        cardId,
        request.nextUrl.searchParams,
    );
};
