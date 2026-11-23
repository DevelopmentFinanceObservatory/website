/**
 * The Studio proxy answers a request whose body fails to read with a problem
 * document, not a bare 500: 400 when the client dropped the connection, a
 * retryable 503 for any other failure.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

const { studioProxy } = await import('../studioProxy.ts');

const readFailure = async (signal: AbortSignal) => {
    const body = new ReadableStream<Uint8Array>({
        pull: () => {
            throw new Error('read failed');
        },
    });
    const req = Object.assign(
        new Request('http://site.test/api/v1/studio/turn', {
            method: 'POST',
            body,
            signal,
            duplex: 'half',
        } as RequestInit),
        { nextUrl: new URL('http://site.test/api/v1/studio/turn') },
    ) as unknown as NextRequest;

    const handler = studioProxy({
        getUser: async () => null,
        ownersOf: async () => [],
        claimOwner: async () => [],
    });
    const res = await handler(req, { params: Promise.resolve({ path: ['turn'] }) });

    return { res, document: await res.json() };
};

test('studioProxy: answers a body read after a client abort with a 400 problem document', async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});

    const controller = new AbortController();

    controller.abort();

    const { res, document } = await readFailure(controller.signal);

    assert.equal(res.status, 400);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    assert.equal(document.retryable, false);
});

test('studioProxy: answers any other body read failure with a retryable 503', async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});

    const { res, document } = await readFailure(new AbortController().signal);

    assert.equal(res.status, 503);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    assert.equal(document.code, 'transient_unavailable');
    assert.equal(document.retryable, true);
});
