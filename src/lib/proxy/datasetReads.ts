import 'server-only';

import type { NextRequest } from 'next/server';

import { forward, type ForwardOptions } from './forward';
import { clientLabel, pick } from './headers';

/**
 * The Datasets API's read routes as the gateway serves them to pages, under
 * both /api/v1/datasets/ and the /api/datasets/ rewrite (next.config.ts):
 *
 *   {spec}/{cv}                  manifest  computed per read (tier, retention,
 *                                          listing), so cached briefly
 *   {spec}/{cv}/files/{digest}   file      the SHA-256-named bytes, cached by tier
 *   {spec}/{cv}/file?format=...  selector  picks the current file, so never cached
 *
 * A spec id starts `spec_` and a content version `cv_`, case-sensitive, as
 * dfo-apis names them and as the edge cache rule matches them (dfo-infra,
 * infra/stacks/edge/cloudflare_rules.tf). Every other datasets path, such as
 * operations/{id}, exports/{id}, {spec}/versions and {spec}/options, is
 * forwarded as forward() does, with the upstream's own Cache-Control.
 *
 * dfo-apis answers a file with a 302 to a signed storage.googleapis.com URL.
 * The gateway follows it and streams the bytes back as a 200, so the edge can
 * cache one stable URL and a browser makes one request. Only a 302 to
 * STORAGE_ORIGIN is followed, with a GET that carries only the caller's
 * If-None-Match (no token, caller or client header). A Location elsewhere, or
 * a storage answer other than 200 or 304, goes back as dfo-apis gave it,
 * uncached. The storage hop is bounded (STORAGE_BOUNDS): no headers in time
 * falls back to the 302, and a body that stalls ends in an error. Each
 * failure on the hop logs at error level.
 *
 * A manifest read passes If-None-Match to dfo-apis, and a file read passes it
 * to storage, so a revalidation can answer 304 with the same cache headers as
 * the 200.
 *
 * dfo-apis names the artifact's tier in `x-dfo-artifact-tier`, an internal
 * header the gateway reads and does not relay. A pinned file is kept a year at
 * the edge and an hour in the browser, which bounds how long a takedown takes
 * to reach a returning visitor. A working file, or one whose tier is unnamed,
 * is kept briefly, because a held version renews only when a download reaches
 * dfo-apis. A cacheable answer carries `Cache-Tag: <cv>`, the content version
 * every alias of one version shares, so a revocation purges all of them by
 * one tag. Every other answer on these routes is `no-store`. A cacheable
 * answer drops the headers that describe one request (PER_REQUEST_HEADERS,
 * X-RateLimit-*), since every later reader would get them.
 *
 * A page on a DFO origin (DFO_ORIGINS, isDfoOrigin) reads these routes
 * cross-origin: the gateway answers its preflight and labels each answer with
 * `Access-Control-Allow-Origin`. Any other Origin gets no CORS headers, and
 * its preflight or read logs one `dataset cors refused` line, so third-party
 * use shows in the logs. Each GET writes one `dataset read` log line when its
 * body ends (logDatasetRead).
 */
export type DatasetReadKind = 'manifest' | 'file' | 'selector';

export type DatasetRead = { kind: DatasetReadKind; contentVersion: string };

export const STORAGE_ORIGIN = 'https://storage.googleapis.com';

const TIER_HEADER = 'x-dfo-artifact-tier';

const PINNED_CACHE = 'public, max-age=3600, s-maxage=31536000';
const SHORT_CACHE = 'public, max-age=60, s-maxage=300';
const NO_STORE = 'no-store';

const SPEC_PREFIX = 'spec_';
const CONTENT_VERSION_PREFIX = 'cv_';

/** Which read route a datasets path's decoded segments name, if any. */
export const datasetRead = (segments: readonly string[]): DatasetRead | undefined => {
    const [spec, contentVersion, ...rest] = segments;

    if (!spec?.startsWith(SPEC_PREFIX) || !contentVersion?.startsWith(CONTENT_VERSION_PREFIX)) {
        return undefined;
    }

    if (rest.length === 0) {
        return { kind: 'manifest', contentVersion };
    }

    if (rest.length === 1 && rest[0] === 'file') {
        return { kind: 'selector', contentVersion };
    }

    if (rest.length === 2 && rest[0] === 'files' && rest[1]) {
        return { kind: 'file', contentVersion };
    }

    return undefined;
};

