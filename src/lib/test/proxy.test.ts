/**
 * `src/proxy.ts`: which paths its matcher runs on, and that a page load or an
 * RSC fetch gets a `dfo_v` cookie beside the /data and Graph Explorer
 * handling.
 */
import './serverModules.ts';

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server.js';
import { NextRequest } from 'next/server.js';

// src/proxy.ts imports `next/server` as Next's bundler resolves it; Node
// needs the file name.
registerHooks({
    resolve: (specifier, context, nextResolve) =>
        nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context),
});

process.env.CALLER_HMAC_KEY = 'test-caller-key';

const { config, proxy } = await import('../../proxy.ts');
const { readVisitor } = await import('../proxy/visitor.ts');

const matches = (path: string) =>
    unstable_doesMiddlewareMatch({ config, url: `https://developmentfinance.org${path}` });

test('the matcher runs on pages', () => {
    for (const path of [
        '/',
        '/data',
        '/data?q=debt',
        '/graph-explorer',
        '/graph-explorer/seed',
        '/docs/build/api-keys',
        '/studio/abc',
        '/s/abc',
        '/apiary',
        '/codes-of-conduct',
        '/embedding-guide',
        '/mcpherson',
        '/prototypes-archive',
    ]) {
        assert.equal(matches(path), true, path);
    }
});

test('the matcher skips the API, embeds, prototypes, static files and Next files', () => {
    for (const path of [
        '/api/v1/search/catalogue',
        '/api/auth/session',
        '/mcp',
        '/mcp/sse',
        '/openapi.json',
        '/codes/RATE_LIMITED',
        '/embed/abc',
        '/prototypes',
        '/prototypes/debt',
        '/api',
        '/codes',
        '/favicon.ico',
        '/images/LOGO.SVG',
        '/images/logo.svg',
        '/docs/build.zip',
        '/_next/static/chunks/main.js',
        '/_next/image',
    ]) {
        assert.equal(matches(path), false, path);
    }
});

const request = (path: string, headers: Record<string, string> = {}) =>
    new NextRequest(`https://developmentfinance.org${path}`, { headers });

const setCookie = (response: Response) => response.headers.get('set-cookie') ?? '';

test('a page load gets a dfo_v cookie that reads back as a visitor', () => {
    const response = proxy(request('/about', { 'sec-fetch-dest': 'document' }));
    const cookie = setCookie(response);
    const value = /dfo_v=([^;]+)/.exec(cookie)?.[1] ?? '';

    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=86400/);
    assert.notEqual(readVisitor(new Headers({ cookie: `dfo_v=${value}` })), null);
});

test('an RSC navigation or prefetch gets the cookie too', () => {
    assert.match(setCookie(proxy(request('/about', { 'sec-fetch-dest': 'empty' }))), /dfo_v=/);
});

test('/data and the Graph Explorer keep their handling and get the cookie', () => {
    const page = { 'sec-fetch-dest': 'document' };
    const data = proxy(request('/data?spec=abc', page));
    const explorer = proxy(request('/graph-explorer/seed?x=1', page));

    assert.equal(data.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(setCookie(data), /dfo_v=/);
    assert.equal(
        explorer.headers.get('x-middleware-request-x-dfo-request-path'),
        '/graph-explorer/seed?x=1',
    );
    assert.match(setCookie(explorer), /dfo_v=/);
});

test('other pages get neither the /data noindex nor the Graph Explorer path', () => {
    const other = proxy(request('/about?spec=abc', { 'sec-fetch-dest': 'document' }));

    assert.equal(other.headers.get('x-robots-tag'), null);
    assert.equal(other.headers.get('x-middleware-request-x-dfo-request-path'), null);
});
