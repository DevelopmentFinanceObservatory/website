/**
 * `requestLog.ts`: which requests are logged and as what, and that the line
 * carries the caller digest, the response status and the bot verdict but no
 * raw address, query string or user agent.
 */
import assert from 'node:assert/strict';
import crypto, { createHash, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer, IncomingMessage, request as httpRequest } from 'node:http';
import { Socket } from 'node:net';
import test from 'node:test';
import { syncBuiltinESMExports } from 'node:module';

// caller.ts reads its settings at import, so set them before loading it.
process.env.CALLER_HMAC_KEY = 'test-key';
process.env.TRUSTED_PROXY_HOPS = '2';

const { isStaticAsset, logRequest, registerRequestLogging, requestLogEntry } =
    await import('../requestLog.ts');

const VISITOR = '203.0.113.7';
const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

test('requestLogEntry: kind and prerender for pages, API calls, RSC, prefetch and prerender requests', () => {
    const cases: [string, Record<string, string>, string, boolean][] = [
        ['/', {}, 'page', false],
        ['/embed/abc123', {}, 'page', false],
        ['/docs/guide.md', {}, 'page', false],
        ['/api/v1/search', {}, 'api', false],
        ['/api', {}, 'api', false],
        ['/mcp', {}, 'api', false],
        ['/openapi.json', {}, 'api', false],
        ['/codes/rate_limited', {}, 'api', false],
        ['/apiary', {}, 'page', false],
        ['/codes', {}, 'api', false],
        ['/codesign', {}, 'page', false],
        ['/openapi.jsonx', {}, 'page', false],
        ['/mcp', { 'sec-purpose': 'prefetch;prerender' }, 'api', false],
        ['/studio', { rsc: '1' }, 'rsc', false],
        ['/studio', { rsc: '1', 'next-router-prefetch': '1' }, 'prefetch', false],
        ['/studio', { 'sec-purpose': 'prefetch' }, 'prefetch', false],
        ['/studio', { purpose: 'prefetch' }, 'prefetch', false],
        ['/studio', { 'sec-purpose': 'prefetch;prerender' }, 'page', true],
        ['/studio', { 'sec-purpose': 'prefetch; prerender' }, 'page', true],
        ['/studio', { rsc: '1', 'sec-purpose': 'prefetch;prerender' }, 'rsc', false],
        ['/studio', { rsc: '1', 'sec-purpose': 'prefetch' }, 'rsc', false],
        [
            '/studio',
            { 'next-router-prefetch': '1', 'sec-purpose': 'prefetch;prerender' },
            'prefetch',
            false,
        ],
    ];

    for (const [path, headers, kind, prerender] of cases) {
        const entry = requestLogEntry(
            { path, method: 'GET', headers: new Headers(headers) },
            undefined,
            {
                status: 200,
                finished: true,
            },
        );

        assert.deepEqual(
            { kind: entry.kind, prerender: entry.prerender },
            { kind, prerender },
            `${path} ${JSON.stringify(headers)}`,
        );
    }
});

test('isStaticAsset: framework files, images and fonts', () => {
    const cases: [string, boolean][] = [
        ['/_next/static/chunks/main.js', true],
        ['/_next/image', true],
        ['/favicon.ico', true],
        ['/images/logo.SVG', true],
        ['/fonts/outfit.woff2', true],
        ['/', false],
        ['/docs/guide.md', false],
        ['/api/v1/search', false],
    ];

    for (const [path, expected] of cases) {
        assert.equal(isStaticAsset(path), expected, path);
    }
});

test('requestLogEntry: bot is true for crawlers, tools and a missing user agent, false for browsers', () => {
    // Recorded from the prod request log, plus a headless browser and missing and empty headers.
    const cases: [string | undefined, boolean][] = [
        ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', true],
        ['Mozilla/5.0 (compatible; ExaSearchBot/1.0; +https://crawler.exa.ai/)', true],
        [
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
            true,
        ],
        [
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36',
            true,
        ],
        [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
            true,
        ],
        [
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; KeenableBot/1.0; +https://keenable.ai/bot)',
            true,
        ],
        ['curl/8.7.1', true],
        [
            'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.52 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            true,
        ],
        ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', true],
        ['Slack-ImgProxy (+https://api.slack.com/robots)', true],
        ['Mozilla/5.0 (compatible; wpbot/1.4; +https://forms.gle/ajBaxygz9jSR8p8G9)', true],
        [
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
            true,
        ],
        [
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Reflectionbot/1.0; +https://reflection.ai/bot) Chrome/151.0.0.0 Safari/537.36',
            true,
        ],
        [
            'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
            true,
        ],
        [
            'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com',
            true,
        ],
        ['Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', true],
        [
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
            true,
        ],
        ['Chrome Privacy Preserving Prefetch Proxy', true],
        ['Mozilla/5.0 (compatible)', true],
        [
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
            true,
        ],
        [undefined, true],
        ['', true],
        [CHROME, false],
        [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
            false,
        ],
        ['Mozilla/5.0 (X11; Linux x86_64; rv:155.0) Gecko/20100101 Firefox/155.0', false],
        [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2.1 Mobile/15E148 Safari/604.1',
            false,
        ],
        [
            'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
            false,
        ],
        [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
            false,
        ],
    ];

    for (const [userAgent, bot] of cases) {
        const headers = new Headers(userAgent === undefined ? {} : { 'user-agent': userAgent });
        const entry = requestLogEntry({ path: '/', method: 'GET', headers }, undefined, {
            status: 200,
            finished: true,
        });

        assert.equal(entry.bot, bot, String(userAgent));
    }
});

