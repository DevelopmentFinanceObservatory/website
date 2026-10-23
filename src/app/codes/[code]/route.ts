import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { searchApiBase } from '@/lib/searchApi';

// The DFO APIs' problem-details type registry: an error body's
// `type: "/codes/<code>"` resolves here, mirrored from dfo-apis's root (see
// src/lib/proxy/forward). The code is re-encoded so it stays one segment.
export const GET = (req: NextRequest, { params }: { params: Promise<{ code: string }> }) =>
    params.then(({ code }) =>
        forward(req, {
            surface: 'api',
            target: `${searchApiBase()}/codes/${encodeURIComponent(code)}${req.nextUrl.search}`,
            unreachable: 'The DFO APIs are unreachable.',
        }),
    );
