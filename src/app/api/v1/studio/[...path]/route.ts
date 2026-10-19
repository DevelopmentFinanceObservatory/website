import { NextRequest } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { clientIp, forward, STUDIO_API_BASE } from '@/lib/proxy/forward';
import {
    meterTurn,
    refundPrompt,
    spendPrompt,
    studioRoute,
    type Prompter,
} from '@/lib/studio/spendPrompt';

// The studio-v1 harness (`/api/studio/*` on dfo-ai), mirrored under the
// site's domain — see src/lib/proxy/forward. The harness wants
// `Authorization: Bearer` on every call; the proxy attaches the token, so it
// never reaches a client. Any non-empty token satisfies the local server.
const STUDIO_TOKEN = process.env.STUDIO_TOKEN ?? 'dev';

const giveBack = (prompter: Prompter) =>
    refundPrompt(db, prompter).catch((error) =>
        console.error('studio: a prompt was not given back', error),
    );

// Only the routes the browser calls go through (studioRoute). A turn spends
// one prompt of the caller's daily allowance, and meterTurn
// (src/lib/studio/spendPrompt) gives it back when the turn does not start.
const proxy = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
    const route = studioRoute((await params).path);

    if (!route) {
        return Response.json(
            { error: 'not_found', retry: 'do_not_retry', detail: 'There is no such Studio route.' },
            { status: 404 },
        );
    }

    const options = {
        surface: 'api',
        target: `${STUDIO_API_BASE}/api/studio/${route}${req.nextUrl.search}`,
        bearer: STUDIO_TOKEN,
        unreachable: 'The studio agent is unreachable. Is it running? (just dev in dfo-ai)',
    } as const;

    if (req.method !== 'POST' || route !== 'turn') {
        return forward(req, options);
    }

    const spend = async () => {
        const user = await getUser();
        const prompter: Prompter = user ? { userId: user.id } : { address: clientIp(req) };

        return { prompter, refusal: await spendPrompt(db, prompter) };
    };

    return meterTurn(spend, giveBack, (admit) => forward(req, { ...options, admit }));
};

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