// A server request as the HTTP parser hands it over: a raw target and raw headers.
const serverRequest = (target: string, headers: Record<string, string> = {}): IncomingMessage => {
    const request = new IncomingMessage(new Socket());
    request.url = target;
    request.method = 'GET';
    request.rawHeaders = Object.entries(headers).flat();

    return request;
};

const captureLog = (request: IncomingMessage, status = 200): unknown[] => {
    const lines: unknown[] = [];
    const original = console.log;

    console.log = (line: string) => lines.push(JSON.parse(line));

    try {
        logRequest(request, { status, finished: true });
    } finally {
        console.log = original;
    }

    return lines;
};

test('logRequest: one line with the caller digest and no address or query', () => {
    const raw = 'q=secret+search&token=abc';
    const request = serverRequest(`/embed/abc123?${raw}`, {
        host: 'developmentfinance.org',
        'user-agent': CHROME,
        'x-forwarded-for': `${VISITOR}, 198.51.100.1, 192.0.2.1`,
        'cf-connecting-ip': VISITOR,
        cookie: 'session=s3cret',
        authorization: 'Bearer t0ken',
    });
    const digest = createHmac('sha256', 'test-key').update(VISITOR).digest('hex').slice(0, 32);

    const lines = captureLog(request, 404);

    assert.deepEqual(lines, [
        {
            severity: 'INFO',
            message: 'request',
            caller: `ip:${digest}`,
            method: 'GET',
            path: '/embed/abc123',
            host: 'developmentfinance.org',
            kind: 'page',
            status: 404,
            finished: true,
            bot: false,
            prerender: false,
        },
    ]);

    const text = JSON.stringify(lines);

    for (const secret of [VISITOR, 'secret', 'token', 's3cret', 't0ken', 'Mozilla']) {
        assert.ok(!text.includes(secret), secret);
    }
});

test('logRequest: no client address logs a null caller', () => {
    const [line] = captureLog(serverRequest('/api/events'));

    assert.equal((line as { caller: unknown }).caller, null);
});

test('logRequest: the path is the target without its query, resolved, with //mcp kept as a path, * as itself and an unparsable URL cut at its query', () => {
    // [target, logged path or null for a dropped static asset, kind]
    const cases: [string, string | null, string][] = [
        ['//mcp', '//mcp', 'page'],
        ['//api/v1/search?q=secret', '//api/v1/search', 'page'],
        ['/api/v1/search?q=secret#frag', '/api/v1/search', 'api'],
        ['/embed/abc123', '/embed/abc123', 'page'],
        ['/a/../mcp', '/mcp', 'api'],
        ['/x/../_next/static/a.js', null, 'page'],
        ['http://host/_next/static/x.js', null, 'page'],
        ['https://host/api/v1/search?q=secret', '/api/v1/search', 'api'],
        ['*', '*', 'page'],
        ['http://[bad/path?q=secret#frag', 'http://[bad/path', 'page'],
    ];

    for (const [target, path, kind] of cases) {
        const lines = captureLog(serverRequest(target, { host: 'developmentfinance.org' }));

        assert.deepEqual(
            lines.map((line) => ({
                path: (line as { path: string }).path,
                kind: (line as { kind: string }).kind,
            })),
            path === null ? [] : [{ path, kind }],
            target,
        );
    }
});

test('logRequest: a static asset reads no headers and computes no caller digest', (t) => {
    const hmac = t.mock.method(crypto, 'createHmac');
    syncBuiltinESMExports();
    t.after(() => {
        hmac.mock.restore();
        syncBuiltinESMExports();
    });
    const headers = { 'X-Forwarded-For': `${VISITOR}, 198.51.100.1, 192.0.2.1` };
    const asset = serverRequest('/_next/static/chunks/main.js', headers);
    let headerReads = 0;
    Object.defineProperty(asset, 'rawHeaders', {
        get: () => {
            headerReads += 1;
            return [];
        },
    });

    assert.deepEqual(captureLog(asset), []);
    assert.equal(headerReads, 0);
    assert.equal(hmac.mock.callCount(), 0);

    // Control: a logged request makes the same mock count the digest.
    assert.equal(captureLog(serverRequest('/studio', headers)).length, 1);
    assert.equal(hmac.mock.callCount(), 1);
});

