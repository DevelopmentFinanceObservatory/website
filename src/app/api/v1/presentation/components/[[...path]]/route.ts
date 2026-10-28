import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { PRESENTATION_HEADERS } from '@/lib/proxy/headers';
import { dotSegmentProblem } from '@/lib/proxy/problem';
import { isForwardablePath } from '@/lib/proxy/surfaces';
import { searchApiBase } from '@/lib/searchApi';

// The Presentation API's cards (create, revise, read, and a revision's data),
// mirrored 1:1 under the site's domain (see src/lib/proxy/forward). The write
// token a card was made with goes upstream (PRESENTATION_HEADERS).
const proxy = (req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) =>
    params.then(({ path = [] }) => {
        if (!isForwardablePath(path)) {
            return dotSegmentProblem();
        }

        const rest = path.map((segment) => `/${encodeURIComponent(segment)}`).join('');

        return forward(req, {
            surface: 'api',
            target: `${searchApiBase()}/api/presentation/components${rest}${req.nextUrl.search}`,
            pass: PRESENTATION_HEADERS,
            unreachable: 'The Presentation API is unreachable.',
        });
    });

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
