import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { SHARE_ID, SharesError } from '@/lib/chat/apisShares';
import { writeOwnShare } from '@/lib/chat/shareStore';
import {
    missingProblem,
    problem,
    requestInvalidProblem,
    unauthorizedProblem,
} from '@/lib/proxy/problem';
import { getSearchShare } from '@/lib/search/searchShare';

type Context = { params: Promise<{ id: string }> };

const noSuchShare = (): Response => missingProblem('There is no such share.');

// GET /api/share/<id> → a search share's references ({ mode, query, refs }).
// Public, like the link itself; Studio shares render server-side on
// /s/<id> and never come through here.
export const GET = async (_request: Request, { params }: Context) => {
    const { id } = await params;
    const found = SHARE_ID.test(id) ? await getSearchShare(id) : null;

    if (!found) {
        return noSuchShare();
    }

    return NextResponse.json(found, { headers: { 'Cache-Control': 'no-store' } });
};

// An owner's write to their own share in dfo-apis, with the write token the
// site kept when they made it. A share that does not exist, one the caller
// holds no token for, and a guest's share all answer 404, so the answer does
// not reveal which ids are taken.
const ownerWrite = async (
    request: Request,
    { params }: Context,
    action: 'snapshot' | 'delete',
    done: (id: string) => Response,
) => {
    const user = await getUser();

    if (!user) {
        return unauthorizedProblem();
    }

    const { id } = await params;

    try {
        const result = await writeOwnShare(request.headers, {
            shareId: id,
            userId: user.id,
            action,
        });

        if (result === 'unsupported_kind') {
            return problem({
                status: 400,
                code: 'unsupported_kind',
                detail: 'Only a canvas or card share can be switched to a snapshot.',
                retryable: false,
            });
        }

        return result === 'done' ? done(id) : noSuchShare();
    } catch (error) {
        if (!(error instanceof SharesError)) {
            throw error;
        }

        console.error('share: dfo-apis refused an owner write', {
            action,
            code: error.code,
            status: error.status,
        });

        return problem({
            status: 502,
            code: 'transient_unavailable',
            detail: 'The share could not be changed right now. Try again in a minute.',
            retryable: true,
        });
    }
};

// PATCH /api/share/<id> { mode: 'snapshot' } → { id, mode }
// Switches the caller's live canvas or card share to snapshot under the same
// URLs: each slot keeps the data it serves now. A snapshot answers as it is.
// A snapshot cannot be switched to live. A search or conversation share
// answers 400 `unsupported_kind`.
export const PATCH = async (request: Request, context: Context) => {
    const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;

    if (body?.mode !== 'snapshot') {
        return requestInvalidProblem('A share can only be switched to `snapshot`.', '/mode');
    }

    return ownerWrite(request, context, 'snapshot', (id) =>
        NextResponse.json({ id, mode: 'snapshot' }),
    );
};

// DELETE /api/share/<id> → 204
// Takes down the caller's share, of any kind.
export const DELETE = async (request: Request, context: Context) =>
    ownerWrite(request, context, 'delete', () => new NextResponse(null, { status: 204 }));
