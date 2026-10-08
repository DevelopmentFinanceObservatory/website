import { NextRequest } from 'next/server';

import { forward, STUDIO_API_BASE } from '@/lib/proxy/forward';

// The studio-v1 harness (`/api/studio/*` on dfo-ai), mirrored under the
// site's domain — see src/lib/proxy/forward. The harness wants
// `Authorization: Bearer` on every call; the proxy attaches the token, so it
// never reaches a client. Any non-empty token satisfies the local server.
const STUDIO_TOKEN = process.env.STUDIO_TOKEN ?? 'dev';

const proxy = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
    params.then(({ path }) =>
        forward(req, {
            surface: 'api',
            target: `${STUDIO_API_BASE}/api/studio/${path.join('/')}${req.nextUrl.search}`,
            bearer: STUDIO_TOKEN,
            unreachable: 'The studio agent is unreachable. Is it running? (just dev in dfo-ai)',
        }),
    );

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
