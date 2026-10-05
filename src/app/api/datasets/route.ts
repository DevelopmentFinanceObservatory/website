import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { searchApiBase } from '@/lib/searchApi';

// The Datasets API's mint door (POST /api/datasets: a downloadable dataset,
// answered with a manifest of signed URLs), mirrored under the site's
// domain — see src/lib/proxy/forward. The document routes are [...path].
const proxy = (req: NextRequest) =>
    forward(req, {
        surface: 'api',
        target: `${searchApiBase()}/api/datasets${req.nextUrl.search}`,
        unreachable: 'The Datasets API is unreachable.',
    });

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
