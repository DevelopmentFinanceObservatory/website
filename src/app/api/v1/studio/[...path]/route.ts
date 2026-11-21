import { NextRequest } from 'next/server';

import { getUser } from '@/lib/auth/session';
import { conversationOwners } from '@/lib/chat/conversationStore';
import { counterDb } from '@/lib/db';
import { readBoundedText } from '@/lib/proxy/boundedBody';
import { clientIp, forward, STUDIO_API_BASE } from '@/lib/proxy/forward';
import { missingProblem, notFoundProblem, problem } from '@/lib/proxy/problem';
import { studioIdentity } from '@/lib/proxy/studioIdentity';
import { MAX_STUDIO_BODY_BYTES, studioAccessRefusal } from '@/lib/studio/studioAccess';
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

// Only the routes the browser calls go through (studioRoute), each about a
// conversation the caller may reach (studioAccessRefusal). A turn spends one
// prompt of the caller's daily allowance, and meterTurn
// (src/lib/studio/spendPrompt) gives it back when the turn does not start.
// Reading the state and resuming a turn spend none.
const proxy = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
    const route = studioRoute((await params).path);

    if (!route) {
        return notFoundProblem(req.nextUrl.pathname);
    }

    const session = sessionOnce();

    // A conversation an account saved answers only to that account
    // (src/lib/studio/studioAccess). The body is read from a copy, so the
    // request still streams to the harness.
    const refusal = await studioAccessRefusal({
        route,
        method: req.method,
        search: req.nextUrl.searchParams,
        readBody: () => readBoundedText(req.clone().body, MAX_STUDIO_BODY_BYTES),
        readUserId: async () => (await session())?.id ?? null,
        ownersOf: conversationOwners,
    });

    if (refusal === 'too_large') {
        return problem({
            status: 413,
            code: 'payload_too_large',
            detail: `The request body is over ${MAX_STUDIO_BODY_BYTES} bytes.`,
            retryable: false,
        });
    }

    if (refusal === 'not_found') {
        return missingProblem('There is no such conversation.');
    }

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
