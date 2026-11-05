/**
 * `forward()` relays an upstream body as fetch decoded it. Next drops a route
 * handler's Content-Encoding, so a body the proxy encoded itself would reach
 * the client as unlabelled bytes. A body that fails before its first byte is
 * answered with a 502, and one that fails later reaches the client streamed.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import type { NextRequest } from 'next/server';

const { forward } = await import('../forward.ts');

// Over 1 KiB of JSON, so any size threshold for compression is passed.
const JSON_BODY = Buffer.from(
    JSON.stringify({ rows: Array.from({ length: 200 }, (_, id) => ({ id, name: `row-${id}` })) }),
);

// The upstream responses held open, by path, for a test to finish.
const held = new Map<string, ServerResponse>();

// The upstream, one behaviour per path. /gzip gzips its body and labels it,
// as dfo-apis may. /reset sends headers and closes before any body byte.
// /fails-later sends one chunk and is held. /empty sends no body. /events
// sends event-stream headers and is held.
const upstream = createServer((req, res) => {
    switch (req.url) {
        case '/gzip': {
            const encoded = gzipSync(JSON_BODY);

            res.writeHead(200, {
                'content-type': 'application/json',
                'content-encoding': 'gzip',
                'content-length': encoded.byteLength,
            });
            res.end(encoded);
            break;
        }
        case '/reset':
            res.writeHead(200, { 'content-type': 'application/json' });
            res.flushHeaders();
            // The chunked body never ends, so fetch fails the body.
            res.socket?.end();
            break;
        case '/fails-later':
            res.writeHead(200, { 'content-type': 'application/json' });
            res.write('{"rows": [');
            held.set(req.url, res);
            break;
        case '/empty':
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end();
            break;
        case '/events':
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            res.flushHeaders();
            held.set(req.url, res);
            break;
        default:
            res.writeHead(404).end();
    }
});

upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
test.after(() => {
    upstream.closeAllConnections();
    upstream.close();
});

const base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

const call = (path: string, headers: Record<string, string> = {}): Promise<Response> =>
    forward(new Request(`http://site.test/api/v1${path}`, { headers }) as NextRequest, {
        target: `${base}${path}`,
        unreachable: 'The API is unreachable.',
    });

for (const acceptEncoding of ['gzip, deflate, br', null]) {
    test(`forward: relays a JSON body unencoded, Accept-Encoding ${acceptEncoding}`, async () => {
        const res = await call(
            '/gzip',
            acceptEncoding ? { 'accept-encoding': acceptEncoding } : {},
        );

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-encoding'), null);
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), JSON_BODY);
    });
}

test('forward: answers a body that fails before its first byte with a logged 502', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const res = await call('/reset');

    assert.equal(res.status, 502);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');

    const doc = await res.json();

    assert.equal(doc.code, 'transient_unavailable');
    assert.equal(doc.upstream_status, 200);
    assert.equal(logged.mock.callCount(), 1);
});

test('forward: streams a body that fails after its first chunk, ending it in an error', async () => {
    const res = await call('/fails-later');

    assert.equal(res.status, 200);

    const reader = res.body!.getReader();
    const first = await reader.read();

    assert.equal(Buffer.from(first.value!).toString(), '{"rows": [');
    held.get('/fails-later')!.socket?.end();
    await assert.rejects(reader.read());
});

test('forward: relays an empty body as a 200 with no bytes', async () => {
    const res = await call('/empty');

    assert.equal(res.status, 200);
    assert.equal((await res.arrayBuffer()).byteLength, 0);
});

// A peek would wait for the first event, which is only sent once forward()
// resolves, so the timeout turns that deadlock into a failure.
test(
    'forward: relays an event stream unread, answering before its first event',
    {
        timeout: 2000,
    },
    async () => {
        const res = await call('/events');
        const events = held.get('/events')!;
        const reader = res.body!.getReader();

        events.write('data: first\n\n');
        assert.equal(Buffer.from((await reader.read()).value!).toString(), 'data: first\n\n');

        events.end();
        assert.equal((await reader.read()).done, true);
    },
);
