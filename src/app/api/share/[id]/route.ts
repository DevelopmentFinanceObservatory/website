import { NextResponse } from 'next/server';

import { getSearchShare } from '@/lib/search/searchShare';

// GET /api/share/<id> → a search share's references ({ mode, query, refs }).
// Public, like the link itself; conversation shares render server-side on
// /s/<id> and never come through here.
export const GET = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const found = /^[A-Za-z0-9]{8}$/.test(id) ? await getSearchShare(id) : null;

    if (!found) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json(found, { headers: { 'Cache-Control': 'no-store' } });
};
