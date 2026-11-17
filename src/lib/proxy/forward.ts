import 'server-only';

import type { NextRequest } from 'next/server';

import { apisFetch } from '@/lib/apisAuth';
import { keyDb } from '@/lib/db';

import { hasValidTag, tagSecrets } from '@/lib/auth/keyTag';

import { decideAccess, type Access, type AccessDeps } from './access';
import { API_KEY_HEADER, bearerKey } from './apiKey';
import {
    accountCaller,
    limiterKeyFor,
    requestCaller,
    setApisCaller,
    setCaller,
    trustedHops,
} from './caller';
import {
    clientResponseHeaders,
    dropEncodedLength,
    pick,
    upstreamRequestHeaders,
    type HeaderPass,
} from './headers';
import { createKeyVerifier } from './keyVerifier';
import { unreachableProblem } from './problem';
import { rateHeaders } from './rateHeaders';
import { hit, hitKey, KEYED_LIMIT, type Surface } from './rateLimit';

/**
 * The platform proxy: the DFO APIs and the MCP servers mirrored 1:1 under
 * the site's own domain, so one public host serves the browser and outside
 * callers alike (the engines ship no CORS headers, and the harness token
 * must not reach a client). An /api/*, /openapi.json or /mcp call, and a
 * /codes call the route forwards, is rate-limited per IP: /mcp on its own
 * allowance, the rest on 'api' (src/lib/proxy/rateLimit; the X-RateLimit-*
 * headers go out only on a counted call). A call may carry an API key,
 * `Authorization: Bearer dfo_…` or `X-API-Key` (src/lib/proxy/apiKey), and is
 * then counted against the key's account at the account's limit, or refused
 * with a 401 when the key is not valid (src/lib/proxy/access). The key is
 * never forwarded, on any route, and the Studio ignores it. A call is forwarded with its
 * method, query, body, content headers, user-agent, x-dfo-client and every
 * mcp-* header (src/lib/proxy/headers), and the upstream's response streamed back: SSE
 * (search resolve, studio turns, MCP) and file downloads both depend on
 * nothing being buffered here. Every body goes back unencoded, as fetch
 * decoded it. Next drops the Content-Encoding and Content-Length of a route
 * handler's Response and does not compress one, so compression for clients
 * comes from Cloudflare in front of production.
 *
 * The first chunk of a body is read before the response goes out, so a body
 * that fails before its first byte is answered with a logged 502 problem
 * document. A body that fails after that reaches the client as the upstream's
 * status with a body that ends in an error. An event stream goes out unread,
 * so a failure there always takes the second form.
 *
 * Upstreams:
 *   /api/v1/search|datasets|graph/*, /api/v1/presentation/components|shares/*
 *                                    → SEARCH_API_BASE (dfo-apis, src/lib/searchApi)
 *   /openapi.json, /codes/{code}     → SEARCH_API_BASE, the same paths; the
 *                                    document is cut to this host's paths
 *                                    (src/lib/proxy/openapi)
 *   /api/v1/studio/turn|interrupt|cancel|composition
 *                                    → STUDIO_API_BASE (dfo-ai), STUDIO_TOKEN
 *
 * A call to SEARCH_API_BASE carries the site's ID token on Cloud Run
 * (src/lib/apisAuth matches on the target's origin), and names the caller in
 * x-dfo-caller beside the x-dfo-caller-principal secret (setApisCaller in
 * src/lib/proxy/caller), matched on the same origin. The caller is `ip:` and
 * a digest of the address, or `user:` and a digest of the account for a call
 * with a valid key. The other upstreams get neither, bar /mcp's caller.
 *
 * The unversioned /api/search|datasets|graph|studio/* paths rewrite onto the
 * same handlers (next.config.ts), so both addresses answer alike.
 *   /mcp, /mcp/*                   → STUDIO_API_BASE/mcp/ (dfo-ai's combined
 *                                    MCP server), MCP_API_TOKEN, x-dfo-caller
 *   /mcp/presentation/theme-*.css  → STUDIO_API_BASE, no token (forwardAsset)
 *
 * The public MCP URL is `/mcp`. Next redirects `/mcp/` to `/mcp` with a 308,
 * which keeps the method and body, so a client that follows redirects works
 * with either form.
 */
export const STUDIO_API_BASE = process.env.STUDIO_API_BASE ?? 'http://localhost:8080';

// The caller, for the limit: see limiterKeyFor in caller.ts.
const limiterKey = limiterKeyFor(trustedHops(process.env));

