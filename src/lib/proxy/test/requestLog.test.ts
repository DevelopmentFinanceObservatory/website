/**
 * `requestLog.ts`: which requests are logged and as what, and that the line
 * carries the caller digest but no raw address or query string.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer, IncomingMessage, request as httpRequest } from 'node:http';
import { Socket } from 'node:net';
import test from 'node:test';

// caller.ts reads its settings at import, so set them before loading it.
process.env.CALLER_HMAC_KEY = 'test-key';
process.env.TRUSTED_PROXY_HOPS = '2';

const { logRequest, registerRequestLogging, requestKind } = await import('../requestLog.ts');

const VISITOR = '203.0.113.7';

test('requestKind: pages, API calls, RSC and prefetch requests', () => {
    const cases: [string, Record<string, string>, string | undefined][] = [
        ['/', {}, 'page'],
        ['/embed/abc123', {}, 'page'],
        ['/docs/guide.md', {}, 'page'],
        ['/api/v1/search', {}, 'api'],
        ['/api', {}, 'api'],
        ['/mcp', {}, 'api'],
        ['/apiary', {}, 'page'],
        ['/studio', { rsc: '1' }, 'rsc'],
        ['/studio', { rsc: '1', 'next-router-prefetch': '1' }, 'prefetch'],
        ['/studio', { 'sec-purpose': 'prefetch;prerender' }, 'prefetch'],
        ['/studio', { purpose: 'prefetch' }, 'prefetch'],
        ['/_next/static/chunks/main.js', {}, undefined],
        ['/_next/image', {}, undefined],
        ['/favicon.ico', {}, undefined],
        ['/images/logo.SVG', {}, undefined],
        ['/fonts/outfit.woff2', {}, undefined],
    ];

    for (const [path, headers, kind] of cases) {
        assert.equal(requestKind(path, new Headers(headers)), kind, path);
    }
});

const captureLog = (request: Request): unknown[] => {
    const lines: unknown[] = [];
    const original = console.log;

    console.log = (line: string) => lines.push(JSON.parse(line));

    try {
        logRequest(request);
    } finally {
        console.log = original;
    }

    return lines;
};

test('logRequest: one line with the caller digest and no address or query', () => {
    const raw = 'q=secret+search&token=abc';
    const request = new Request(`https://developmentfinance.org/embed/abc123?${raw}`, {
        headers: {
            host: 'developmentfinance.org',
            'user-agent': 'Mozilla/5.0',
            'x-forwarded-for': `${VISITOR}, 198.51.100.1, 192.0.2.1`,
            'cf-connecting-ip': VISITOR,
            cookie: 'session=s3cret',
            authorization: 'Bearer t0ken',
        },
    });
    const digest = createHmac('sha256', 'test-key').update(VISITOR).digest('hex').slice(0, 32);

    const lines = captureLog(request);

    assert.deepEqual(lines, [
        {
            severity: 'INFO',
            message: 'request',
            caller: `ip:${digest}`,
            method: 'GET',
            path: '/embed/abc123',
            host: 'developmentfinance.org',
            kind: 'page',
            userAgent: 'Mozilla/5.0',
        },
    ]);

    const text = JSON.stringify(lines);

    for (const secret of [VISITOR, 'secret', 'token', 's3cret', 't0ken']) {
        assert.ok(!text.includes(secret), secret);
    }
});

test('logRequest: a static asset writes nothing', () => {
    assert.deepEqual(captureLog(new Request('https://developmentfinance.org/icon.svg')), []);
});

test('logRequest: no client address logs a null caller', () => {
    const [line] = captureLog(new Request('https://developmentfinance.org/api/events'));

    assert.equal((line as { caller: unknown }).caller, null);
});

test('logRequest: malformed raw URLs keep the query out of error output', (t) => {
    const errors: unknown[][] = [];
    t.mock.method(console, 'error', (...args: unknown[]) => errors.push(args));
    const request = new IncomingMessage(new Socket());
    request.url = '//%zz/path?token=private-query';

    assert.doesNotThrow(() => logRequest(request));
    assert.deepEqual(errors, [['request log failed']]);
});

test('server logging catches a request accepted during startup with its original headers', async (t) => {
    const lines: unknown[] = [];
    t.mock.method(console, 'log', (line: string) => lines.push(JSON.parse(line)));
    const server = createServer((request, response) => {
        // Next.js may normalise these headers before a startup request finishes.
        delete request.headers.rsc;
        delete request.headers['x-forwarded-for'];
        registerRequestLogging();
        response.end('ok');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
        server.closeAllConnections();
        server.close();
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const response = await fetch(`http://127.0.0.1:${address.port}/studio?token=private-query`, {
        headers: {
            rsc: '1',
            'x-forwarded-for': `${VISITOR}, 198.51.100.1, 192.0.2.1`,
        },
    });
    assert.equal(await response.text(), 'ok');
    assert.equal(lines.length, 1);
    assert.equal((lines[0] as { kind: string }).kind, 'rsc');
    assert.equal((lines[0] as { path: string }).path, '/studio');
    assert.equal(
        (lines[0] as { caller: string }).caller,
        `ip:${createHmac('sha256', 'test-key').update(VISITOR).digest('hex').slice(0, 32)}`,
    );
});

test(
    'server logging preserves a streamed body over 10 MiB and logs it once',
    { timeout: 10_000 },
    async (t) => {
        const lines: unknown[] = [];
        t.mock.method(console, 'log', (line: string) => lines.push(JSON.parse(line)));
        registerRequestLogging();
        registerRequestLogging();

        const firstChunk = Promise.withResolvers<void>();
        const server = createServer(async (request, response) => {
            assert.equal(request.readableFlowing, null);
            const hash = createHash('sha256');
            let bytes = 0;

            for await (const chunk of request) {
                bytes += chunk.length;
                hash.update(chunk);
                firstChunk.resolve();
            }

            response.end(JSON.stringify({ bytes, digest: hash.digest('hex') }));
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        t.after(() => {
            server.closeAllConnections();
            server.close();
        });
        const address = server.address();
        assert.ok(address && typeof address === 'object');

        const upload = httpRequest({
            host: '127.0.0.1',
            port: address.port,
            method: 'POST',
            path: '/mcp?token=private-query',
            headers: {
                host: 'developmentfinance.org',
                'user-agent': 'body-test',
                'x-forwarded-for': `${VISITOR}, 198.51.100.1, 192.0.2.1`,
                cookie: 'session=private-cookie',
                authorization: 'Bearer private-token',
            },
        });
        t.after(() => upload.destroy());
        const responseReady = once(upload, 'response');
        const head = Buffer.alloc(64 * 1024, 'a');
        const tail = Buffer.alloc(11 * 1024 * 1024 - head.length, 'b');
        upload.write(head);

        // The handler must receive data while the client is still uploading.
        await firstChunk.promise;
        upload.end(tail);
        const [response] = await responseReady;
        let body = '';

        for await (const chunk of response) {
            body += chunk;
        }

        assert.equal(response.statusCode, 200);
        assert.deepEqual(JSON.parse(body), {
            bytes: head.length + tail.length,
            digest: createHash('sha256').update(head).update(tail).digest('hex'),
        });
        assert.deepEqual(lines, [
            {
                severity: 'INFO',
                message: 'request',
                caller: `ip:${createHmac('sha256', 'test-key').update(VISITOR).digest('hex').slice(0, 32)}`,
                method: 'POST',
                path: '/mcp',
                host: 'developmentfinance.org',
                kind: 'api',
                userAgent: 'body-test',
            },
        ]);
    },
);
