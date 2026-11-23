/**
 * The Studio proxy answers a request whose body the client drops mid-upload
 * with a problem document, not a bare 500.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

const { studioProxy } = await import('../studioProxy.ts');

test('studioProxy: answers a body that fails mid-upload with a 400 problem document', async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});

    const body = new ReadableStream<Uint8Array>({
        pull: () => {
            throw new Error('client aborted');
        },
    });
    const req = Object.assign(
        new Request('http://site.test/api/v1/studio/turn', {
            method: 'POST',
            body,
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

    assert.equal(res.status, 400);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
});
