import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { rewriteOpenApi } from '@/lib/proxy/openapi';
import { searchApiBase } from '@/lib/searchApi';

// The DFO APIs' OpenAPI document, cut to the paths this host serves and
// addressed to it (src/lib/proxy/openapi), at the site root as dfo-apis
// serves its own (see src/lib/proxy/forward).
export const GET = (req: NextRequest) =>
    forward(req, {
        surface: 'api',
        target: `${searchApiBase()}/openapi.json${req.nextUrl.search}`,
        unreachable: 'The DFO APIs are unreachable.',
        rewrite: rewriteOpenApi,
    });
