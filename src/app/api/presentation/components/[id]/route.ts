import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { searchApiBase } from '@/lib/searchApi';

// The Presentation API's component read (GET /api/presentation/components/
// {id}?revision=N: one revision's stored intent, fact summary and resolved
// payload), mirrored under the site's domain — see src/lib/proxy/forward.
// Studio reads a revision here when its `component.revised` frame carries
// no payload. Only the read is exposed; creating and revising stay with the
// harness.
export const GET = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    return forward(req, {
        surface: 'api',
        target: `${searchApiBase()}/api/presentation/components/${encodeURIComponent(id)}${req.nextUrl.search}`,
        unreachable: 'The Presentation API is unreachable.',
    });
};
