import { requestCaller } from './caller.ts';

/**
 * One JSON line on stdout per visitor request, written by src/proxy.ts, so
 * Cloud Logging can count visitors by caller. Cloud Run's own request log
 * records Cloudflare's edge address, so it cannot.
 *
 * `caller` is the same `ip:<digest>` the /mcp proxy sends as x-dfo-caller
 * (see caller.ts). The line holds no raw address, query string, cookie or
 * auth header.
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
    userAgent: string | null;
};

// Framework files and images and fonts by extension. src/proxy.ts's matcher
// skips the same paths before the proxy runs; this repeats it because a
// matcher must be a literal.
const STATIC_ASSET = /^\/_next\/|\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

const isApiPath = (path: string): boolean =>
    /^\/api(?:\/|$)/.test(path) || /^\/mcp(?:\/|$)/.test(path);

/**
 * What a request is, or undefined for a static asset, which is not logged.
 * The RSC headers reach the proxy because next.config.ts sets
 * skipProxyUrlNormalize; Next.js strips them otherwise.
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

/** The log entry for a request, or undefined when it is not logged. */
export const requestLogEntry = (
    request: Request,
    caller: string | undefined,
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
        userAgent: request.headers.get('user-agent'),
    };
};

/** Write the request's log line. Never throws: a logging fault must not fail the request. */
export const logRequest = (request: Request): void => {
    try {
        const entry = requestLogEntry(request, requestCaller(request.headers));

        if (entry) {
            console.log(JSON.stringify(entry));
        }
    } catch (error) {
        console.error('request log failed', error);
    }
};
