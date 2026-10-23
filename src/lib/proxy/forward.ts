import 'server-only';

import type { NextRequest } from 'next/server';

import { apisFetch } from '@/lib/apisAuth';

import { limiterKeyFor, setCaller, trustedHops } from './caller';
import { relayBody } from './compress';
import { clientResponseHeaders, dropEncodedLength, pick, upstreamRequestHeaders } from './headers';
import { rateHeaders } from './rateHeaders';
import { hit, type Surface } from './rateLimit';

/**
 * The platform proxy: the DFO APIs and the MCP servers mirrored 1:1 under
 * the site's own domain, so one public host serves the browser and outside
 * callers alike (the engines ship no CORS headers, and the harness token
 * must not reach a client). An /api/*, /openapi.json or /mcp call, and a
 * /codes call the route forwards, is rate-limited per IP: /mcp on its own
 * allowance, the rest on 'api' (src/lib/proxy/rateLimit; the X-RateLimit-*
 * headers go out only on a counted call). A call is forwarded with its
 * method, query, body, content headers, user-agent and every mcp-* header
 * (src/lib/proxy/headers), and the upstream's response streamed back: SSE
 * (search resolve, studio turns, MCP) and file downloads both depend on
 * nothing being buffered here. A text, JSON, XML or CSV body of 1,024 bytes
 * or more is gzipped on the way for a client that accepts it
 * (src/lib/proxy/compress); an event stream and every /mcp response go back
 * as the upstream sent them.
 *
 * Upstreams:
 *   /api/v1/search|datasets|graph/*  → SEARCH_API_BASE (dfo-apis, src/lib/searchApi)
 *   /openapi.json, /codes/{code}     → SEARCH_API_BASE, the same paths; the
 *                                    document is cut to this host's paths
 *                                    (src/lib/proxy/openapi)
 *   /api/v1/studio/turn|interrupt|cancel|composition
 *                                    → STUDIO_API_BASE (dfo-ai), STUDIO_TOKEN
 *
 * A call to SEARCH_API_BASE carries the site's ID token on Cloud Run
 * (src/lib/apisAuth matches on the target's origin). The other upstreams get
 * none.
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

type ForwardOptions = {
    // Which allowance applies (see rateLimit's LIMITS); unset, no limit.
    surface?: Surface;
    // The upstream URL to hit (path + query already resolved).
    target: string;
    // A bearer the proxy attaches on the caller's behalf; when unset, the
    // caller's own Authorization header goes through instead.
    bearer?: string;
    // The x-dfo-caller value to send (src/lib/proxy/caller). Any value the
    // client sent is dropped either way.
    caller?: string;
    // What to answer when the upstream is unreachable.
    unreachable: string;
    // False sends every body back unencoded, whatever its type.
    compress?: boolean;
    // Runs after the rate limit and before the upstream call; a Response it
    // returns is the answer instead (the Studio's prompt allowance).
    admit?: () => Promise<Response | null>;
    // Reshapes the upstream response before it is relayed (/openapi.json's
    // public document). A throw, such as a body that fails while it is read,
    // answers as an unreachable upstream.
    rewrite?: (upstream: Response) => Promise<Response>;
};

const unreachable = (detail: string, headers: Record<string, string>): Response =>
    Response.json(
        { error: 'transient_unavailable', retry: 'retry_after_delay', detail },
        { status: 502, headers },
    );

export const forward = async (req: NextRequest, options: ForwardOptions): Promise<Response> => {
    const verdict = options.surface ? await hit(options.surface, clientIp(req)) : undefined;
    const limitHeaders = verdict ? rateHeaders(verdict) : {};

    if (verdict && !verdict.allowed) {
        return Response.json(
            {
                error: 'rate_limited',
                retry: 'retry_after_delay',
                detail: `Too many requests — ${verdict.limit} per window per address. Try again in ${verdict.reset}s.`,
            },
            {
                status: 429,
                headers: { ...limitHeaders, 'Retry-After': String(verdict.reset) },
            },
        );
    }

    const refusal = await options.admit?.();

    if (refusal) {
        return refusal;
    }

    const headers = upstreamRequestHeaders(req.headers);

    const callerAuth = req.headers.get('authorization');

    if (options.bearer) {
        headers.set('authorization', `Bearer ${options.bearer}`);
    } else if (callerAuth) {
        headers.set('authorization', callerAuth);
    }

    setCaller(headers, options.caller);

    const earlyFailure = (error: unknown): Response => {
        // A client that left aborted the read itself, so no one is answered.
        if (!req.signal.aborted) {
            console.error(
                `relay failed before the first byte: ${new URL(options.target).pathname}`,
                error,
            );
        }

        return unreachable(options.unreachable, limitHeaders);
    };

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
        return unreachable(options.unreachable, limitHeaders);
    }

    if (options.rewrite) {
        try {
            upstream = await options.rewrite(upstream);
        } catch (error) {
            return earlyFailure(error);
        }
    }

    const out = clientResponseHeaders(
        upstream.headers,
        new Headers({ 'Cache-Control': 'no-cache', ...limitHeaders }),
    );

    return relayBody({
        accept: req.headers.get('accept-encoding'),
        upstream,
        headers: out,
        compress: options.compress,
        onEarlyFailure: earlyFailure,
    });
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
 * public upstream too. Gives up after ASSET_TIMEOUT_MS with a 502.
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

        return new Response(null, { status: 502 });
    }

    const out = new Headers();

    pick(upstream.headers, ASSET_RESPONSE_HEADERS, out);
    dropEncodedLength(upstream.headers, out);

    return new Response(upstream.body, { status: upstream.status, headers: out });
};
