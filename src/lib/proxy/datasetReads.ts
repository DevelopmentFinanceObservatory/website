import 'server-only';

import type { NextRequest } from 'next/server';

import { apisCallerFor, requestSurface, type ApisSurface } from './caller';
import { forward, isApisTarget, type ForwardOptions } from './forward';
import { clientToken, NON_PRINTABLE, pick } from './headers';

/**
 * The Datasets API's read routes as the gateway serves them to pages, under
 * both /api/v1/datasets/ and the /api/datasets/ rewrite (next.config.ts):
 *
 *   {spec}/{cv}                  manifest  computed per read (tier, retention,
 *                                          listing), so cached briefly
 *   {spec}/{cv}/files/{digest}   file      the SHA-256-named bytes, cached by tier
 *   {spec}/{cv}/file?format=...  selector  picks the current file, so never cached
 *   {spec}                       current   the spec's latest stored version, with
 *                                          its freshness, so cached briefly
 *   derived/{ops}/{ocv}/files/{digest}
 *                                file      a derived frame's file, which the
 *                                          analysis runner stored, served as a
 *                                          dataset file is
 *
 * A spec id starts `spec_` and its content version `cv_`; a derived frame's
 * id starts `ops_` and its content version `ocv_`. Each is case-sensitive, as
 * dfo-apis names them and as the edge cache rule
 * matches them (dfo-infra, infra/stacks/edge/cloudflare_rules.tf). Every other
 * datasets path, such as operations/{id}, exports/{id}, {spec}/versions,
 * {spec}/options and a derived frame's manifest and file selector, is
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
 * A manifest or current read passes If-None-Match to dfo-apis, and a file read
 * passes it to storage, so a revalidation can answer 304 with the same cache
 * headers as the 200.
 *
 * A current read has no content version in its path, so dfo-apis names the
 * version it served in `x-dfo-content-version`, an internal header the gateway
 * reads and does not relay. The answer is kept 60 seconds in the browser and at
 * the edge (CURRENT_CACHE), which bounds how old a reader's view of the newest
 * version can be, and carries `Cache-Tag: <cv>` from that header. Without the header
 * (dfo-apis has not sent it) the answer is cached untagged and the delivery
 * line's content_version is null. `x-dfo-freshness` (current, pending or
 * stale) is relayed and exposed to pages when dfo-apis sends it.
 *
 * dfo-apis names the artifact's tier in `x-dfo-artifact-tier`, an internal
 * header the gateway reads and does not relay, on a file's 302. A derived
 * file is kept as a working file is, whatever tier dfo-apis names, because a
 * revocation cannot yet name the derived frames it reaches, so none is held
 * longer than a working file. A pinned dataset file is kept a year at
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
 * its preflight or read logs one `gateway.cors_refused` line, so third-party
 * use shows in the logs. A failure on the storage hop logs one
 * `gateway.delivery_failed` line.
 *
 * Each GET writes one `gateway.delivery` log line when its body ends
 * (GatewayDeliveryEntry). The line takes the field names of dfo-apis's
 * `datasets.delivery` line (datasets_api/delivery.py) where the fact is the
 * same, so the two can be read as one table. dfo-apis logs its own line for
 * the same call under the same trace_id, and `served_by: "gateway"` marks this
 * one, so a reader counts one use per trace_id.
 */
export type DatasetReadKind = 'manifest' | 'file' | 'selector' | 'current';

/** dfo-apis's door name for each read route, as its `datasets.delivery` line gives it. */
export const DELIVERY_DOORS = {
    manifest: 'snapshot',
    file: 'files',
    selector: 'file_selector',
    current: 'definition',
} as const satisfies Record<DatasetReadKind, string>;

/** dfo-apis's door name for a derived frame's file addressed by digest. */
export const DERIVED_FILES_DOOR = 'derived_files';

export type DeliveryDoor = (typeof DELIVERY_DOORS)[DatasetReadKind] | typeof DERIVED_FILES_DOOR;

/**
 * A read route, the door dfo-apis logs it under, and the ids its path names:
 * `specId` is a spec id, or a derived frame's `ops_` id; `contentVersion` is
 * a `cv_` version, a derived frame's `ocv_` version, or null for a current read, whose path names no version; `digest` is set on a
 * file read.
 */
export type DatasetRead = { door: DeliveryDoor; specId: string; digest?: string } & (
    | { kind: Exclude<DatasetReadKind, 'current'>; contentVersion: string }
    | { kind: 'current'; contentVersion: null }
);

export const STORAGE_ORIGIN = 'https://storage.googleapis.com';

const TIER_HEADER = 'x-dfo-artifact-tier';
const TRACE_HEADER = 'x-dfo-trace-id';
const CONTENT_VERSION_HEADER = 'x-dfo-content-version';
const FRESHNESS_HEADER = 'x-dfo-freshness';

const PINNED_CACHE = 'public, max-age=3600, s-maxage=31536000';
const SHORT_CACHE = 'public, max-age=60, s-maxage=300';
const CURRENT_CACHE = 'public, max-age=60, s-maxage=60';
const NO_STORE = 'no-store';

