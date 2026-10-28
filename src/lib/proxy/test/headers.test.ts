/**
 * `headers.ts`: which request and response headers cross the proxy. Every
 * `mcp-*` header goes either way whatever its case, the cleaned x-dfo-client
 * label goes up, and the public x-dfo-trace-id and x-dfo-commit come back;
 * credentials, the caller headers and the other `x-dfo-*` headers are never
 * copied, bar the write token a route asks for in PRESENTATION_HEADERS.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clientResponseHeaders,
    pick,
    PRESENTATION_HEADERS,
    upstreamRequestHeaders,
} from '../headers.ts';

test('upstreamRequestHeaders: carries mcp-method and mcp-name', () => {
    const out = upstreamRequestHeaders(
        new Headers({ 'mcp-method': 'tools/call', 'mcp-name': 'get_data' }),
    );

    assert.equal(out.get('mcp-method'), 'tools/call');
    assert.equal(out.get('mcp-name'), 'get_data');
});

test('upstreamRequestHeaders: carries an mcp-* header it has never heard of', () => {
    const out = upstreamRequestHeaders(new Headers({ 'MCP-Future-Thing': 'x' }));

    assert.equal(out.get('mcp-future-thing'), 'x');
});

test('upstreamRequestHeaders: keeps the content headers and the session and protocol headers', () => {
    const out = upstreamRequestHeaders(
        new Headers({
            'content-type': 'application/json',
            accept: 'text/event-stream',
            'mcp-session-id': 's1',
            'mcp-protocol-version': '2026-07-28',
        }),
    );

    assert.deepEqual(Object.fromEntries(out), {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-session-id': 's1',
    });
});

test("upstreamRequestHeaders: carries the caller's user-agent", () => {
    const out = upstreamRequestHeaders(new Headers({ 'User-Agent': 'dfo-python/0.4.1' }));

    assert.deepEqual(Object.fromEntries(out), { 'user-agent': 'dfo-python/0.4.1' });
});

test('upstreamRequestHeaders: carries x-dfo-client whatever its case', () => {
    for (const name of ['x-dfo-client', 'X-DFO-Client', 'X-Dfo-Client']) {
        const out = upstreamRequestHeaders(
            new Headers({ [name]: 'dfo-python/0.4.1 (CPython 3.12)' }),
        );

        assert.deepEqual(Object.fromEntries(out), {
            'x-dfo-client': 'dfo-python/0.4.1 (CPython 3.12)',
        });
    }
});

test('upstreamRequestHeaders: strips control characters and surrounding space from x-dfo-client', () => {
    const out = upstreamRequestHeaders(
        new Headers({ 'x-dfo-client': ' dfo\x01-py\tthon\x85/0.4\u00ad.1 ' }),
    );

    assert.equal(out.get('x-dfo-client'), 'dfo-python/0.4.1');
});

test('upstreamRequestHeaders: caps x-dfo-client at 256 characters', () => {
    const out = upstreamRequestHeaders(new Headers({ 'x-dfo-client': 'a'.repeat(300) }));

    assert.equal(out.get('x-dfo-client'), 'a'.repeat(256));
});

test('upstreamRequestHeaders: leaves out an x-dfo-client that is empty after cleaning', () => {
    const out = upstreamRequestHeaders(new Headers({ 'x-dfo-client': ' \x01\t\x85 ' }));

    assert.equal(out.has('x-dfo-client'), false);
});

test('upstreamRequestHeaders: drops credentials, x-dfo-* and other headers', () => {
    const out = upstreamRequestHeaders(
        new Headers({
            authorization: 'Bearer client',
            'x-dfo-caller': 'ip:spoofed',
            'x-dfo-caller-principal': 'spoofed',
            'x-dfo-trace-id': 'spoofed',
            'x-dfo-principal': 'user:42',
            'x-dfo-write-token': 'w1',
            'x-dfo-client-ip': '203.0.113.9',
            cookie: 'a=b',
            connection: 'keep-alive',
            'x-mcp-method': 'no',
        }),
    );

    assert.deepEqual([...out], []);
});

test('upstreamRequestHeaders: carries the PRESENTATION_HEADERS a route asks for', () => {
    const client = new Headers({
        'x-dfo-write-token': 'shw_1',
        'if-none-match': '"v1"',
        origin: 'https://example.org',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'if-none-match',
        'x-dfo-caller-principal': 'spoofed',
    });

    assert.deepEqual([...upstreamRequestHeaders(client)], []);
    assert.deepEqual(
        Object.fromEntries(
            upstreamRequestHeaders(client, new Headers(), PRESENTATION_HEADERS.request),
        ),
        {
            'access-control-request-headers': 'if-none-match',
            'access-control-request-method': 'GET',
            'if-none-match': '"v1"',
            origin: 'https://example.org',
            'x-dfo-write-token': 'shw_1',
        },
    );
});

test('clientResponseHeaders: carries the PRESENTATION_HEADERS a route asks for', () => {
    const upstream = new Headers({
        etag: '"v1"',
        vary: 'Origin',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'etag, x-dfo-freshness, x-dfo-checked-at',
        'x-dfo-freshness': 'current',
        'x-dfo-checked-at': '2026-10-29T09:00:00+00:00',
        'x-dfo-write-token': 'shw_1',
    });

    assert.deepEqual([...clientResponseHeaders(upstream)], []);
    assert.deepEqual(
        Object.fromEntries(
            clientResponseHeaders(upstream, new Headers(), PRESENTATION_HEADERS.response),
        ),
        {
            'access-control-allow-origin': '*',
            'access-control-expose-headers': 'etag, x-dfo-freshness, x-dfo-checked-at',
            etag: '"v1"',
            vary: 'Origin',
            'x-dfo-checked-at': '2026-10-29T09:00:00+00:00',
            'x-dfo-freshness': 'current',
        },
    );
});

test('upstreamRequestHeaders: adds to the headers it is given', () => {
    const into = new Headers({ authorization: 'Bearer proxy' });

    upstreamRequestHeaders(new Headers({ 'mcp-name': 'n' }), into);

    assert.equal(into.get('authorization'), 'Bearer proxy');
    assert.equal(into.get('mcp-name'), 'n');
});

test('clientResponseHeaders: carries every mcp-* header and the content headers', () => {
    const out = clientResponseHeaders(
        new Headers({
            'content-type': 'text/event-stream',
            'www-authenticate': 'Bearer',
            'MCP-Session-Id': 's1',
            'mcp-future-thing': 'y',
            server: 'upstream',
            'set-cookie': 'a=b',
        }),
    );

    assert.deepEqual(Object.fromEntries(out), {
        'content-type': 'text/event-stream',
        'mcp-future-thing': 'y',
        'mcp-session-id': 's1',
        'www-authenticate': 'Bearer',
    });
});

test('clientResponseHeaders: carries a file download as the export route serves it', () => {
    const out = clientResponseHeaders(
        new Headers({
            'content-type': 'application/zip',
            'content-disposition': 'attachment; filename="cmp_9f8e.r3.zip"',
            'content-length': '2048',
        }),
    );

    assert.deepEqual(Object.fromEntries(out), {
        'content-disposition': 'attachment; filename="cmp_9f8e.r3.zip"',
        'content-length': '2048',
        'content-type': 'application/zip',
    });
});

test('clientResponseHeaders: keeps the headers already on the target', () => {
    const out = clientResponseHeaders(
        new Headers({ 'mcp-session-id': 's1' }),
        new Headers({ 'Cache-Control': 'no-cache' }),
    );

    assert.equal(out.get('cache-control'), 'no-cache');
    assert.equal(out.get('mcp-session-id'), 's1');
});

test('pick: copies only the named headers that have a value', () => {
    const into = new Headers();

    pick(
        new Headers({ accept: 'a', etag: '', cookie: 'c', 'mcp-name': 'n' }),
        ['accept', 'etag'],
        into,
    );

    assert.deepEqual([...into], [['accept', 'a']]);
});

test("clientResponseHeaders: carries a redirect's Location and no-store over the default, and drops its cookies", () => {
    const out = clientResponseHeaders(
        new Headers({
            location: 'https://storage.googleapis.com/bucket/object?X-Goog-Signature=abc',
            'cache-control': 'no-store',
            'set-cookie': 'a=b',
        }),
        new Headers({ 'Cache-Control': 'no-cache' }),
    );

    assert.deepEqual(Object.fromEntries(out), {
        'cache-control': 'no-store',
        location: 'https://storage.googleapis.com/bucket/object?X-Goog-Signature=abc',
    });
});

test('clientResponseHeaders: carries the Retry-After of a busy refusal', () => {
    const out = clientResponseHeaders(
        new Headers({ 'content-type': 'application/problem+json', 'retry-after': '5' }),
    );

    assert.equal(out.get('retry-after'), '5');
});

test('clientResponseHeaders: carries Server-Timing and the public x-dfo-* headers, and drops the identity ones', () => {
    const out = clientResponseHeaders(
        new Headers({
            'server-timing': 'snapshot_state;dur=28.1, mint;dur=60',
            'X-DFO-Trace-Id': 'abc123',
            'x-dfo-commit': '8f4196c',
            'x-dfo-principal': 'user:42',
            'x-dfo-caller': 'ip:abc',
            'x-dfo-write-token': 'w1',
            'x-request-id': 'r1',
        }),
    );

    assert.deepEqual(Object.fromEntries(out), {
        'server-timing': 'snapshot_state;dur=28.1, mint;dur=60',
        'x-dfo-commit': '8f4196c',
        'x-dfo-trace-id': 'abc123',
    });
});

test('clientResponseHeaders: carries the Allow of a 405', () => {
    const out = clientResponseHeaders(new Headers({ Allow: 'GET, HEAD' }));

    assert.deepEqual(Object.fromEntries(out), { allow: 'GET, HEAD' });
});

test('clientResponseHeaders: leaves the content-length of an encoded body behind', () => {
    const encoded = { 'content-type': 'application/json', 'content-length': '512' };

    assert.equal(clientResponseHeaders(new Headers(encoded)).get('content-length'), '512');
    assert.equal(
        clientResponseHeaders(new Headers({ ...encoded, 'content-encoding': 'gzip' })).get(
            'content-length',
        ),
        null,
    );
});
