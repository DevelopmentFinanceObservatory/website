/**
 * Gzip for the platform proxy's relayed bodies (src/lib/proxy/forward). Kept
 * apart from forward.ts, which imports server-only, so `node --test` can
 * load it.
 *
 * Next's own `compress` skips every route-handler response: it copies a
 * handler's headers onto the Node response as arrays, and its compression
 * middleware reads an array content-type as a type it cannot compress. A
 * body gzipped here carries Content-Encoding, which that middleware leaves
 * alone.
 *
 * A body is gzipped when the client accepts gzip, its type is text, JSON,
 * XML or CSV, and it is at least MIN_BYTES long. An event stream has none of
 * those types, so it goes back as the same stream, unread.
 */
import { pipeline, Readable } from 'node:stream';
import { constants, createGzip } from 'node:zlib';

// Under this a gzip saves too few bytes to pay for its CPU.
export const MIN_BYTES = 1024;

// Level 1 costs a fraction of the default's CPU for nearly the same saving
// on JSON. The sync flush after every chunk sends each one on as it arrives,
// so a chunked download is never held back for a full zlib block.
const GZIP_OPTIONS = { level: 1, flush: constants.Z_SYNC_FLUSH };

// text/* other than an event stream, JSON, XML, and any +json, +xml or +csv
// type (SDMX-CSV is application/vnd.sdmx.data+csv).
const COMPRESSIBLE =
    /^(?:text\/(?!event-stream)[^;\s]+|application\/(?:json|xml)|[^;\s]+\+(?:json|xml|csv))\s*(?:;|$)/i;

const NO_TRANSFORM = /(?:^|,)\s*no-transform\s*(?:,|$)/i;

// Whether an Accept-Encoding header allows gzip (RFC 9110 section 12.5.3). An
// explicit gzip or x-gzip entry decides by its weight, and a zero weight
// refuses gzip whatever a wildcard says. With no such entry, a `*` entry
// decides by its weight. With neither, gzip is not acceptable.
const acceptsGzip = (accept: string | null): boolean => {
    const entries = (accept ?? '').split(',').map((entry) => {
        const [coding, ...params] = entry.split(';').map((part) => part.trim().toLowerCase());

        return { coding, allowed: !params.some((param) => /^q=0(?:\.0*)?$/.test(param)) };
    });
    const explicit = entries.filter(({ coding }) => coding === 'gzip' || coding === 'x-gzip');
    const decisive =
        explicit.length > 0 ? explicit : entries.filter(({ coding }) => coding === '*');

    return decisive.length > 0 && decisive.every(({ allowed }) => allowed);
};

// The chunks already read, then the rest of the body, as a Node stream.
// Destroying it cancels the body, a read in flight included, so an upstream
// that has gone quiet is released when the client leaves.
const remaining = (
    head: Uint8Array[],
    reader: ReadableStreamDefaultReader<Uint8Array>,
): Readable => {
    const stream = new Readable({
        read() {
            reader.read().then(
                ({ done, value }) => this.push(done ? null : value),
                (error: Error) => this.destroy(error),
            );
        },
        destroy(error, callback) {
            reader.cancel(error).then(
                () => callback(error),
                () => callback(error),
            );
        },
    });

    for (const chunk of head) {
        stream.push(chunk);
    }

    return stream;
};

/**
 * The body to send a client for an upstream `body`, gzipped when the rules
 * above allow it. `headers` are the response's own and are updated to match:
 * Vary on every compressible type that carries no `no-transform`, then either
 * Content-Encoding without a Content-Length, or the exact Content-Length of a
 * body that turned out shorter than MIN_BYTES.
 *
 * A Content-Length of MIN_BYTES or more settles the choice before any byte is
 * read. Any other body is read up to MIN_BYTES first, so the returned promise
 * settles once that much has arrived or the body ends, and rejects if the
 * upstream fails first.
 */
export const gzipBody = async (
    accept: string | null,
    body: ReadableStream<Uint8Array> | null,
    headers: Headers,
): Promise<ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer> | null> => {
    if (
        !body ||
        !COMPRESSIBLE.test(headers.get('content-type') ?? '') ||
        NO_TRANSFORM.test(headers.get('cache-control') ?? '')
    ) {
        return body;
    }

    headers.append('Vary', 'Accept-Encoding');

    if (!acceptsGzip(accept)) {
        return body;
    }

    // `headers` holds a Content-Length only for a body the upstream sent
    // unencoded (dropEncodedLength in headers.ts), so it counts these bytes.
    const longEnough = Number(headers.get('content-length')) >= MIN_BYTES;
    const reader = body.getReader();
    const head: Uint8Array[] = [];
    let size = 0;

    while (!longEnough && size < MIN_BYTES) {
        const { done, value } = await reader.read();

        if (done) {
            headers.set('content-length', String(size));

            return Buffer.concat(head);
        }

        head.push(value);
        size += value.byteLength;
    }

    headers.set('Content-Encoding', 'gzip');
    headers.delete('content-length');

    // pipeline tears both streams down when either fails or the client goes
    // away. The failure reaches the client through the returned stream.
    const gzip = pipeline(remaining(head, reader), createGzip(GZIP_OPTIONS), () => {});

    return Readable.toWeb(gzip) as ReadableStream<Uint8Array>;
};

type Relay = {
    // The client's Accept-Encoding.
    accept: string | null;
    upstream: Response;
    // The headers to send back, updated as gzipBody describes.
    headers: Headers;
    // False sends every body back unencoded, whatever its type.
    compress?: boolean;
    // What to answer when the body fails before any of it is sent.
    onEarlyFailure: (error: unknown) => Response;
};

/** The response to send a client for an `upstream` one. */
export const relayBody = async ({
    accept,
    upstream,
    headers,
    compress,
    onEarlyFailure,
}: Relay): Promise<Response> => {
    if (compress === false) {
        return new Response(upstream.body, { status: upstream.status, headers });
    }

    try {
        const body = await gzipBody(accept, upstream.body, headers);

        return new Response(body, { status: upstream.status, headers });
    } catch (error) {
        return onEarlyFailure(error);
    }
};
