import 'server-only';

import type { NextRequest } from 'next/server';

import { counterDb } from '@/lib/db';
import { readBoundedText } from '@/lib/proxy/boundedBody';
import { clientIp, forward, STUDIO_API_BASE } from '@/lib/proxy/forward';
import { STUDIO_HEADERS } from '@/lib/proxy/headers';
import {
    missingProblem,
    notFoundProblem,
    problem,
    requestInvalidProblem,
} from '@/lib/proxy/problem';
import { studioIdentity } from '@/lib/proxy/studioIdentity';
import {
    checkStudioOwner,
    MAX_STUDIO_BODY_BYTES,
    OWNERSHIP_RETRY_SECONDS,
    readStudioCall,
    SIGN_IN_REQUIRED,
    type StudioOwnerRefusal,
} from '@/lib/studio/studioAccess';
import {
    meterTurn,
    refundPrompt,
    spendPrompt,
    studioRoute,
    type Prompter,
} from '@/lib/studio/spendPrompt';

// The harness wants `Authorization: Bearer` on every call; the proxy attaches
// the token, so it never reaches a client. Any non-empty token satisfies the
// local server.
const STUDIO_TOKEN = process.env.STUDIO_TOKEN ?? 'dev';

// The session's user, read once per request on first use. The ownership
// check, a turn's prompt spend and its x-dfo-account share one read, and a
// call refused before them reads none.
const sessionOnce = <U>(getUser: () => Promise<U>) => {
    let user: Promise<U> | undefined;

    return () => (user ??= getUser());
};

const queryOf = (search: URLSearchParams | undefined): string => {
    const query = search?.toString();

    return query ? `?${query}` : '';
};

const giveBack = (receipt: Parameters<typeof refundPrompt>[1]) =>
    refundPrompt(counterDb, receipt).catch((error) =>
        console.error('studio: a prompt was not given back', error),
    );

const ownerProblem = (refusal: StudioOwnerRefusal): Response => {
    switch (refusal) {
        case SIGN_IN_REQUIRED:
            return problem({
                status: 401,
                code: SIGN_IN_REQUIRED,
                detail: 'Sign in to the account that owns this conversation.',
                retryable: false,
            });
        case 'not_found':
            return missingProblem('There is no such conversation.');
        case 'unavailable':
            return problem({
                status: 503,
                code: 'transient_unavailable',
                detail: 'The conversation could not be checked. Try again shortly.',
                retryable: true,
                headers: { 'Retry-After': String(OWNERSHIP_RETRY_SECONDS) },
            });
    }
};

type StudioUser = { id: string; email: string };

/**
 * The handler of the studio-v1 harness proxy (`/api/studio/*` on dfo-ai,
 * mirrored under the site's domain; see src/lib/proxy/forward). Only the
 * routes the browser calls go through (studioRoute), each about a
 * conversation the caller may reach (src/lib/studio/studioAccess). The
 * harness gets the query and body the check read its conversation id from,
 * so both name one conversation. The ownership check runs in forward()'s
 * `admit` hook, after the per-address rate limit, and on a turn before the
 * prompt spend. A turn spends one prompt of the caller's daily allowance,
 * and meterTurn (src/lib/studio/spendPrompt) gives it back when the turn does
 * not start. Reading the state and resuming a turn spend none.
 *
 * `getUser` reads the signed-in user, `ownersOf` and `claimOwner` the
 * account a harness conversation belongs to (src/lib/chat/conversationStore).
 */
export const studioProxy =
    ({
        getUser,
        ownersOf,
        claimOwner,
    }: {
        getUser: () => Promise<StudioUser | null>;
        ownersOf: (conversationId: string) => Promise<(string | null)[]>;
        claimOwner: (conversationId: string, userId: string) => Promise<(string | null)[]>;
    }) =>
    async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
        const route = studioRoute((await params).path);

        if (!route) {
            return notFoundProblem(req.nextUrl.pathname);
        }

        const session = sessionOnce(getUser);
        const readUserId = async () => (await session())?.id ?? null;

        const { refusal, call } = await readStudioCall({
            method: req.method,
            search: req.nextUrl.searchParams,
            readBody: () => readBoundedText(req.body, MAX_STUDIO_BODY_BYTES),
        });

        if (refusal === 'too_large') {
            return problem({
                status: 413,
                code: 'payload_too_large',
                detail: `The request body is over ${MAX_STUDIO_BODY_BYTES} bytes.`,
                retryable: false,
            });
        }

        if (refusal === 'malformed') {
            return requestInvalidProblem(
                'A Studio call names its conversation once: in one conversation_id query ' +
                    'parameter, or in the conversation_id member of a JSON object body. ' +
                    'A query carries no session_id.',
            );
        }

        // An OPTIONS call (`call` null) names no conversation and is not checked.
        const admitOwner = async (): Promise<Response | null> => {
            if (!call) {
                return null;
            }

            const ownerRefusal = await checkStudioOwner({
                route,
                conversationId: call.conversationId,
                readUserId,
                ownersOf,
                claimOwner,
            });

            return ownerRefusal ? ownerProblem(ownerRefusal) : null;
        };

        const options = {
            surface: 'api',
            target: `${STUDIO_API_BASE}/api/studio/${route}${queryOf(call?.search)}`,
            body: call?.body ?? undefined,
            bearer: STUDIO_TOKEN,
            pass: STUDIO_HEADERS,
            unreachable: 'The studio agent is unreachable. Is it running? (just dev in dfo-ai)',
            admit: admitOwner,
            ...studioIdentity(route, req.headers, readUserId),
        } as const;

        if (req.method !== 'POST' || route !== 'turn') {
            return forward(req, options);
        }

        const spend = async () => {
            const user = await session();
            const prompter: Prompter = user ? { email: user.email } : { address: clientIp(req) };

            return spendPrompt(counterDb, prompter);
        };

        return meterTurn(spend, giveBack, (admitTurn) =>
            forward(req, {
                ...options,
                admit: async () => (await admitOwner()) ?? admitTurn(),
            }),
        );
    };
