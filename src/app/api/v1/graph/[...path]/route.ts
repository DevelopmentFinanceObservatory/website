import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { dotSegmentProblem } from '@/lib/proxy/problem';
import { isForwardablePath } from '@/lib/proxy/surfaces';
import { searchApiBase } from '@/lib/searchApi';

// The Graph API (node, documentation, sources, resolve, capabilities),
// mirrored 1:1 under the site's domain — see src/lib/proxy/forward.
const proxy = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
    params.then(({ path }) =>
        isForwardablePath(path)
            ? forward(req, {
                  surface: 'api',
                  target: `${searchApiBase()}/api/graph/${path.join('/')}${req.nextUrl.search}`,
                  unreachable: 'The Graph API is unreachable.',
              })
            : dotSegmentProblem(),
    );

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
