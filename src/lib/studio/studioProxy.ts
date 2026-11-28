import 'server-only';

import type { NextRequest } from 'next/server';

import { counterDb } from '@/lib/db';
import { readBoundedText } from '@/lib/proxy/boundedBody';
import { limitHeaders as limitHeadersOf } from '@/lib/proxy/access';
import { clientIp, countAnonymous, forward, STUDIO_API_BASE } from '@/lib/proxy/forward';
import { STUDIO_HEADERS } from '@/lib/proxy/headers';
import type { CounterDb, Reservation } from '@/lib/proxy/limitCounter';
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
    claimHoldTurn,
    HOLD_TURN_HEADER,
    meterTurn,
    PROMPT_REFUNDED_HEADER,
    recordHoldTurn,
    refundHoldTurn,
    refundPrompt,
    spendPrompt,
    studioRoute,
    turnIndexOf,
    type HarnessTurn,
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

// The harness names each turn's index in this response header (STUDIO_HEADERS).
const TURN_INDEX_HEADER = 'x-dfo-turn-index';

// The turn a cancel body names, or null when it names no conversation or no
// turn index.
const cancelledTurn = (conversationId: string | null, body: string | null): HarnessTurn | null => {
    if (conversationId === null || body === null) {
        return null;
    }

    const parsed: unknown = JSON.parse(body);
    const turnIndex =
        parsed !== null && typeof parsed === 'object' && 'turn_index' in parsed
            ? turnIndexOf(parsed.turn_index)
            : null;

    return turnIndex === null ? null : { conversationId, turnIndex };
};

// `response` with the cancel answer's PROMPT_REFUNDED_HEADER set.
const withRefunded = (response: Response, refunded: boolean): Response => {
    const headers = new Headers(response.headers);

    headers.set(PROMPT_REFUNDED_HEADER, String(refunded));

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};

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
 * Reading the state and resuming a turn spend none.
 *
 * A turn sent with `x-dfo-hold-turn: 1` (HOLD_TURN_HEADER) is a hold turn:
 * once the harness admits it, the proxy records its receipt before it
 * returns the stream (recordHoldTurn). A cancel that names the turn takes
 * the receipt before it is forwarded, if the caller is the turn's prompter
 * and the refund deadline has not passed (claimHoldTurn), and gives the
 * prompt back once the harness answers it ok (refundHoldTurn). Every cancel
 * answer the proxy forwards carries `x-dfo-prompt-refunded` (true or false).
 *
 * `getUser` reads the signed-in user, `ownersOf` and `claimOwner` the
 * account a harness conversation belongs to (src/lib/chat/conversationStore),
 * and `counters` holds the prompt allowances.
 */
export const studioProxy =
    ({
        getUser,
        ownersOf,
        claimOwner,
        counters = counterDb,
    }: {
        getUser: () => Promise<StudioUser | null>;
        ownersOf: (conversationId: string) => Promise<(string | null)[]>;
        claimOwner: (conversationId: string, userId: string) => Promise<(string | null)[]>;
        counters?: CounterDb;
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

        const prompter = async (): Promise<Prompter> => {
            const user = await session();

            return user ? { email: user.email } : { address: clientIp(req) };
        };

        if (route === 'cancel') {
            return cancelWithRefund(counters, prompter, call, () => forward(req, options));
        }

        if (route !== 'turn') {
            return forward(req, options);
        }

        const giveBack = (receipt: Reservation) =>
            refundPrompt(counters, receipt).catch((error) =>
                console.error('studio: a prompt was not given back', error),
            );
        const { conversationId } = call;
        const started =
            req.headers.get(HOLD_TURN_HEADER) === '1' && conversationId !== null
                ? async (receipt: Reservation, response: Response) => {
                      const turnIndex = turnIndexOf(response.headers.get(TURN_INDEX_HEADER));

                      if (turnIndex !== null) {
                          await recordHoldTurn(counters, receipt, {
                              conversationId,
                              turnIndex,
                          }).catch((error) =>
                              console.error('studio: a hold turn was not made refundable', error),
                          );
                      }
                  }
                : undefined;

        return meterTurn(
            async () => spendPrompt(counters, await prompter()),
            giveBack,
            (admitTurn) => forward(req, { ...options, admit: () => admitOwner(admitTurn) }),
            { started },
        );
    };

// A cancel forwarded through `forward`, answered with PROMPT_REFUNDED_HEADER:
// the receipt of the hold turn it names is taken before the cancel goes, so
// the harness's answer time does not count against the deadline, and the
// prompt comes back only once the harness answers the cancel ok.
const cancelWithRefund = async (
    counters: CounterDb,
    prompter: () => Promise<Prompter>,
    call: { conversationId: string | null; body: string | null },
    forwardCancel: () => Promise<Response>,
): Promise<Response> => {
    const turn = cancelledTurn(call.conversationId, call.body);
    const paid = turn
        ? await prompter()
              .then((caller) => claimHoldTurn(counters, caller, turn))
              .catch((error) => {
                  console.error('studio: a hold turn receipt was not read', error);

                  return null;
              })
        : null;
    const response = await forwardCancel();
    const refunded =
        paid !== null && response.ok
            ? await refundHoldTurn(counters, paid).catch((error) => {
                  console.error('studio: a hold turn prompt was not given back', error);

                  return false;
              })
            : false;

    return withRefunded(response, refunded);
};
