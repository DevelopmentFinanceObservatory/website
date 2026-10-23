import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { searchApiBase } from '@/lib/searchApi';

// The DFO APIs' OpenAPI document, served at the site root as dfo-apis serves
// it at its own (see src/lib/proxy/forward).
export const GET = (req: NextRequest) =>
    forward(req, {
        surface: 'api',
        target: `${searchApiBase()}/openapi.json`,
        unreachable: 'The DFO APIs are unreachable.',
    });
