/**
 * Which headers cross the platform proxy (src/lib/proxy/forward). Kept apart
 * from forward.ts, which imports server-only, so `node --test` can load it.
 *
 * A request carries its content headers, the caller's user-agent (the API
 * logs it to tell client families apart), the SDK clients' x-dfo-client label
 * (cleaned by clientLabel below, so the API's request log can name the client
 * of production traffic) and every `mcp-*` header (the MCP transport defines
 * mcp-method, mcp-name, mcp-session-id and mcp-protocol-version, and
 * validates the first two against the body). x-dfo-client is a label the
 * caller chooses, good for counting usage and for nothing else: it takes no
 * part in trust, auth or rate limits. A
 * response carries its content headers, allow (the methods of a 405),
 * location (a redirect, as the Datasets API's file links answer),
 * cache-control (the `no-store` on such a redirect to a signed URL, which
 * forward.ts's default `no-cache` would weaken), retry-after (on a busy
 * refusal), www-authenticate, server-timing, every `mcp-*` header, and the
 * two `x-dfo-*` headers the APIs document as public (x-dfo-trace-id and
 * x-dfo-commit, in the docs corpus's dfo-apis/conventions.md). The rest of
 * `x-dfo-*` names internal identity (x-dfo-principal, x-dfo-caller,
 * x-dfo-write-token), so it stays here. The content-length is left behind
 * when the upstream encoded the body, since fetch has decoded it by then.
 * Matching `mcp-*` by prefix means a protocol header added later needs no
 * change here. Of the `x-dfo-*` names only x-dfo-client goes upstream from the
 * client by default; authorization, x-dfo-caller and x-dfo-caller-principal
 * are set by forward.ts. A route can carry more in both directions with a
 * HeaderPass, as the Presentation API's routes do (PRESENTATION_HEADERS).
 */
const REQUEST_PREFIXES = ['mcp-'];
const RESPONSE_PREFIXES = ['mcp-'];

// Request headers worth carrying upstream; everything else (cookies, the
// site's Basic auth, hop-by-hop) stays here.
const REQUEST_HEADERS = ['content-type', 'accept', 'user-agent'];
const CLIENT_HEADER = 'x-dfo-client';
// The APIs' cap on a logged caller-supplied string (dfo_platform/caller.py).
const MAX_CLIENT_LABEL_LENGTH = 256;
// What Python's str.isprintable() rejects, bar the plain space: control, format
// (soft hyphen), surrogate, private-use and unassigned characters, line and
// paragraph separators, and every space separator other than U+0020.
const NON_PRINTABLE = /[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/gu;

// Response headers worth carrying back; the rest is the upstream's own
// business (server, date, transfer-encoding…).
const RESPONSE_HEADERS = [
    'content-type',
    'content-disposition',
    'content-length',
    'location',
    'cache-control',
    'retry-after',
    'www-authenticate',
    'server-timing',
    'x-dfo-trace-id',
    'x-dfo-commit',
    'allow',
];

/** Headers a route carries beyond the defaults, each way. */
export type HeaderPass = { request: readonly string[]; response: readonly string[] };

/**
 * What the Presentation API's card and share routes need beyond the defaults:
 * the write token that lets a client revise or delete what it made, the
 * conditional read of a share's slot data (ETag one way, If-None-Match the
 * other), and CORS, so a page on another origin can read that data and its
 * preflight is answered by dfo-apis.
 */
export const PRESENTATION_HEADERS: HeaderPass = {
    request: [
        'x-dfo-write-token',
        'if-none-match',
        'origin',
        'access-control-request-method',
        'access-control-request-headers',
    ],
    response: [
        'etag',
        'vary',
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers',
        'access-control-allow-credentials',
        'access-control-expose-headers',
        'access-control-max-age',
    ],
};

// Copy the named headers present on `source` onto `into`.
export const pick = (source: Headers, names: readonly string[], into: Headers): void => {
    for (const name of names) {
        const value = source.get(name);

        if (value) {
            into.set(name, value);
        }
    }
};

// Copy the named headers and every header of `source` whose name starts with
// one of `prefixes` onto `into`.
const pickWithPrefixes = (
    source: Headers,
    names: readonly string[],
    prefixes: readonly string[],
    into: Headers,
): void => {
    pick(source, names, into);

    // Headers yields lower-case names, so the prefix match is case-insensitive.
    for (const [name, value] of source) {
        if (prefixes.some((prefix) => name.startsWith(prefix))) {
            into.set(name, value);
        }
    }
};

/**
 * The x-dfo-client label as the APIs clean it: non-printable characters and
 * surrounding space dropped, then cut to 256 characters. Empty when the
 * header is absent or blank after cleaning.
 */
export const clientLabel = (source: Headers): string => {
    const printable = (source.get(CLIENT_HEADER) ?? '').replace(NON_PRINTABLE, '').trim();

    return [...printable].slice(0, MAX_CLIENT_LABEL_LENGTH).join('');
};

/** The client's request headers that go upstream, plus the `extra` names. */
export const upstreamRequestHeaders = (
    source: Headers,
    into: Headers = new Headers(),
    extra: readonly string[] = [],
): Headers => {
    pickWithPrefixes(source, [...REQUEST_HEADERS, ...extra], REQUEST_PREFIXES, into);

    const label = clientLabel(source);

    if (label) {
        into.set(CLIENT_HEADER, label);
    }

    return into;
};

// Node's fetch decodes an encoded body and keeps the upstream's headers, so a
// content-length beside a content-encoding counts bytes the client never gets.
export const dropEncodedLength = (source: Headers, into: Headers): void => {
    if (source.has('content-encoding')) {
        into.delete('content-length');
    }
};

/** The upstream's response headers that go back to the client, plus the `extra` names. */
export const clientResponseHeaders = (
    source: Headers,
    into: Headers = new Headers(),
    extra: readonly string[] = [],
): Headers => {
    pickWithPrefixes(source, [...RESPONSE_HEADERS, ...extra], RESPONSE_PREFIXES, into);
    dropEncodedLength(source, into);

    return into;
};