export const clientIp = (req: NextRequest): string =>
    limiterKey(req.headers.get('x-forwarded-for'));

// The tag secrets, read per call so a test can set them. Unset, no key is
// accepted: src/instrumentation.ts refuses to start in production without
// them, and in dev every key is a 401.
const keyTagValid = (key: string): boolean => {
    let secrets: string[];

    try {
        secrets = tagSecrets();
    } catch {
        return false;
    }

    return hasValidTag(key, secrets);
};

// The accounts' counts and key lookups, as forward() reaches them. A test
// swaps a field for a fake.
export const accessDeps: AccessDeps = {
    verifier: createKeyVerifier(keyDb),
    tagValid: keyTagValid,
    hitAddress: hit,
    hitAccount: (surface, accountId, limit) => hitKey(surface, `acct:${accountId}`, limit),
    defaultLimit: KEYED_LIMIT,
};

// API_KEYS_ENABLED is the emergency switch: set to `false` (or `0`, `off`,
// `no`), keys are stripped and every call is treated as anonymous. Read per
// call, so a test can flip it.
export const keysEnabled = (): boolean =>
    !['false', '0', 'off', 'no'].includes(process.env.API_KEYS_ENABLED?.trim().toLowerCase() ?? '');

// One structured line per call that carried a key. The key's public id and
// the account are named; the key and its hash never are.
const logKeyUse = (surface: Surface | undefined, { identity, outcome }: Access): void => {
    if (!outcome) {
        return;
    }

    console.log(
        JSON.stringify({
            severity: 'INFO',
            message: 'api key call',
            surface: surface ?? null,
            outcome,
            keyId: identity.kind === 'keyed' ? identity.keyId : null,
            accountId: identity.kind === 'keyed' ? identity.accountId : null,
        }),
    );
};

type ForwardOptions = {
    // Which allowance applies (see rateLimit's LIMITS); unset, no limit.
    surface?: Surface;
    // Whether an API key on the call counts. False (the Studio): the key is
    // stripped and otherwise ignored. Default true, on a limited surface.
    keys?: boolean;
    // The upstream URL to hit (path + query already resolved).
    target: string;
    // A bearer the proxy attaches on the caller's behalf; when unset, the
    // caller's own Authorization header goes through instead.
    bearer?: string;
    // Whether to name the caller in x-dfo-caller to an upstream other than
    // dfo-apis (/mcp), which is resolved as for dfo-apis, which always gets
    // its own (src/lib/proxy/caller). Any value the client sent is dropped
    // either way.
    sendCaller?: boolean;
    // Headers carried beyond the defaults (src/lib/proxy/headers).
    pass?: HeaderPass;
    // What to answer when the upstream is unreachable.
    unreachable: string;
    // Runs after the rate limit and before the upstream call; a Response it
    // returns is the answer instead (the Studio's prompt allowance).
    admit?: () => Promise<Response | null>;
    // Reshapes the upstream response before it is relayed (/openapi.json's
    // public document). A throw, such as a body that fails while it is read,
    // answers as an unreachable upstream.
    rewrite?: (upstream: Response) => Promise<Response>;
};

// Whether `target` is on dfo-apis, read from SEARCH_API_BASE at call time as
// src/lib/apisAuth reads it.
const isApisTarget = (target: string): boolean => {
    const base = process.env.SEARCH_API_BASE?.trim();

    return (
        base !== undefined && URL.canParse(base) && new URL(target).origin === new URL(base).origin
    );
};

const isEventStream = (headers: Headers): boolean =>
    /^text\/event-stream\s*(?:;|$)/i.test(headers.get('content-type') ?? '');

