import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { dotSegmentProblem } from '@/lib/proxy/problem';
import { isForwardablePath } from '@/lib/proxy/surfaces';
import { searchApiBase } from '@/lib/searchApi';

// The Search API, mirrored 1:1 under the site's domain (see
// src/lib/proxy/forward). Every door the engine has, every method —
// resolve streams (SSE) and passes through unbuffered.
const proxy = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
    params.then(({ path }) =>
        isForwardablePath(path)
            ? forward(req, {
                  surface: 'api',
                  target: `${searchApiBase()}/api/search/${path.join('/')}${req.nextUrl.search}`,
                  unreachable: 'The Search API is unreachable.',
              })
            : dotSegmentProblem(),
    );

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
