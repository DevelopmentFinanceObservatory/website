import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { IncomingMessage, ServerResponse } from 'node:http';

import { isBotAgent, requestAgent, type Agent } from '../bot.ts';
import { LIMIT_TIER_HEADER, type LimitTier } from './access.ts';
import { accountFor } from './account.ts';
import { requestCaller } from './caller.ts';

/**
 * One JSON line on stdout per visitor request, written when its response
 * closes, so Cloud Logging can count visitors by caller. Cloud Run's own
 * request log records Cloudflare's edge address, so it cannot. Node emits
 * `close` after `finish`, so a response that ends normally writes its line
 * there with `finished` true. A response that closes before it finishes, such
 * as an abandoned page render or an `/mcp` event stream the client closes,
 * writes it with `finished` false. Its `status` is the one already sent, or
 * 499 (client closed request) when the app sent no status before the
 * connection closed.
 *
 * `path` is the request target as it arrived at `http.server.request.start`,
 * without its query string, with dot segments resolved, or `/:unparsable` for
 * a target that is not origin-form, `*`, or an http or https URL that
 * parses. `caller` is the
 * same `ip:<digest>` the /mcp proxy sends as x-dfo-caller (see caller.ts).
 * `bot` is true when the User-Agent header is missing, empty or one isbot
 * flags. `agent` and `agent_name` say what sent the request (requestAgent in
 * src/lib/bot.ts). `prerender` is true for a document request with `Sec-Purpose:
 * prefetch;prerender`, so its kind is `page` whether or not the visitor opens
 * the page, since the server cannot see activation. `tier` is whose count a
 * rate-limited call spent, `key`, `visitor` or `address`, read from the
 * response's x-dfo-limit-tier header (src/lib/proxy/access), and null for a
 * call nothing counted. The line holds no raw address, query string, cookie,
 * visitor id, auth header or user agent. A signed-in
 * user's request names no account here; see AccountLogEntry.
 */
export type RequestKind = 'page' | 'api' | 'rsc' | 'prefetch';

export type RequestLogEntry = {
    severity: 'INFO';
    message: 'request';
    caller: string | null;
    method: string;
    path: string;
    host: string | null;
    kind: RequestKind;
    status: number;
    finished: boolean;
    bot: boolean;
    agent: Agent;
    agent_name: string | null;
    prerender: boolean;
    tier: LimitTier | null;
};

type ResponseMetadata = { status: number; finished: boolean; tier?: LimitTier | null };

type RequestMetadata = { path: string; method: string; headers: Headers };

// Framework files and images and fonts by extension.
const STATIC_ASSET = /^\/_next\/|\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

// The machine-facing paths: the site's own /api endpoints and the platform
// proxy's routes (src/lib/proxy/forward), /api/v1/*, /mcp, /openapi.json and
// /codes/*. Each entry matches itself and everything below it.
const API_PATHS = ['/api', '/mcp', '/openapi.json', '/codes'];

const isApiPath = (path: string): boolean =>
    API_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const isMcpPath = (path: string): boolean => path === '/mcp' || path.startsWith('/mcp/');

/** True for a static asset, which is not logged. */
export const isStaticAsset = (path: string): boolean => STATIC_ASSET.test(path);

/** The tokens of a `Sec-Purpose` or `Purpose` header, such as `prefetch;prerender`. */
const purposeOf = (headers: Headers): string[] =>
    (headers.get('sec-purpose') ?? headers.get('purpose'))
        ?.split(';')
        .map((token) => token.trim().toLowerCase()) ?? [];

/**
 * What a request is, and whether it is a prerender. `headers` are the
 * request's raw headers, which keep the RSC and prefetch headers Next.js
 * removes from `request.headers`. An RSC fetch or router prefetch keeps its
 * kind whatever `Sec-Purpose` says, and is not a prerender. A document request
 * that prerenders is a page, because infra's `website_requests_daily` counts a
 * kind outside the four as unparsed.
 */
const classifyRequest = (
    path: string,
    headers: Headers,
): { kind: RequestKind; prerender: boolean } => {
    if (isApiPath(path)) {
        return { kind: 'api', prerender: false };
    }

    if (headers.has('next-router-prefetch')) {
        return { kind: 'prefetch', prerender: false };
    }

    if (headers.get('rsc') === '1') {
        return { kind: 'rsc', prerender: false };
    }

    const purpose = purposeOf(headers);
    const prerender = purpose.includes('prerender');

    return { kind: prerender || !purpose.includes('prefetch') ? 'page' : 'prefetch', prerender };
};

