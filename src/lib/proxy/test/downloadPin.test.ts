/**
 * `POST /api/download-pin` counts every call against its address before it
 * reads a body, so every answer names the address tier for the request log:
 * the call it admits and the call it refuses alike.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

process.env.RATE_LIMIT_PIN = '1';
// A port nothing listens on, so each count fails at once and the instance
// counts in memory. A live Postgres from PGPORT would hold the run open.
process.env.DATABASE_URL = 'postgres://dfo@127.0.0.1:1/none';

const { POST } = await import('../../../app/api/download-pin/route.ts');

test('download-pin: names the address tier on an admitted call and on a refused one', async (t) => {
    t.mock.method(console, 'warn', () => {});
    t.mock.method(console, 'error', () => {});

    const post = () =>
        POST(
            new Request('http://site.test/api/download-pin', {
                method: 'POST',
                headers: { 'x-forwarded-for': '198.51.100.7' },
                body: 'not a pin',
            }) as NextRequest,
        );
    const admitted = await post();

    assert.equal(admitted.status, 400);
    assert.equal(admitted.headers.get('x-dfo-limit-tier'), 'address');

    const refused = await post();

    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('x-dfo-limit-tier'), 'address');
});
