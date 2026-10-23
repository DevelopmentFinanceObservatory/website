/**
 * `requestLog.ts`: which requests are logged and as what, and that the line
 * carries the caller digest, the response status and the bot verdict but no
 * raw address, query string or user agent.
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

const { logRequest, registerRequestLogging, requestKind, requestLogEntry } =
    await import('../requestLog.ts');

const VISITOR = '203.0.113.7';
const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

test('requestKind: pages, API calls, RSC and prefetch requests', () => {
    const cases: [string, Record<string, string>, string | undefined][] = [
        ['/', {}, 'page'],
        ['/embed/abc123', {}, 'page'],
        ['/docs/guide.md', {}, 'page'],
        ['/api/v1/search', {}, 'api'],
        ['/api', {}, 'api'],
        ['/mcp', {}, 'api'],
        ['/openapi.json', {}, 'api'],
        ['/codes/rate_limited', {}, 'api'],
        ['/apiary', {}, 'page'],
        ['/codes', {}, 'api'],
        ['/codesign', {}, 'page'],
        ['/openapi.jsonx', {}, 'page'],
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
        const entry = requestLogEntry(
            { url: 'https://developmentfinance.org/', method: 'GET', headers },
            undefined,
            200,
        );

        assert.equal(entry?.bot, bot, String(userAgent));
    }
});

const captureLog = (request: Request, status = 200): unknown[] => {
    const lines: unknown[] = [];
    const original = console.log;

    console.log = (line: string) => lines.push(JSON.parse(line));

    try {
        logRequest(request, status);
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
            'user-agent': CHROME,
            'x-forwarded-for': `${VISITOR}, 198.51.100.1, 192.0.2.1`,
            'cf-connecting-ip': VISITOR,
            cookie: 'session=s3cret',
            authorization: 'Bearer t0ken',
        },
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
            bot: false,
        },
    ]);

    const text = JSON.stringify(lines);

    for (const secret of [VISITOR, 'secret', 'token', 's3cret', 't0ken', 'Mozilla']) {
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

    assert.doesNotThrow(() => logRequest(request, 200));
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
                bot: true,
            },
        ]);
    },
);
