import 'server-only';

import type { NextRequest } from 'next/server';

import { limiterKeyFor, setCaller, trustedHops } from './caller';
import { clientResponseHeaders, pick, upstreamRequestHeaders } from './headers';
import { hit, rateHeaders, type Surface } from './rateLimit';

/**
 * The platform proxy: the DFO APIs and the MCP servers mirrored 1:1 under
 * the site's own domain, so one public host serves the browser and outside
 * callers alike (the engines ship no CORS headers, and the harness token
 * must not reach a client). An /api/* or /mcp call is rate-limited per IP
 * (src/lib/proxy/rateLimit, on only with REDIS_URL). A call is forwarded
 * with its method, query, body, content headers and every mcp-* header
 * (src/lib/proxy/headers), and the upstream's response streamed back
 * untouched: SSE (search resolve, studio turns, MCP) and file downloads both
 * depend on nothing being buffered here.
 *
 * Upstreams:
 *   /api/v1/search|datasets|graph/*  → SEARCH_API_BASE (dfo-apis, src/lib/searchApi)
 *   /api/v1/studio/*                 → STUDIO_API_BASE (dfo-ai), STUDIO_TOKEN
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
};

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

    const headers = upstreamRequestHeaders(req.headers);

    const callerAuth = req.headers.get('authorization');

    if (options.bearer) {
        headers.set('authorization', `Bearer ${options.bearer}`);
    } else if (callerAuth) {
        headers.set('authorization', callerAuth);
    }

    setCaller(headers, options.caller);

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let upstream: Response;

    try {
        upstream = await fetch(options.target, {
            method: req.method,
            headers,
            body: hasBody ? req.body : undefined,
            // A streamed request body needs this in Node's fetch.
            ...(hasBody ? { duplex: 'half' } : {}),
            cache: 'no-store',
            redirect: 'manual',
        } as RequestInit);
    } catch {
        return Response.json(
            {
                error: 'transient_unavailable',
                retry: 'retry_after_delay',
                detail: options.unreachable,
            },
            { status: 502, headers: limitHeaders },
        );
    }

    const out = clientResponseHeaders(
        upstream.headers,
        new Headers({ 'Cache-Control': 'no-cache', ...limitHeaders }),
    );

    return new Response(upstream.body, { status: upstream.status, headers: out });
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

    return new Response(upstream.body, { status: upstream.status, headers: out });
};
