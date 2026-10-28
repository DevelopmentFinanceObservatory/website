import { NextRequest } from 'next/server';

import { forward } from '@/lib/proxy/forward';
import { PRESENTATION_HEADERS } from '@/lib/proxy/headers';
import { searchApiBase } from '@/lib/searchApi';

// The Presentation API's shares (create, replace, delete, read, a slot's
// data at /{id}/slots/{n}/data, and /{id}/history), mirrored 1:1 under the
// site's domain (see src/lib/proxy/forward). The write token, the slot data's
// ETag and If-None-Match, and CORS for pages on other origins pass through
// (PRESENTATION_HEADERS).
const proxy = (req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) =>
    params.then(({ path = [] }) => {
        const rest = path.map((segment) => `/${encodeURIComponent(segment)}`).join('');

        return forward(req, {
            surface: 'api',
            target: `${searchApiBase()}/api/presentation/shares${rest}${req.nextUrl.search}`,
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