const SPEC_PREFIX = 'spec_';
const DERIVED_PREFIX = 'ops_';
const CONTENT_VERSION_PREFIX = 'cv_';
const DERIVED_VERSION_PREFIX = 'ocv_';

// derived/{ops}/{ocv}/files/{digest}: a derived frame's file by digest, the
// only derived path read here.
const derivedRead = (segments: readonly string[]): DatasetRead | undefined => {
    const [, specId, contentVersion, files, digest] = segments;

    return segments.length === 5 &&
        specId?.startsWith(DERIVED_PREFIX) &&
        contentVersion?.startsWith(DERIVED_VERSION_PREFIX) &&
        files === 'files' &&
        digest
        ? { kind: 'file', door: DERIVED_FILES_DOOR, specId, contentVersion, digest }
        : undefined;
};

/** Which read route a datasets path's decoded segments name, if any. */
export const datasetRead = (segments: readonly string[]): DatasetRead | undefined => {
    const [specId, contentVersion, ...rest] = segments;

    if (specId === 'derived') {
        return derivedRead(segments);
    }

    if (!specId?.startsWith(SPEC_PREFIX)) {
        return undefined;
    }

    if (segments.length === 1) {
        return { kind: 'current', door: DELIVERY_DOORS.current, specId, contentVersion: null };
    }

    if (!contentVersion?.startsWith(CONTENT_VERSION_PREFIX)) {
        return undefined;
    }

    if (rest.length === 0) {
        return { kind: 'manifest', door: DELIVERY_DOORS.manifest, specId, contentVersion };
    }

    if (rest.length === 1 && rest[0] === 'file') {
        return { kind: 'selector', door: DELIVERY_DOORS.selector, specId, contentVersion };
    }

    if (rest.length === 2 && rest[0] === 'files' && rest[1]) {
        return { kind: 'file', door: DELIVERY_DOORS.file, specId, contentVersion, digest: rest[1] };
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

    if (kind === 'current') {
        return CURRENT_CACHE;
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
const EXPOSED_HEADERS = ['Content-Disposition', 'ETag', 'Retry-After', 'X-DFO-Freshness'];
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
    trace_id: string | null;
    tier: string | null;
    storage_status?: number;
    error?: string;
}): void => {
    console.error(
        JSON.stringify({ severity: 'ERROR', message: 'gateway.delivery_failed', ...fields }),
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
    // Receives the tier and trace id dfo-apis named, before either header is dropped.
    onUpstream: (tier: string | null, traceId: string | null) => void;
};

/**
 * A forward() rewrite that follows dfo-apis' 302 to a signed storage URL and
 * answers with the stored bytes, streamed, or storage's 304. Any other
 * answer, and a redirect that cannot be followed, goes back unchanged.
 */
const followStorage =
    ({ req, storageOrigin, bounds, onUpstream }: StorageHop) =>
    async (upstream: Response): Promise<Response> => {
        const tier = upstream.headers.get(TIER_HEADER);
        const traceId = upstream.headers.get(TRACE_HEADER);
        const path = new URL(req.url).pathname;

        onUpstream(tier, traceId);

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
                logStorageFailure({ path, trace_id: traceId, tier, error: errorName(error) });
            }

            return upstream;
        } finally {
            clearTimeout(headersTimer);
        }

        if (stored.status !== 200 && stored.status !== 304) {
            logStorageFailure({
                path,
                trace_id: traceId,
                tier,
                storage_status: stored.status,
            });
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

/** Where the gateway's dfo-apis call got its caller (dfo-apis's CallerSource). */
export type CallerSource = 'vouched' | 'none';

/** One `gateway.delivery` line. */
export type GatewayDeliveryEntry = {
    // ERROR when the body failed before the client had it all.
    severity: 'INFO' | 'ERROR';
    message: 'gateway.delivery';
    door: DeliveryDoor;
    // dfo-apis's x-dfo-trace-id for the call, which its own line carries too.
    trace_id: string | null;
    spec_id: string;
    // Null on a current read when dfo-apis named no version.
    content_version: string | null;
    // The file's SHA-256 name, on a file read's line only.
    digest?: string;
    // What forward() sent dfo-apis in x-dfo-caller, vouched by the principal.
    caller: string | null;
    caller_source: CallerSource;
    surface: ApisSurface;
    // X-DFO-Client's `<name>/<version>` product token, as dfo-apis reads it.
    client: string | null;
    user_agent: string | null;
    origin_host: string | null;
    referer_host: string | null;
    served_by: 'gateway';
    status: number;
    tier: string | null;
    bytes: number;
    complete: boolean;
    duration_ms: number;
    // Why the body failed, on an ERROR line.
    error?: string;
};

// The host of an Origin or Referer: a Referer's path and query can carry
// whatever the page put there.
const hostOf = (url: string | null): string | null =>
    url !== null && URL.canParse(url) ? new URL(url).host || null : null;

const MAX_FIELD_LENGTH = 256;

const cleaned = (value: string | null): string | null =>
    [...(value ?? '').replace(NON_PRINTABLE, '').trim()].slice(0, MAX_FIELD_LENGTH).join('') ||
    null;

// The caller forward() sends dfo-apis, from the same env and resolver
// (apisCallerFor); forward()'s own resolver logs the missing-settings warning.
const apisCaller = apisCallerFor(process.env, () => {});

const sentCaller = (
    req: NextRequest,
    target: string,
): { caller: string | null; caller_source: CallerSource } => {
    if (!isApisTarget(target)) {
        return { caller: null, caller_source: 'none' };
    }

    const { principal, caller } = apisCaller(req.headers.get('x-forwarded-for'));

    return principal && caller
        ? { caller, caller_source: 'vouched' }
        : { caller: null, caller_source: 'none' };
};

const logDelivery = (entry: GatewayDeliveryEntry): void => {
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

const logCorsRefused = (req: NextRequest, door: DeliveryDoor, origin: string): void => {
    console.log(
        JSON.stringify({
            severity: 'INFO',
            message: 'gateway.cors_refused',
            door,
            method: req.method,
            path: new URL(req.url).pathname,
            origin_host: hostOf(origin),
            referer_host: hostOf(req.headers.get('referer')),
            client: clientToken(req.headers),
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
        logCorsRefused(req, read.door, origin);
    }

    if (read && corsOrigin && req.method === 'OPTIONS' && isReadPreflight(req)) {
        return preflight(corsOrigin);
    }

    if (!read || req.method !== 'GET') {
        return forward(req, options);
    }

    const started = performance.now();
    let tier: string | null = null;
    let traceId: string | null = null;

    const relayed = await forward(req, {
        ...options,
        // A file's If-None-Match goes to storage, in followStorage.
        pass: {
            request: ['manifest', 'current'].includes(read.kind) ? ['if-none-match'] : [],
            response:
                read.kind === 'current'
                    ? ['etag', FRESHNESS_HEADER, CONTENT_VERSION_HEADER]
                    : ['etag'],
        },
        rewrite:
            read.kind === 'file'
                ? followStorage({
                      req,
                      storageOrigin,
                      bounds: storageBounds,
                      onUpstream: (namedTier, namedTrace) => {
                          tier = namedTier;
                          traceId = namedTrace;
                      },
                  })
                : undefined,
    });

    // A followed file's trace id came from dfo-apis's 302 (followStorage).
    if (read.kind !== 'file') {
        traceId = relayed.headers.get(TRACE_HEADER);
    }

    const headers = new Headers(relayed.headers);
    const contentVersion =
        read.kind === 'current'
            ? (headers.get(CONTENT_VERSION_HEADER) ?? null)
            : read.contentVersion;

    headers.delete(CONTENT_VERSION_HEADER);

    // A derived file is held as a working file is (see above); its line keeps the named tier.
    const cacheControl = readCacheControl(
        read.kind,
        relayed.status,
        read.door === DERIVED_FILES_DOOR ? null : tier,
    );

    headers.set('Cache-Control', cacheControl);
    headers.set('Vary', 'Origin');

    const cacheable = cacheControl !== NO_STORE;

    if (cacheable) {
        if (contentVersion !== null) {
            headers.set('Cache-Tag', contentVersion);
        }

        dropPerRequestHeaders(headers);
    }

    if (corsOrigin) {
        const exposed = cacheable
            ? EXPOSED_HEADERS
            : [...EXPOSED_HEADERS, ...EXPOSED_PER_REQUEST_HEADERS];

        headers.set('Access-Control-Allow-Origin', corsOrigin);
        headers.set('Access-Control-Expose-Headers', exposed.join(', '));
    }

    const identity = {
        ...sentCaller(req, options.target),
        surface: requestSurface(req.headers),
        client: clientToken(req.headers),
        user_agent: cleaned(req.headers.get('user-agent')),
        origin_host: hostOf(origin),
        referer_host: hostOf(req.headers.get('referer')),
    };

    const log = (bytes: number, complete: boolean, error?: unknown): void => {
        // A client that left takes the body with it, which is not a failure.
        const failed = error !== undefined && !req.signal.aborted;

        logDelivery({
            severity: failed ? 'ERROR' : 'INFO',
            message: 'gateway.delivery',
            door: read.door,
            trace_id: traceId,
            spec_id: read.specId,
            content_version: contentVersion,
            ...(read.digest ? { digest: read.digest } : {}),
            ...identity,
            served_by: 'gateway',
            status: relayed.status,
            tier,
            bytes,
            complete,
            duration_ms: Math.round(performance.now() - started),
            ...(failed ? { error: errorText(error) } : {}),
        });
    };

    if (relayed.body === null) {
        log(0, true);

        return new Response(null, { status: relayed.status, headers });
    }

    return new Response(metered(relayed.body, log), { status: relayed.status, headers });
};
