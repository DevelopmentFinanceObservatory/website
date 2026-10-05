import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { searchApiBase } from '@/lib/searchApi';
import { componentDataTarget } from '@/lib/studio/cardDownload';

// The Presentation API's component export (GET /api/presentation/components/
// {id}/revisions/{revision}/data?format=&bundle=: the frame rows behind one
// revision's shown values, as a file), mirrored under the site's domain. See
// src/lib/proxy/forward, which streams the bytes back with their
// Content-Type and Content-Disposition.
export const GET = async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string; revision: string }> },
) => {
    const { id, revision } = await params;

    return forward(req, {
        surface: 'api',
        target: componentDataTarget(searchApiBase(), id, revision, req.nextUrl.search),
        unreachable: 'The Presentation API is unreachable.',
    });
};
