import { after, NextRequest } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { forward } from '@/lib/proxy/forward';
import { dotSegmentProblem } from '@/lib/proxy/problem';
import { logAccount } from '@/lib/proxy/requestLog';
import { forwardablePath } from '@/lib/proxy/surfaces';
import { searchApiBase } from '@/lib/searchApi';

// The Search API, mirrored 1:1 under the site's domain (see
// src/lib/proxy/forward). Every door the engine has, every method —
// resolve streams (SSE) and passes through unbuffered. A resolve's account
// line (AccountLogEntry in src/lib/proxy/requestLog) is written after the
// stream ends, so the session read adds nothing to the response.
const proxy = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
    params.then(({ path }) => {
        const rest = forwardablePath(path);

        if (rest === undefined) {
            return dotSegmentProblem();
        }

        if (req.method === 'POST' && rest === '/resolve') {
            after(() =>
                logAccount(
                    req.headers,
                    '/api/v1/search/resolve',
                    async () => (await getUser())?.id ?? null,
                ),
            );
        }

        return forward(req, {
            surface: 'api',
            target: `${searchApiBase()}/api/search${rest}${req.nextUrl.search}`,
            unreachable: 'The Search API is unreachable.',
        });
    });

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
