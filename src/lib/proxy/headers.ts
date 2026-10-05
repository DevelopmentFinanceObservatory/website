/**
 * Which headers cross the platform proxy (src/lib/proxy/forward). Kept apart
 * from forward.ts, which imports server-only, so `node --test` can load it.
 *
 * A request carries its content headers and every `mcp-*` header (the MCP
 * transport defines mcp-method, mcp-name, mcp-session-id and
 * mcp-protocol-version, and validates the first two against the body). A
 * response carries its content headers, www-authenticate and every `mcp-*`
 * header. Matching by prefix means a protocol header added later needs no
 * change here. Authorization and x-dfo-caller are set by forward.ts.
 */
const MCP_PREFIX = 'mcp-';

// Request headers worth carrying upstream; everything else (cookies, the
// site's Basic auth, hop-by-hop) stays here.
const REQUEST_HEADERS = ['content-type', 'accept'];
// Response headers worth carrying back; the rest is the upstream's own
// business (server, date, transfer-encoding…).
const RESPONSE_HEADERS = [
    'content-type',
    'content-disposition',
    'content-length',
    'www-authenticate',
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

// Copy the named headers and every `mcp-*` header of `source` onto `into`.
const pickWithMcp = (source: Headers, names: readonly string[], into: Headers): void => {
    pick(source, names, into);

    // Headers yields lower-case names, so the prefix match is case-insensitive.
    for (const [name, value] of source) {
        if (name.startsWith(MCP_PREFIX)) {
            into.set(name, value);
        }
    }
};

/** The client's request headers that go upstream. */
export const upstreamRequestHeaders = (source: Headers, into: Headers = new Headers()): Headers => {
    pickWithMcp(source, REQUEST_HEADERS, into);

    return into;
};

/** The upstream's response headers that go back to the client. */
export const clientResponseHeaders = (source: Headers, into: Headers = new Headers()): Headers => {
    pickWithMcp(source, RESPONSE_HEADERS, into);

    return into;
};