/** The log entry for a logged request. */
export const requestLogEntry = (
    { path, method, headers }: RequestMetadata,
    caller: string | undefined,
    { status, finished, tier = null }: ResponseMetadata,
): RequestLogEntry => {
    const { kind, prerender } = classifyRequest(path, headers);
    const { agent, agentName } = requestAgent(headers, { mcp: isMcpPath(path) });

    return {
        severity: 'INFO',
        message: 'request',
        caller: caller ?? null,
        method,
        path,
        host: headers.get('host'),
        kind,
        status,
        finished,
        bot: isBotAgent(headers.get('user-agent')),
        agent,
        agent_name: agentName,
        prerender,
        tier,
    };
};

const LIMIT_TIERS: ReadonlySet<string> = new Set<LimitTier>(['key', 'visitor', 'address']);

const isLimitTier = (value: unknown): value is LimitTier =>
    typeof value === 'string' && LIMIT_TIERS.has(value);

/**
 * The LimitTier a response's x-dfo-limit-tier header names, or null. Next
 * copies a route handler's headers with NodeNextResponse.appendHeader, which
 * stores each as an array, so a header holding exactly one tier counts.
 */
const tierOf = (response: ServerResponse): LimitTier | null => {
    const values = [response.getHeader(LIMIT_TIER_HEADER)].flat();

    return values.length === 1 && isLimitTier(values[0]) ? values[0] : null;
};

// The path of each logged request's target as it arrived, kept because
// Next.js can rewrite `request.url` before the response ends.
const arrivedPaths = new WeakMap<IncomingMessage, string>();

// Client closed request, the status for a response whose app sent no status
// before the connection closed.
const CLIENT_CLOSED_REQUEST = 499;

/**
 * The path a target is logged as when it is neither origin-form, an http or
 * https absolute-form target that parses, nor `*`, since a target of any
 * other form or scheme can hold userinfo or an IP address.
 */
const UNPARSABLE_TARGET_PATH = '/:unparsable';

const HTTP_ABSOLUTE_FORM = /^https?:\/\//i;

/**
 * The path of a request target. An origin-form target (one starting with
 * `/`) resolves against a placeholder host, which reads `//mcp` as the path
 * `//mcp` and resolves dot segments, and is cut at its first `?` or `#`
 * if its URL does not parse. An http or https absolute-form target keeps
 * its own pathname. The asterisk-form target of `OPTIONS *` is its own
 * path. Every other target is UNPARSABLE_TARGET_PATH, so the request still
 * writes a line.
 */
const targetPath = (target: string): string => {
    if (target === '*') {
        return target;
    }

    if (target.startsWith('/')) {
        try {
            return new URL(`http://localhost${target}`).pathname;
        } catch {
            return target.split(/[?#]/, 1)[0] ?? target;
        }
    }

    if (!HTTP_ABSOLUTE_FORM.test(target)) {
        return UNPARSABLE_TARGET_PATH;
    }

    try {
        return new URL(target).pathname;
    } catch {
        return UNPARSABLE_TARGET_PATH;
    }
};

const requestHeaders = (request: IncomingMessage): Headers => {
    const headers = new Headers();

    // Keep the original headers even when Next.js has already handled the request.
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index];
        const value = request.rawHeaders[index + 1];

        if (name === undefined) {
            continue;
        }

        if (value !== undefined) {
            headers.append(name, value);
        }
    }

    return headers;
};

/**
 * Write the request's log line. A static asset is dropped before its headers
 * are read or its caller digest computed. Never throws: a logging fault must
 * not fail the request.
 */
export const logRequest = (request: IncomingMessage, response: ResponseMetadata): void => {
    try {
        const path = arrivedPaths.get(request) ?? targetPath(request.url ?? '/');

        if (isStaticAsset(path)) {
            return;
        }

        const headers = requestHeaders(request);
        const entry = requestLogEntry(
            { path, method: request.method ?? 'GET', headers },
            requestCaller(headers),
            response,
        );

        console.log(JSON.stringify(entry));
    } catch {
        // Header errors can include raw request data.
        console.error('request log failed');
    }
};

/**
 * One JSON line on stdout for a search resolve (POST /api/v1/search/resolve,
 * or its /api/search/resolve alias) or a chart share creation (POST
 * /api/share) made by a signed-in user, written by the route handler after
 * its response. It ties the request line's `caller` to an account, since the
 * close hook that writes the request line cannot see the session.
 *
 * `caller` is the request line's `ip:<digest>` (requestCaller), null when it
 * cannot be resolved. `user_hash` is exportDigest of the user id under
 * EXPORT_ID_HMAC_KEY (accountFor in account.ts), the event and account
 * exports' `user_hash`. `path` is the handler's path, `/api/v1/search/resolve`
 * or `/api/share`, whichever alias the request arrived at. A guest, an unset
 * key or a session read that fails writes no line. The line holds no raw
 * user id, email, address, cookie or token.
 */
