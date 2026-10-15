/**
 * `requestLog.ts`: which requests are logged and as what, and that the line
 * carries the caller digest but no raw address or query string.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

// caller.ts reads its settings at import, so set them before loading it.
process.env.CALLER_HMAC_KEY = 'test-key';
process.env.TRUSTED_PROXY_HOPS = '2';

const { logRequest, requestKind } = await import('../requestLog.ts');

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
