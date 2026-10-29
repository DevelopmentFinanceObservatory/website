import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { dotSegmentProblem } from '@/lib/proxy/problem';
import { forwardablePath } from '@/lib/proxy/surfaces';
import { searchApiBase } from '@/lib/searchApi';

// The Presentation API's component read (GET /api/presentation/components/
// {id}?revision=N: one revision's stored intent, fact summary and resolved
// payload), mirrored under the site's domain — see src/lib/proxy/forward.
// Studio reads a revision here when its `component.revised` frame carries
// no payload. This route only reads: cards are created and revised through
// /api/v1/presentation/components, and dfo-apis bounds them per caller.
export const GET = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const rest = forwardablePath([(await params).id]);

    if (rest === undefined) {
        return dotSegmentProblem();
    }

    return forward(req, {
        surface: 'api',
        target: `${searchApiBase()}/api/presentation/components${rest}${req.nextUrl.search}`,
        unreachable: 'The Presentation API is unreachable.',
    });
};