export type AccountLogEntry = {
    severity: 'INFO';
    message: 'account';
    caller: string | null;
    user_hash: string;
    path: AccountPath;
};

export type AccountPath = '/api/v1/search/resolve' | '/api/share';

// Built once, so an unset EXPORT_ID_HMAC_KEY logs its warning once per process.
const defaultAccountOf = accountFor(process.env, () =>
    console.warn('EXPORT_ID_HMAC_KEY is unset; request logs carry no account line'),
);

/**
 * Write the account line for a request (see AccountLogEntry). `readUserId`
 * reads the signed-in user's id, null for a guest. Never throws: a logging
 * fault, or a session read that rejects, must not fail the request.
 */
export const logAccount = async (
    incoming: Headers,
    path: AccountPath,
    readUserId: () => Promise<string | null>,
    accountOf: (userId: string | null) => string | undefined = defaultAccountOf,
): Promise<void> => {
    try {
        const userHash = accountOf(await readUserId());

        if (!userHash) {
            return;
        }

        const entry: AccountLogEntry = {
            severity: 'INFO',
            message: 'account',
            caller: requestCaller(incoming) ?? null,
            user_hash: userHash,
            path,
        };

        console.log(JSON.stringify(entry));
    } catch {
        // A session read error can carry the cookie it read.
        console.error('account log failed');
    }
};

const REQUEST_START = 'http.server.request.start';
const RESPONSE_FINISH = 'http.server.response.finish';

// Share the subscribers across Next dev reloads.
const globalForRequestLog = globalThis as typeof globalThis & {
    dfoRequestLogSubscribers?: {
        start: (message: unknown) => void;
        finish: (message: unknown) => void;
    };
};

const httpPair = (
    message: unknown,
): { request: IncomingMessage; response: ServerResponse } | undefined =>
    typeof message === 'object' &&
    message !== null &&
    'request' in message &&
    message.request instanceof IncomingMessage &&
    'response' in message &&
    message.response instanceof ServerResponse
        ? { request: message.request, response: message.response }
        : undefined;

// The close listener logs every request that arrived after registration,
// apart from a static asset, which gets no listener and no entry.
// ServerResponse emits `close` after `finish`, so one listener covers a
// response that ends and one that does not.
const onRequestStart = (message: unknown): void => {
    const pair = httpPair(message);

    if (!pair) {
        return;
    }

    const { request, response } = pair;
    const path = targetPath(request.url ?? '/');

    if (isStaticAsset(path)) {
        return;
    }

    arrivedPaths.set(request, path);
    response.once('close', () => {
        logRequest(request, {
            status: response.headersSent ? response.statusCode : CLIENT_CLOSED_REQUEST,
            finished: response.writableFinished,
            tier: tierOf(response),
        });
    });
};

// A request accepted before registration has no close listener, so its finish
// writes the line. A static asset that arrived after it has no entry either,
// so logRequest reads its path from `request.url` at finish and drops it. A
// handler that rewrote it to a logged path would log it under that path; no
// rewrite in next.config.ts does that.
const onResponseFinish = (message: unknown): void => {
    const pair = httpPair(message);

    if (pair && !arrivedPaths.has(pair.request)) {
        logRequest(pair.request, {
            status: pair.response.statusCode,
            finished: true,
            tier: tierOf(pair.response),
        });
    }
};

/**
 * Observe HTTP headers without reading or buffering a request body. A request
 * accepted before this runs is still logged when its response finishes.
 * Returns a function that removes the subscribers.
 */
export const registerRequestLogging = (): (() => void) => {
    const previous = globalForRequestLog.dfoRequestLogSubscribers;

    if (previous) {
        unsubscribe(REQUEST_START, previous.start);
        unsubscribe(RESPONSE_FINISH, previous.finish);
    }

    subscribe(REQUEST_START, onRequestStart);
    subscribe(RESPONSE_FINISH, onResponseFinish);
    globalForRequestLog.dfoRequestLogSubscribers = {
        start: onRequestStart,
        finish: onResponseFinish,
    };

    return () => {
        unsubscribe(REQUEST_START, onRequestStart);
        unsubscribe(RESPONSE_FINISH, onResponseFinish);

        if (globalForRequestLog.dfoRequestLogSubscribers?.start === onRequestStart) {
            delete globalForRequestLog.dfoRequestLogSubscribers;
        }
    };
};
