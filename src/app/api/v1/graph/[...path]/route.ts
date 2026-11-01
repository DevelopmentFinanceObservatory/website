import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { dotSegmentProblem } from '@/lib/proxy/problem';
import { forwardablePath } from '@/lib/proxy/surfaces';
import { searchApiBase } from '@/lib/searchApi';

// The Graph API (node, documentation, sources, resolve, capabilities),
// mirrored 1:1 under the site's domain — see src/lib/proxy/forward.
const proxy = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
    params.then(({ path }) => {
        const rest = forwardablePath(path);

        if (rest === undefined) {
            return dotSegmentProblem();
        }

        return forward(req, {
            surface: 'api',
            target: `${searchApiBase()}/api/graph${rest}${req.nextUrl.search}`,
            unreachable: 'The Graph API is unreachable.',
        });
    });

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
