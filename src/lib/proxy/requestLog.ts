import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { IncomingMessage, ServerResponse } from 'node:http';

import { isbot } from 'isbot';

import { requestCaller } from './caller.ts';

/**
 * One JSON line on stdout per visitor request, written when its response
 * finishes, so Cloud Logging can count visitors by caller. Cloud Run's own
 * request log records Cloudflare's edge address, so it cannot. A response
 * that never finishes, such as an abandoned page render or an `/mcp` event
 * stream the client closes, writes no line.
 *
 * `caller` is the same `ip:<digest>` the /mcp proxy sends as x-dfo-caller
 * (see caller.ts). `status` is the response's status code. `bot` is true
 * when the User-Agent header is missing, empty or one isbot flags. The line
 * holds no raw address, query string, cookie, auth header or user agent.
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
    bot: boolean;
};

type RequestMetadata = Pick<Request, 'url' | 'method' | 'headers'>;

// Framework files and images and fonts by extension.
const STATIC_ASSET = /^\/_next\/|\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

// The machine-facing paths: the site's own /api endpoints and the platform
// proxy's routes (src/lib/proxy/forward), /api/v1/*, /mcp, /openapi.json and
// /codes/*. Each entry matches itself and everything below it.
const API_PATHS = ['/api', '/mcp', '/openapi.json', '/codes'];

const isApiPath = (path: string): boolean =>
    API_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * What a request is, or undefined for a static asset, which is not logged.
 * `headers` are the request's raw headers, which keep the RSC and prefetch
 * headers Next.js removes from `request.headers`.
 */
export const requestKind = (path: string, headers: Headers): RequestKind | undefined => {
    if (STATIC_ASSET.test(path)) {
        return undefined;
    }

    if (isApiPath(path)) {
        return 'api';
    }

    const purpose = headers.get('sec-purpose') ?? headers.get('purpose');

    if (headers.has('next-router-prefetch') || purpose?.startsWith('prefetch')) {
        return 'prefetch';
    }

    return headers.get('rsc') === '1' ? 'rsc' : 'page';
};

/** A request with no user agent comes from a script, so it counts as a bot. */
const isBot = (userAgent: string | null): boolean => !userAgent || isbot(userAgent);

/** The log entry for a request, or undefined when it is not logged. */
export const requestLogEntry = (
    request: RequestMetadata,
    caller: string | undefined,
    status: number,
): RequestLogEntry | undefined => {
    const path = new URL(request.url).pathname;
    const kind = requestKind(path, request.headers);

    if (!kind) {
        return undefined;
    }

    return {
        severity: 'INFO',
        message: 'request',
        caller: caller ?? null,
        method: request.method,
        path,
        host: request.headers.get('host'),
        kind,
        status,
        bot: isBot(request.headers.get('user-agent')),
    };
};

const requestMetadata = (request: RequestMetadata | IncomingMessage): RequestMetadata => {
    if (!(request instanceof IncomingMessage)) {
        return request;
    }

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

    return {
        url: new URL(request.url ?? '/', 'http://localhost').href,
        method: request.method ?? 'GET',
        headers,
    };
};

/** Write the request's log line. Never throws: a logging fault must not fail the request. */
export const logRequest = (request: RequestMetadata | IncomingMessage, status: number): void => {
    try {
        const metadata = requestMetadata(request);
        const entry = requestLogEntry(metadata, requestCaller(metadata.headers), status);

        if (entry) {
            console.log(JSON.stringify(entry));
        }
    } catch {
        // URL and header errors can include raw request data.
        console.error('request log failed');
    }
};

const RESPONSE_FINISH = 'http.server.response.finish';

// Share the subscriber across Next dev reloads.
const globalForRequestLog = globalThis as typeof globalThis & {
    dfoRequestLogSubscriber?: (message: unknown) => void;
};

const onResponseFinish = (message: unknown): void => {
    if (
        typeof message === 'object' &&
        message !== null &&
        'request' in message &&
        message.request instanceof IncomingMessage &&
        'response' in message &&
        message.response instanceof ServerResponse
    ) {
        logRequest(message.request, message.response.statusCode);
    }
};

/**
 * Observe HTTP headers without reading or buffering a request body. A request
 * accepted before this runs is still logged, since its response finishes after.
 */
export const registerRequestLogging = (): void => {
    if (globalForRequestLog.dfoRequestLogSubscriber) {
        unsubscribe(RESPONSE_FINISH, globalForRequestLog.dfoRequestLogSubscriber);
    }

    subscribe(RESPONSE_FINISH, onResponseFinish);
    globalForRequestLog.dfoRequestLogSubscriber = onResponseFinish;
};