test('logRequest: a logging fault does not throw and keeps request data out of the error', (t) => {
    const errors: unknown[][] = [];
    t.mock.method(console, 'error', (...args: unknown[]) => errors.push(args));
    t.mock.method(console, 'log', () => {
        throw new Error('GET /studio?token=private-query');
    });

    assert.doesNotThrow(() =>
        logRequest(serverRequest('/studio?token=private-query'), {
            status: 200,
            finished: true,
        }),
    );
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
        response.statusCode = 404;
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
            'user-agent': 'curl/8.7.1',
            'x-forwarded-for': `${VISITOR}, 198.51.100.1, 192.0.2.1`,
        },
    });
    assert.equal(await response.text(), 'ok');
    assert.equal(lines.length, 1);
    assert.equal((lines[0] as { kind: string }).kind, 'rsc');
    assert.equal((lines[0] as { status: number }).status, 404);
    assert.equal((lines[0] as { bot: boolean }).bot, true);
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
        // A dev reload evaluates the module again, so its subscriber is a new function.
        const reloadedModule = '../requestLog.ts?reload';
        const reloaded = (await import(reloadedModule)) as typeof import('../requestLog.ts');
        registerRequestLogging();
        reloaded.registerRequestLogging();

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
                status: 200,
                finished: true,
                bot: true,
                prerender: false,
            },
        ]);
    },
);

const listen = async (
    t: test.TestContext,
    handler: Parameters<typeof createServer>[1],
): Promise<number> => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
        server.closeAllConnections();
        server.close();
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    return address.port;
};

test('server logging writes one line with finished true for a response that finishes', async (t) => {
    const lines: unknown[] = [];
    t.mock.method(console, 'log', (line: string) => lines.push(JSON.parse(line)));
    registerRequestLogging();
    const closed = Promise.withResolvers<void>();
    const port = await listen(t, (_request, response) => {
        response.once('close', () => closed.resolve());
        response.end('ok');
    });

    await (await fetch(`http://127.0.0.1:${port}/studio`)).text();
    // The close event follows the finish event, and must write nothing more.
    await closed.promise;

    assert.deepEqual(
        lines.map((line) => (line as { finished: boolean }).finished),
        [true],
    );
});

test(
    'server logging writes one line with finished false for a response closed early',
    { timeout: 5000 },
    async (t) => {
        const lines: unknown[] = [];
        const logged = Promise.withResolvers<void>();
        t.mock.method(console, 'log', (line: string) => {
            lines.push(JSON.parse(line));
            logged.resolve();
        });
        registerRequestLogging();
        const closed = Promise.withResolvers<void>();
        const port = await listen(t, (_request, response) => {
            response.once('close', () => closed.resolve());
            // Headers and a first chunk go out, and the stream never ends.
            response.write('first chunk');
        });

        const upload = httpRequest({
            host: '127.0.0.1',
            port,
            path: '/mcp?token=private-query',
            headers: { 'user-agent': 'stream-test' },
        });
        const responseReady = once(upload, 'response');
        upload.end();
        const [response] = await responseReady;
        await once(response, 'data');
        upload.destroy();
        await closed.promise;
        await logged.promise;

        assert.equal(lines.length, 1);
        assert.deepEqual(
            {
                path: (lines[0] as { path: string }).path,
                kind: (lines[0] as { kind: string }).kind,
                status: (lines[0] as { status: number }).status,
                finished: (lines[0] as { finished: boolean }).finished,
            },
            { path: '/mcp', kind: 'api', status: 200, finished: false },
        );
    },
);

test(
    'server logging writes status 499 for a response closed before its headers were sent',
    { timeout: 5000 },
    async (t) => {
        const lines: unknown[] = [];
        const logged = Promise.withResolvers<void>();
        t.mock.method(console, 'log', (line: string) => {
            lines.push(JSON.parse(line));
            logged.resolve();
        });
        registerRequestLogging();
        const received = Promise.withResolvers<void>();
        const port = await listen(t, () => {
            // The handler sends nothing, not even the headers.
            received.resolve();
        });

        const upload = httpRequest({ host: '127.0.0.1', port, path: '/studio' });
        upload.on('error', () => {});
        upload.end();
        await received.promise;
        upload.destroy();
        await logged.promise;

        assert.equal(lines.length, 1);
        assert.deepEqual(
            {
                path: (lines[0] as { path: string }).path,
                status: (lines[0] as { status: number }).status,
                finished: (lines[0] as { finished: boolean }).finished,
            },
            { path: '/studio', status: 499, finished: false },
        );
    },
);

test('server logging logs the target as it arrived when a handler rewrites request.url', async (t) => {
    const lines: unknown[] = [];
    t.mock.method(console, 'log', (line: string) => lines.push(JSON.parse(line)));
    registerRequestLogging();
    const port = await listen(t, (request, response) => {
        request.url = '/_next/static/rewritten.js';
        response.end('ok');
    });

    await (await fetch(`http://127.0.0.1:${port}/mcp?token=private-query`)).text();

    assert.deepEqual(
        lines.map((line) => ({
            path: (line as { path: string }).path,
            kind: (line as { kind: string }).kind,
        })),
        [{ path: '/mcp', kind: 'api' }],
    );
});
