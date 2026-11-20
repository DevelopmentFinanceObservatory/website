import { NextRequest } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { counterDb } from '@/lib/db';
import { clientIp, forward, STUDIO_API_BASE } from '@/lib/proxy/forward';
import { notFoundProblem } from '@/lib/proxy/problem';
import { studioIdentity } from '@/lib/proxy/studioIdentity';
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

// The session's user, read once per request on first use. A turn's prompt
// spend and its x-dfo-account share one read, and an interrupt reads it only
// when forward() asks for the account.
const sessionOnce = () => {
    let user: ReturnType<typeof getUser> | undefined;

    return () => (user ??= getUser());
};

const giveBack = (receipt: Parameters<typeof refundPrompt>[1]) =>
    refundPrompt(counterDb, receipt).catch((error) =>
        console.error('studio: a prompt was not given back', error),
    );

// Only the routes the browser calls go through (studioRoute). A turn spends
// one prompt of the caller's daily allowance, and meterTurn
// (src/lib/studio/spendPrompt) gives it back when the turn does not start.
const proxy = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
    const route = studioRoute((await params).path);

    if (!route) {
        return notFoundProblem(req.nextUrl.pathname);
    }

    const session = sessionOnce();
    const options = {
        surface: 'api',
        target: `${STUDIO_API_BASE}/api/studio/${route}${req.nextUrl.search}`,
        bearer: STUDIO_TOKEN,
        unreachable: 'The studio agent is unreachable. Is it running? (just dev in dfo-ai)',
        ...studioIdentity(route, req.headers, async () => (await session())?.id ?? null),
    } as const;

    if (req.method !== 'POST' || route !== 'turn') {
        return forward(req, options);
    }

    const spend = async () => {
        const user = await session();
        const prompter: Prompter = user ? { email: user.email } : { address: clientIp(req) };

        return spendPrompt(counterDb, prompter);
    };

    return meterTurn(spend, giveBack, (admit) => forward(req, { ...options, admit }));
};

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