/** The Cache-Control of a read's answer: a 304 gets the 200's. */
export const readCacheControl = (
    kind: DatasetReadKind,
    status: number,
    tier: string | null,
): string => {
    if ((status !== 200 && status !== 304) || kind === 'selector') {
        return NO_STORE;
    }

    return kind === 'file' && tier === 'pinned' ? PINNED_CACHE : SHORT_CACHE;
};

/** The origins whose pages may read these routes cross-origin. */
export const DFO_ORIGINS: ReadonlySet<string> = new Set([
    'https://developmentfinance.org',
    'https://www.developmentfinance.org',
    'https://preview.developmentfinance.org',
    // The prototypes' local dev server and `pnpm preview` (wrangler dev).
    'http://localhost:3000',
    'http://localhost:8787',
]);

// The dfo-prototypes Worker on the account's workers.dev subdomain: the
// Worker itself, and each preview version or alias (pr-<number>), which
// Cloudflare names `<prefix>-dfo-prototypes` (.github/workflows/deploy-prototypes.yml).
const PROTOTYPE_PREVIEW = /^https:\/\/(?:[a-z0-9-]+-)?dfo-prototypes\.one-org\.workers\.dev$/;

export const isDfoOrigin = (origin: string | null): origin is string =>
    origin !== null && (DFO_ORIGINS.has(origin) || PROTOTYPE_PREVIEW.test(origin));

// Only GET gets read handling, so only GET is offered cross-origin.
const READ_METHODS = 'GET';
// What the SDK clients send: X-DFO-Client on every call, Authorization with a
// publishable key, Accept, If-None-Match on a revalidation, and Content-Type
// on a body.
const ALLOWED_HEADERS = 'Accept, Authorization, Content-Type, If-None-Match, X-DFO-Client';
const EXPOSED_HEADERS = ['Content-Disposition', 'ETag', 'Retry-After'];
const EXPOSED_PER_REQUEST_HEADERS = [
    'X-DFO-Trace-Id',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
];

// Headers that describe one request: a cached copy would hand them to every
// later reader.
const PER_REQUEST_HEADERS = ['server-timing', 'x-dfo-trace-id'];
const RATE_LIMIT_PREFIX = 'x-ratelimit-';

/** Delete the headers of `headers` that describe one request. */
export const dropPerRequestHeaders = (headers: Headers): void => {
    // Copied first, since deleting while iterating skips entries.
    for (const name of [...headers.keys()]) {
        if (PER_REQUEST_HEADERS.includes(name) || name.startsWith(RATE_LIMIT_PREFIX)) {
            headers.delete(name);
        }
    }
};
// Cloudflare never caches OPTIONS, and every SDK read preflights (X-DFO-Client).
const PREFLIGHT_MAX_AGE = '7200';

const preflight = (origin: string): Response =>
    new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': READ_METHODS,
            'Access-Control-Allow-Headers': ALLOWED_HEADERS,
            'Access-Control-Max-Age': PREFLIGHT_MAX_AGE,
            'Cache-Control': NO_STORE,
            Vary: 'Origin',
        },
    });

const isReadPreflight = (req: NextRequest): boolean =>
    req.headers.get('access-control-request-method')?.toUpperCase() === 'GET';

// Storage's answer headers a followed file keeps.
const STORED_FILE_HEADERS = ['content-type', 'content-length', 'content-disposition', 'etag'];

/** How long the storage hop may wait, in milliseconds. */
export type StorageBounds = { headersMs: number; stallMs: number };

// The signed URL is already rendered, so storage answers headers at once:
// 10 s, as forward.ts's ASSET_TIMEOUT_MS, is ample and frees the slot well
// before Cloudflare gives the visitor a 524 at 100 s. Storage streams without
// pause, so 30 s with no chunk while the client waits for one is a stalled
// connection; the bound runs only while a chunk is wanted, so a slow client
// is never cut off.
export const STORAGE_BOUNDS: StorageBounds = { headersMs: 10_000, stallMs: 30_000 };

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'Error');

const errorText = (error: unknown): string =>
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const logStorageFailure = (fields: {
    path: string;
    tier: string | null;
    storageStatus?: number;
    error?: string;
}): void => {
    console.error(
        JSON.stringify({ severity: 'ERROR', message: 'dataset storage failed', ...fields }),
    );
};

