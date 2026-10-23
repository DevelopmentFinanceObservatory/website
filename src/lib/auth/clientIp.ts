import { clientAddress } from '../proxy/caller.ts';

/**
 * The header Better Auth reads the client IP from (`advanced.ipAddress`
 * in ./auth), for its rate limits, the Turnstile check and session rows.
 * Its own default reads X-Forwarded-For and gives up when that holds more
 * than one entry, as it does behind Cloud Run's front end, which would put
 * every visitor in one shared bucket.
 */
export const CLIENT_IP_HEADER = 'x-dfo-client-ip';

/**
 * The request with CLIENT_IP_HEADER set to the client address the site's
 * own proxy uses (TRUSTED_PROXY_HOPS, see lib/proxy/caller). Any value the
 * client sent is dropped first, so the header only ever carries an address
 * the server worked out. With malformed hops, or no usable entry, the
 * header is left off and Better Auth treats the client as unknown.
 *
 * The copy is built from the URL, method and buffered body. Next hands
 * route handlers a Request subclass that `new Request(request)` cannot read
 * from. Auth bodies are a few hundred bytes, so buffering costs nothing.
 */
export const withClientIp = async (
    request: Request,
    hops: number | { problem: string },
): Promise<Request> => {
    const headers = new Headers(request.headers);
    const address =
        typeof hops === 'number'
            ? clientAddress(request.headers.get('x-forwarded-for'), hops)
            : undefined;

    headers.delete(CLIENT_IP_HEADER);

    if (address) {
        headers.set(CLIENT_IP_HEADER, address);
    }

    return new Request(request.url, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
        signal: request.signal,
    });
};

type Handler = (request: Request) => Promise<Response>;

/** The /api/auth route's GET and POST, which are Better Auth's handlers each given the request withClientIp builds. */
export const clientIpHandlers = (
    handlers: { GET: Handler; POST: Handler },
    hops: number | { problem: string },
): { GET: Handler; POST: Handler } => ({
    GET: async (request) => handlers.GET(await withClientIp(request, hops)),
    POST: async (request) => handlers.POST(await withClientIp(request, hops)),
});
