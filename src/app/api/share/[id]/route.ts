import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { deleteShare, snapshotShare } from '@/lib/chat/shareStore';
import type { OwnerWriteResult } from '@/lib/chat/shareWrites';
import { getSearchShare } from '@/lib/search/searchShare';

type Context = { params: Promise<{ id: string }> };

const SHARE_ID = /^[A-Za-z0-9]{8}$/;

// GET /api/share/<id> → a search share's references ({ mode, query, refs }).
// Public, like the link itself; conversation shares render server-side on
// /s/<id> and never come through here.
export const GET = async (_request: Request, { params }: Context) => {
    const { id } = await params;
    const found = SHARE_ID.test(id) ? await getSearchShare(id) : null;

    if (!found) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json(found, { headers: { 'Cache-Control': 'no-store' } });
};

// An owner's write to their own Studio share. A share that does not exist
// and one that belongs to someone else both answer 404, so the answer does
// not reveal which ids are taken.
const ownerWrite = async (
    { params }: Context,
    write: (id: string, userId: string) => Promise<OwnerWriteResult>,
    done: (id: string) => NextResponse,
) => {
    const user = await getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = SHARE_ID.test(id) ? await write(id, user.id) : 'not_found';

    if (result === 'not_found') {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    if (result === 'unsupported_kind') {
        return NextResponse.json({ error: 'unsupported_kind' }, { status: 400 });
    }

    return done(id);
};

// PATCH /api/share/<id> { mode: 'snapshot' } → { id, mode }
// Switches the caller's live canvas or card share to snapshot. A snapshot
// cannot be switched to live here.
export const PATCH = async (request: Request, context: Context) => {
    const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;

    if (body?.mode !== 'snapshot') {
        return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
    }

    return ownerWrite(context, snapshotShare, (id) => NextResponse.json({ id, mode: 'snapshot' }));
};

// DELETE /api/share/<id> → 204
// Removes the caller's conversation, canvas, or card share.
export const DELETE = async (_request: Request, context: Context) =>
    ownerWrite(context, deleteShare, () => new NextResponse(null, { status: 204 }));