// `body` passed through unchanged, failing with a StorageStallError (after
// `abort` has been called with it) when a wanted chunk takes longer than `ms`.
const stallBounded = (
    body: ReadableStream<Uint8Array>,
    ms: number,
    abort: (reason: Error) => void,
): ReadableStream<Uint8Array> => {
    const reader = body.getReader();

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const stalled = new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error(`storage sent no bytes for ${ms} ms`);

                    error.name = 'StorageStallError';
                    abort(error);
                    reject(error);
                }, ms);
            });

            try {
                const { done, value } = await Promise.race([reader.read(), stalled]);

                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(value);
                }
            } finally {
                clearTimeout(timer);
            }
        },
        cancel: (reason) => reader.cancel(reason),
    });
};

type StorageHop = {
    // The client's request: its signal, and its If-None-Match for storage.
    req: NextRequest;
    storageOrigin: string;
    bounds: StorageBounds;
    // Receives the tier dfo-apis named.
    onTier: (tier: string | null) => void;
};

/**
 * A forward() rewrite that follows dfo-apis' 302 to a signed storage URL and
 * answers with the stored bytes, streamed, or storage's 304. Any other
 * answer, and a redirect that cannot be followed, goes back unchanged.
 */
const followStorage =
    ({ req, storageOrigin, bounds, onTier }: StorageHop) =>
    async (upstream: Response): Promise<Response> => {
        const tier = upstream.headers.get(TIER_HEADER);
        const path = new URL(req.url).pathname;

        onTier(tier);

        const location = upstream.headers.get('location');

        if (
            upstream.status !== 302 ||
            location === null ||
            !URL.canParse(location) ||
            new URL(location).origin !== storageOrigin
        ) {
            return upstream;
        }

        const hop = new AbortController();
        const headers = new Headers();

        pick(req.headers, ['if-none-match'], headers);

        const headersTimer = setTimeout(() => {
            hop.abort(
                new DOMException(
                    `storage sent no headers in ${bounds.headersMs} ms`,
                    'TimeoutError',
                ),
            );
        }, bounds.headersMs);
        let stored: Response;

        try {
            stored = await fetch(location, {
                headers,
                cache: 'no-store',
                redirect: 'manual',
                signal: AbortSignal.any([req.signal, hop.signal]),
            });
        } catch (error) {
            // A client that left aborted the hop itself, so nothing failed.
            if (!req.signal.aborted) {
                logStorageFailure({ path, tier, error: errorName(error) });
            }

            return upstream;
        } finally {
            clearTimeout(headersTimer);
        }

        if (stored.status !== 200 && stored.status !== 304) {
            logStorageFailure({ path, tier, storageStatus: stored.status });
            await stored.body?.cancel();

            return upstream;
        }

        await upstream.body?.cancel();

        const relayed = new Headers();

        pick(stored.headers, STORED_FILE_HEADERS, relayed);

        if (stored.status === 304 || stored.body === null) {
            relayed.delete('content-length');

            return new Response(null, { status: stored.status, headers: relayed });
        }

        // fetch has decoded an encoded body, so the stored length does not
        // match the bytes sent.
        if (stored.headers.has('content-encoding')) {
            relayed.delete('content-length');
        }

        const body = stallBounded(stored.body, bounds.stallMs, (reason) => hop.abort(reason));

        return new Response(body, { status: 200, headers: relayed });
    };

export type DatasetReadLogEntry = {
    // ERROR when the body failed before the client had it all.
    severity: 'INFO' | 'ERROR';
    message: 'dataset read';
    read: DatasetReadKind;
    path: string;
    status: number;
    tier: string | null;
    bytes: number;
    complete: boolean;
    durationMs: number;
    origin: string | null;
    referer: string | null;
    client: string | null;
    // Why the body failed, on an ERROR line.
    error?: string;
};

// A Referer as origin and path: its query string and fragment can carry
// whatever the page put there.
const refererPage = (referer: string | null): string | null => {
    if (referer === null || !URL.canParse(referer)) {
        return null;
    }

    const url = new URL(referer);

    return `${url.origin}${url.pathname}`;
};

const logDatasetRead = (entry: DatasetReadLogEntry): void => {
    (entry.severity === 'ERROR' ? console.error : console.log)(JSON.stringify(entry));
};

