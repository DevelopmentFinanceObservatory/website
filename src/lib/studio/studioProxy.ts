import 'server-only';

import type { NextRequest } from 'next/server';

import { counterDb } from '@/lib/db';
import { readBoundedText } from '@/lib/proxy/boundedBody';
import { limitHeaders as limitHeadersOf } from '@/lib/proxy/access';
import { clientIp, countAnonymous, forward, STUDIO_API_BASE } from '@/lib/proxy/forward';
import { STUDIO_HEADERS } from '@/lib/proxy/headers';
import { notFoundProblem, problem, requestInvalidProblem } from '@/lib/proxy/problem';
import { studioIdentity } from '@/lib/proxy/studioIdentity';
import {
    checkStudioOwner,
    maxStudioBodyBytes,
    OWNERSHIP_RETRY_SECONDS,
    readStudioCall,
    SIGN_IN_REQUIRED,
    studioAllow,
    type StudioCallRefusal,
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

const queryOf = (search: URLSearchParams): string => {
    const query = search.toString();

    return query ? `?${query}` : '';
};

const giveBack = (receipt: Parameters<typeof refundPrompt>[1]) =>
    refundPrompt(counterDb, receipt).catch((error) =>
        console.error('studio: a prompt was not given back', error),
    );

const notFoundWith = (detail: string, headers: Record<string, string>): Response =>
    problem({ status: 404, code: 'not_found', detail, retryable: false, headers });

const ownerProblem = (refusal: StudioOwnerRefusal, rate: Record<string, string>): Response => {
    switch (refusal) {
        case SIGN_IN_REQUIRED:
            return problem({
                status: 401,
                code: SIGN_IN_REQUIRED,
                detail: 'Sign in to the account that owns this conversation.',
                retryable: false,
                headers: rate,
            });
        case 'not_found':
            return notFoundWith('There is no such conversation.', rate);
        case 'unavailable':
            return problem({
                status: 503,
                code: 'transient_unavailable',
                detail: 'The conversation could not be checked. Try again shortly.',
                retryable: true,
                headers: { ...rate, 'Retry-After': String(OWNERSHIP_RETRY_SECONDS) },
            });
    }
};

// The proxy's own answer to a call it does not forward (readStudioCall), with
// the rate-limit headers of the call's count.
const callProblem = (
    route: string,
    refusal: StudioCallRefusal,
    rate: Record<string, string>,
): Response => {
    switch (refusal) {
        case 'options':
            return new Response(null, {
                status: 204,
                headers: { ...rate, Allow: studioAllow(route) },
            });
        case 'method_not_allowed':
            return problem({
                status: 405,
                code: 'method_not_allowed',
                detail: `The ${route} route takes ${studioAllow(route)}.`,
                retryable: false,
                headers: { ...rate, Allow: studioAllow(route) },
            });
        case 'too_large':
            return problem({
                status: 413,
                code: 'payload_too_large',
                detail: `The request body is over ${maxStudioBodyBytes(route)} bytes.`,
                retryable: false,
                headers: rate,
            });
        case 'malformed':
            return requestInvalidProblem(
                'A Studio call names its conversation once: in one conversation_id query ' +
                    'parameter, or in the conversation_id member of a JSON object body. ' +
                    'A query carries no session_id.',
                undefined,
                rate,
            );
    }
};

type StudioUser = { id: string; email: string };

/**
 * The handler of the studio-v1 harness proxy (`/api/studio/*` on dfo-ai,
 * mirrored under the site's domain; see src/lib/proxy/forward). Only the
 * routes the browser calls go through (studioRoute), each about a
 * conversation the caller may reach (src/lib/studio/studioAccess). The
 * harness gets the query and body the check read its conversation id from,
 * so both name one conversation. The proxy answers an OPTIONS call and a
 * method the route does not serve itself, and forwards neither. The
 * ownership check runs in forward()'s `admit` hook, after the rate limit, and on a turn around the prompt spend (checkStudioOwner). A
 * turn spends one prompt of the caller's daily allowance, and meterTurn
 * (src/lib/studio/spendPrompt) gives it back when the turn does not start.
 * Reading the state, reading a card's places and resuming a turn spend none.
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

        // Counted before the body is read, so a call the proxy answers itself
        // counts too: per visitor with a valid visitor token, else per
        // address, as an anonymous API call is, but off the daily
        // allowances. forward() takes this decision and counts nothing more.
        const counted = await countAnonymous(req, 'api', { daily: false });
        const limitHeaders = limitHeadersOf(counted);

        if (counted.refusal) {
            return counted.refusal;
        }

        let read: Awaited<ReturnType<typeof readStudioCall>>;

        try {
            read = await readStudioCall({
                route,
                method: req.method,
                search: req.nextUrl.searchParams,
                readBody: (maxBytes) => readBoundedText(req.body, maxBytes),
            });
        } catch (error) {
            // A client that dropped the connection mid-upload cannot be
            // retried by the proxy; any other read failure is the server's
            // and a retry may succeed.
            if (req.signal.aborted) {
                return requestInvalidProblem(
                    'The request body could not be read.',
                    undefined,
                    limitHeaders,
                );
            }

            console.error('studio: the request body was not read', error);

            return problem({
                status: 503,
                code: 'transient_unavailable',
                detail: 'The request body could not be read. Try again shortly.',
                retryable: true,
                headers: limitHeaders,
            });
        }

        if (read.call === null) {
            return callProblem(route, read.refusal, limitHeaders);
        }

        const { call } = read;

        const admitOwner = (spend?: () => Promise<Response | null>) =>
            checkStudioOwner({
                route,
                conversationId: call.conversationId,
                readUserId,
                ownersOf,
                claimOwner,
                spend,
                refuse: (refusal) => ownerProblem(refusal, limitHeaders),
            });

        const options = {
            counted,
            target: `${STUDIO_API_BASE}/api/studio/${route}${queryOf(call.search)}`,
            body: call.body ?? undefined,
            bearer: STUDIO_TOKEN,
            pass: STUDIO_HEADERS,
            unreachable: 'The studio agent is unreachable. Is it running? (just dev in dfo-ai)',
            admit: () => admitOwner(),
            ...studioIdentity(route, req.headers, readUserId),
        } as const;

        if (route !== 'turn') {
            return forward(req, options);
        }

        const spend = async () => {
            const user = await session();
            const prompter: Prompter = user ? { email: user.email } : { address: clientIp(req) };

            return spendPrompt(counterDb, prompter);
        };

        return meterTurn(spend, giveBack, (admitTurn) =>
            forward(req, { ...options, admit: () => admitOwner(admitTurn) }),
        );
    };
