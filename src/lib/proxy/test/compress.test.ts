/**
 * Which relayed bodies the proxy gzips (compress.ts). An event stream goes
 * back as the same unread stream. A short body, and any body for a client
 * that did not ask for gzip, goes back unencoded. `relayBody` is the response
 * forward.ts sends for an upstream one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGunzip, gunzipSync } from 'node:zlib';

import { gzipBody, MIN_BYTES, relayBody } from '../compress.ts';

const JSON_BODY = new TextEncoder().encode(
    JSON.stringify({ rows: Array.from({ length: 200 }, (_, id) => ({ id, name: `row-${id}` })) }),
);

const streamOf = (...chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
    new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(chunk);
            }

            controller.close();
        },
    });

const bytesOf = async (body: Awaited<ReturnType<typeof gzipBody>>): Promise<Uint8Array> =>
    new Uint8Array(await new Response(body).arrayBuffer());

test('gzipBody: gzips a JSON body at level 1 and replaces its length headers', async () => {
    const headers = new Headers({
        'content-type': 'application/json',
        'content-length': String(JSON_BODY.byteLength),
    });
    const sent = await bytesOf(await gzipBody('gzip, deflate, br', streamOf(JSON_BODY), headers));

    assert.deepEqual(new Uint8Array(gunzipSync(sent)), JSON_BODY);
    assert.ok(sent.byteLength < JSON_BODY.byteLength / 2, `sent ${sent.byteLength} bytes`);
    // The gzip header's XFL byte is 4 when zlib runs at its fastest level.
    assert.equal(sent[8], 4);
    assert.equal(headers.get('content-encoding'), 'gzip');
    assert.equal(headers.get('vary'), 'Accept-Encoding');
    assert.equal(headers.get('content-length'), null);
});

test('gzipBody: gzips SDMX-CSV, whose type carries a version parameter', async () => {
    const headers = new Headers({
        'content-type': 'application/vnd.sdmx.data+csv;version=2.0.0',
    });

    await gzipBody('gzip', streamOf(JSON_BODY), headers);

    assert.equal(headers.get('content-encoding'), 'gzip');
});

// Accept-Encoding values that allow gzip (RFC 9110 section 12.5.3).
const GZIP_ACCEPTED = [
    'gzip',
    'GZIP;Q=0.5',
    ' gzip ; q=1 ',
    'x-gzip',
    '*',
    '*;q=1, identity;q=0',
    'br, *;q=0.1',
    'gzip, *;q=0',
    '*;q=0, gzip',
];

for (const accept of GZIP_ACCEPTED) {
    test(`gzipBody: gzips for Accept-Encoding "${accept}"`, async () => {
        const headers = new Headers({ 'content-type': 'application/json' });

        await gzipBody(accept, streamOf(JSON_BODY), headers);

        assert.equal(headers.get('content-encoding'), 'gzip');
    });
}

const UNENCODED: {
    name: string;
    accept: string | null;
    headers: Record<string, string>;
    body: Uint8Array;
}[] = [
    {
        name: 'a client that sent no Accept-Encoding',
        accept: null,
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a client that accepts only other codings',
        accept: 'br, deflate',
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a client that refuses gzip',
        accept: 'gzip;q=0, identity',
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a client whose only wildcard has a zero weight',
        accept: '*;q=0',
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a client that refuses gzip ahead of a wildcard',
        accept: 'gzip;q=0, *',
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a client that refuses gzip ahead of a weighted wildcard',
        accept: 'gzip;q=0, *;q=1',
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a client that refuses x-gzip ahead of a wildcard',
        accept: 'x-gzip;q=0.000, *',
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a client that refuses gzip in capitals after a wildcard',
        accept: '*, GZIP;Q=0.00',
        headers: { 'content-type': 'application/json' },
        body: JSON_BODY,
    },
    {
        name: 'a body one byte under the floor',
        accept: 'gzip',
        headers: { 'content-type': 'application/json', 'content-length': String(MIN_BYTES - 1) },
        body: JSON_BODY.slice(0, MIN_BYTES - 1),
    },
    {
        name: 'a body marked no-transform',
        accept: 'gzip',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store, no-transform' },
        body: JSON_BODY,
    },
    {
        name: 'a type that is already compressed',
        accept: 'gzip',
        headers: { 'content-type': 'application/vnd.apache.parquet' },
        body: JSON_BODY,
    },
];

for (const { name, accept, headers: init, body } of UNENCODED) {
    test(`gzipBody: leaves ${name} unencoded`, async () => {
        const headers = new Headers(init);
        const sent = await bytesOf(await gzipBody(accept, streamOf(body), headers));

        assert.deepEqual(sent, body);
        assert.equal(headers.get('content-encoding'), null);
        assert.equal(headers.get('content-length'), init['content-length'] ?? null);
    });
}

test('gzipBody: leaves a length-less body under the floor unencoded and declares its length', async () => {
    const body = JSON_BODY.slice(0, MIN_BYTES - 1);
    const headers = new Headers({ 'content-type': 'application/json' });
    const sent = await bytesOf(
        await gzipBody('gzip', streamOf(body.slice(0, 10), body.slice(10)), headers),
    );

    assert.deepEqual(sent, body);
    assert.equal(headers.get('content-encoding'), null);
    assert.equal(headers.get('content-length'), String(MIN_BYTES - 1));
});

test('gzipBody: hands an event stream back unread', async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
        {
            pull() {
                pulled = true;
            },
        },
        { highWaterMark: 0 },
    );
    const headers = new Headers({ 'content-type': 'text/event-stream; charset=utf-8' });

    assert.equal(await gzipBody('gzip', body, headers), body);
    assert.equal(pulled, false);
    assert.deepEqual([...headers.keys()], ['content-type']);
});

test('gzipBody: sends each chunk on before the body ends, and cancels the body with the client', async () => {
    let cancelled = false;
    // One chunk, then silence. The body never closes on its own.
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(JSON_BODY);
        },
        cancel() {
            cancelled = true;
        },
    });
    const sent = await gzipBody('gzip', body, new Headers({ 'content-type': 'text/csv' }));

    assert.ok(sent instanceof ReadableStream);

    const reader = sent.getReader();
    const gunzip = createGunzip();
    const decoded: Buffer[] = [];

    gunzip.on('data', (chunk: Buffer) => decoded.push(chunk));

    while (Buffer.concat(decoded).byteLength < JSON_BODY.byteLength) {
        const { done, value } = await reader.read();

        assert.equal(done, false, 'the encoded stream ended before the body did');
        await new Promise((resolve) => gunzip.write(value, resolve));
    }

    assert.deepEqual(new Uint8Array(Buffer.concat(decoded)), JSON_BODY);

    await reader.cancel();
    await new Promise((resolve) => setImmediate(resolve));
    gunzip.destroy();

    assert.ok(cancelled);
});

test('gzipBody: rejects when the upstream fails inside the first chunk', async () => {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.error(new Error('upstream reset'));
        },
    });

    await assert.rejects(
        gzipBody('gzip', body, new Headers({ 'content-type': 'application/json' })),
    );
});

// The timeout turns a wait for the body into a failure.
const settlesAtOnce = { timeout: 1000 };

test(
    'gzipBody: settles on a declared length before the body sends a byte',
    settlesAtOnce,
    async () => {
        let cancelled = false;
        // Headers only. The body never sends a byte and never closes.
        const body = new ReadableStream<Uint8Array>({
            cancel() {
                cancelled = true;
            },
        });
        const headers = new Headers({
            'content-type': 'application/json',
            'content-length': String(MIN_BYTES),
        });
        const sent = await gzipBody('gzip', body, headers);

        assert.ok(sent instanceof ReadableStream);
        assert.equal(headers.get('content-encoding'), 'gzip');
        assert.equal(headers.get('content-length'), null);

        await sent.cancel();
        await new Promise((resolve) => setImmediate(resolve));

        assert.ok(cancelled);
    },
);

const upstreamOf = (body: ReadableStream<Uint8Array>): Response =>
    new Response(body, { status: 207, headers: { 'content-type': 'application/json' } });

const earlyFailure = (): Response => new Response(null, { status: 502 });

test('relayBody: sends a compressible body back untouched when compression is off', async () => {
    const upstream = upstreamOf(streamOf(JSON_BODY));
    const headers = new Headers(upstream.headers);
    const sent = await relayBody({
        accept: 'gzip',
        upstream,
        headers,
        compress: false,
        onEarlyFailure: earlyFailure,
    });

    assert.equal(sent.body, upstream.body);
    assert.equal(sent.status, 207);
    assert.deepEqual([...sent.headers.keys()], ['content-type']);
    assert.deepEqual(await bytesOf(sent.body), JSON_BODY);
});

test('relayBody: answers an upstream that fails before any byte with the early failure', async () => {
    const reset = new Error('upstream reset');
    const upstream = upstreamOf(
        new ReadableStream({
            start(controller) {
                controller.enqueue(JSON_BODY.slice(0, MIN_BYTES - 1));
                controller.error(reset);
            },
        }),
    );
    const failures: unknown[] = [];
    const sent = await relayBody({
        accept: 'gzip',
        upstream,
        headers: new Headers(upstream.headers),
        onEarlyFailure: (error) => {
            failures.push(error);

            return earlyFailure();
        },
    });

    assert.equal(sent.status, 502);
    assert.deepEqual(failures, [reset]);
});

test('relayBody: fails the gzip stream when the upstream fails after it has started', async () => {
    const reset = new Error('upstream reset');
    let chunks = 0;
    const upstream = upstreamOf(
        new ReadableStream(
            {
                pull(controller) {
                    if (chunks++ === 0) {
                        controller.enqueue(JSON_BODY);
                    } else {
                        controller.error(reset);
                    }
                },
            },
            { highWaterMark: 0 },
        ),
    );
    const sent = await relayBody({
        accept: 'gzip',
        upstream,
        headers: new Headers(upstream.headers),
        onEarlyFailure: () => assert.fail('the failure came after the response had started'),
    });

    assert.equal(sent.status, 207);
    assert.equal(sent.headers.get('content-encoding'), 'gzip');
    await assert.rejects(sent.arrayBuffer(), reset);
});