// Reads the first chunk of `body`, rejecting if the upstream fails first, and
// returns a stream that yields that chunk and then pulls the rest as the
// client reads, so nothing more is buffered.
const peeked = async (body: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> => {
    const reader = body.getReader();
    const first = await reader.read();

    return new ReadableStream<Uint8Array>({
        start(controller) {
            if (first.done) {
                controller.close();
            } else {
                controller.enqueue(first.value);
            }
        },
        async pull(controller) {
            const { done, value } = await reader.read();

            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
        cancel: (reason) => reader.cancel(reason),
    });
};

export const forward = async (req: NextRequest, options: ForwardOptions): Promise<Response> => {
    // Who the caller is and whether it is within its allowance, decided once.
    const access = await decideAccess(accessDeps, {
        surface: options.surface,
        keys: options.keys !== false && keysEnabled(),
        headers: req.headers,
        ip: clientIp(req),
    });

    logKeyUse(options.surface, access);

    if (access.refusal) {
        return access.refusal;
    }

    const limitHeaders = access.verdict ? rateHeaders(access.verdict) : {};

    const refusal = await options.admit?.();

    if (refusal) {
        return refusal;
    }

    const headers = upstreamRequestHeaders(req.headers, new Headers(), options.pass?.request);

    const callerAuth = req.headers.get('authorization');

    if (options.bearer) {
        headers.set('authorization', `Bearer ${options.bearer}`);
    } else if (callerAuth && bearerKey(callerAuth) === undefined) {
        // Any bearer but one of our keys passes through as it always did.
        // A key is the proxy's own and goes no further, verified or not.
        headers.set('authorization', callerAuth);
    }

    headers.delete(API_KEY_HEADER);

    const accountName =
        access.identity.kind === 'keyed' ? accountCaller(access.identity.accountId) : undefined;

    if (isApisTarget(options.target)) {
        setApisCaller(headers, req.headers, accountName);
    } else {
        setCaller(
            headers,
            options.sendCaller ? (accountName ?? requestCaller(req.headers)) : undefined,
        );
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let upstream: Response;

    try {
        upstream = await apisFetch(options.target, {
            method: req.method,
            headers,
            body: hasBody ? req.body : undefined,
            // A streamed request body needs this in Node's fetch.
            ...(hasBody ? { duplex: 'half' } : {}),
            cache: 'no-store',
            redirect: 'manual',
            // A client that leaves takes the upstream call with it, a body
            // that has gone quiet included.
            signal: req.signal,
        } as RequestInit);
    } catch {
        // No response, so the upstream is taken not to have received the
        // call: a connection reset after the body went out reads the same.
        return unreachableProblem(options.unreachable, limitHeaders);
    }

    // The upstream answered `status`, so it received the call, and the
    // problem document says so (upstream_status).
    const earlyFailure = (error: unknown, status: number): Response => {
        // A client that left aborted the read itself, so no one is answered.
        if (!req.signal.aborted) {
            console.error(
                `relay failed before the first byte: ${new URL(options.target).pathname}`,
                error,
            );
        }

        return unreachableProblem(options.unreachable, limitHeaders, status);
    };

    if (options.rewrite) {
        const { status } = upstream;

        try {
            upstream = await options.rewrite(upstream);
        } catch (error) {
            return earlyFailure(error, status);
        }
    }

    const out = clientResponseHeaders(
        upstream.headers,
        new Headers({ 'Cache-Control': 'no-cache', ...limitHeaders }),
        options.pass?.response,
    );

    let body: ReadableStream<Uint8Array> | null = upstream.body;

    if (body && !isEventStream(upstream.headers)) {
        try {
            body = await peeked(body);
        } catch (error) {
            return earlyFailure(error, upstream.status);
        }
    }

    return new Response(body, { status: upstream.status, headers: out });
};

// A static asset's request and response headers: conditional requests out,
// type and caching back, so the browser's cache works through the proxy.
const ASSET_REQUEST_HEADERS = ['accept', 'if-none-match', 'if-modified-since'];
const ASSET_TIMEOUT_MS = 10_000;
const ASSET_RESPONSE_HEADERS = [
    'content-type',
    'content-length',
    'cache-control',
    'etag',
    'last-modified',
    'access-control-allow-origin',
];

/**
 * GET a public static asset from `target` and return it with its own type
 * and cache headers. No token, no caller and no limit, since the asset is
 * public upstream too. Gives up after ASSET_TIMEOUT_MS with a 502 problem
 * document.
 */
export const forwardAsset = async (req: NextRequest, target: string): Promise<Response> => {
    const headers = new Headers();

    pick(req.headers, ASSET_REQUEST_HEADERS, headers);

    let upstream: Response;

    try {
        upstream = await fetch(target, {
            headers,
            cache: 'no-store',
            redirect: 'manual',
            signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
        });
    } catch (error) {
        console.error(`asset fetch failed: ${new URL(target).pathname}`, error);

        return unreachableProblem('The upstream asset is unreachable.', {});
    }

    const out = new Headers();

    pick(upstream.headers, ASSET_RESPONSE_HEADERS, out);
    dropEncodedLength(upstream.headers, out);

    return new Response(upstream.body, { status: upstream.status, headers: out });
};
