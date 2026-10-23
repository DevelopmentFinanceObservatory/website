/**
 * Which headers cross the platform proxy (src/lib/proxy/forward). Kept apart
 * from forward.ts, which imports server-only, so `node --test` can load it.
 *
 * A request carries its content headers, the caller's user-agent (the API
 * logs it to tell client families apart) and every `mcp-*` header (the MCP
 * transport defines mcp-method, mcp-name, mcp-session-id and
 * mcp-protocol-version, and validates the first two against the body). A
 * response carries its content headers, allow (the methods of a 405),
 * location (a redirect, as the Datasets API's file links answer),
 * cache-control (the `no-store` on such a redirect to a signed URL, which
 * forward.ts's default `no-cache` would weaken), retry-after (on a busy
 * refusal), www-authenticate, server-timing, every `mcp-*` header and every
 * `x-dfo-*` header (the APIs' x-dfo-trace-id and x-dfo-commit). The
 * content-length is left behind when the upstream encoded the body, since
 * fetch has decoded it by then. Matching by prefix means a protocol header
 * added later needs no change here. No `x-dfo-*` header goes upstream from
 * the client: authorization and x-dfo-caller are set by forward.ts.
 */
const REQUEST_PREFIXES = ['mcp-'];
const RESPONSE_PREFIXES = ['mcp-', 'x-dfo-'];

// Request headers worth carrying upstream; everything else (cookies, the
// site's Basic auth, hop-by-hop) stays here.
const REQUEST_HEADERS = ['content-type', 'accept', 'user-agent'];
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
    'allow',
];

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

/** The client's request headers that go upstream. */
export const upstreamRequestHeaders = (source: Headers, into: Headers = new Headers()): Headers => {
    pickWithPrefixes(source, REQUEST_HEADERS, REQUEST_PREFIXES, into);

    return into;
};

// Node's fetch decodes an encoded body and keeps the upstream's headers, so a
// content-length beside a content-encoding counts bytes the client never gets.
export const dropEncodedLength = (source: Headers, into: Headers): void => {
    if (source.has('content-encoding')) {
        into.delete('content-length');
    }
};

/** The upstream's response headers that go back to the client. */
export const clientResponseHeaders = (source: Headers, into: Headers = new Headers()): Headers => {
    pickWithPrefixes(source, RESPONSE_HEADERS, RESPONSE_PREFIXES, into);
    dropEncodedLength(source, into);

    return into;
};