// `body` passed through unchanged, with `onEnd` called once with the bytes
// sent when it ends, fails (with the error) or the client cancels it.
const metered = (
    body: ReadableStream<Uint8Array>,
    onEnd: (bytes: number, complete: boolean, error?: unknown) => void,
): ReadableStream<Uint8Array> => {
    const reader = body.getReader();
    let bytes = 0;
    let ended = false;

    const end = (complete: boolean, error?: unknown): void => {
        if (!ended) {
            ended = true;
            onEnd(bytes, complete, error);
        }
    };

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { done, value } = await reader.read();

                if (done) {
                    end(true);
                    controller.close();
                } else {
                    bytes += value.byteLength;
                    controller.enqueue(value);
                }
            } catch (error) {
                end(false, error);
                controller.error(error);
            }
        },
        cancel(reason) {
            end(false);

            return reader.cancel(reason);
        },
    });
};

type DatasetsOptions = ForwardOptions & {
    // The decoded path segments below /datasets.
    segments: readonly string[];
    // The only origin a file redirect is followed to; tests point it at a local server.
    storageOrigin?: string;
    // The storage hop's bounds; tests shorten them.
    storageBounds?: StorageBounds;
};

const logCorsRefused = (req: NextRequest, read: DatasetReadKind, origin: string): void => {
    console.log(
        JSON.stringify({
            severity: 'INFO',
            message: 'dataset cors refused',
            read,
            method: req.method,
            path: new URL(req.url).pathname,
            origin,
            referer: refererPage(req.headers.get('referer')),
            client: clientLabel(req.headers) || null,
        }),
    );
};

/**
 * Forward a Datasets document route. A read route (datasetRead) gets the
 * caching, CORS and logging described above; every other route is forwarded
 * as forward() does.
 */
export const forwardDatasets = async (
    req: NextRequest,
    {
        segments,
        storageOrigin = STORAGE_ORIGIN,
        storageBounds = STORAGE_BOUNDS,
        ...options
    }: DatasetsOptions,
): Promise<Response> => {
    const read = datasetRead(segments);
    const origin = req.headers.get('origin');
    const corsOrigin = isDfoOrigin(origin) ? origin : undefined;

    if (read && origin !== null && !corsOrigin && ['GET', 'OPTIONS'].includes(req.method)) {
        logCorsRefused(req, read.kind, origin);
    }

    if (read && corsOrigin && req.method === 'OPTIONS' && isReadPreflight(req)) {
        return preflight(corsOrigin);
    }

    if (!read || req.method !== 'GET') {
        return forward(req, options);
    }

    const started = performance.now();
    let tier: string | null = null;

    const relayed = await forward(req, {
        ...options,
        // A file's If-None-Match goes to storage, in followStorage.
        pass: { request: read.kind === 'manifest' ? ['if-none-match'] : [], response: ['etag'] },
        rewrite:
            read.kind === 'file'
                ? followStorage({
                      req,
                      storageOrigin,
                      bounds: storageBounds,
                      onTier: (named) => {
                          tier = named;
                      },
                  })
                : undefined,
    });

    const headers = new Headers(relayed.headers);
    const cacheControl = readCacheControl(read.kind, relayed.status, tier);

    headers.set('Cache-Control', cacheControl);
    headers.set('Vary', 'Origin');

    const cacheable = cacheControl !== NO_STORE;

    if (cacheable) {
        headers.set('Cache-Tag', read.contentVersion);
        dropPerRequestHeaders(headers);
    }

    if (corsOrigin) {
        const exposed = cacheable
            ? EXPOSED_HEADERS
            : [...EXPOSED_HEADERS, ...EXPOSED_PER_REQUEST_HEADERS];

        headers.set('Access-Control-Allow-Origin', corsOrigin);
        headers.set('Access-Control-Expose-Headers', exposed.join(', '));
    }

    const log = (bytes: number, complete: boolean, error?: unknown): void => {
        // A client that left takes the body with it, which is not a failure.
        const failed = error !== undefined && !req.signal.aborted;

        logDatasetRead({
            severity: failed ? 'ERROR' : 'INFO',
            message: 'dataset read',
            read: read.kind,
            path: new URL(req.url).pathname,
            status: relayed.status,
            tier,
            bytes,
            complete,
            durationMs: Math.round(performance.now() - started),
            origin,
            referer: refererPage(req.headers.get('referer')),
            client: clientLabel(req.headers) || null,
            ...(failed ? { error: errorText(error) } : {}),
        });
    };

    if (relayed.body === null) {
        log(0, true);

        return new Response(null, { status: relayed.status, headers });
    }

    return new Response(metered(relayed.body, log), { status: relayed.status, headers });
};
