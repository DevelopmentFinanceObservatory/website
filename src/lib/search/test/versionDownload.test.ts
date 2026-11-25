/**
 * GET /api/version-download/<spec>/<cv> counts the click before it reads the
 * version, so its 400, 404 and 502 refusals carry the tier for the request
 * log, which removes the header before the response reaches the client.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import type { NextRequest } from 'next/server';

const { GET } = await import('../../../app/api/version-download/[spec]/[cv]/route.ts');
const { accessDeps } = await import('../../proxy/forward.ts');
const { registerRequestLogging } = await import('../../proxy/requestLog.ts');

test('version-download refusals after the count are logged with their tier, which no client sees', async (t) => {
    const original = { ...accessDeps };
    const base = process.env.SEARCH_API_BASE;

    process.env.SEARCH_API_BASE = 'http://apis.test';
    accessDeps.visitorLimits = () => false;
    accessDeps.hitAddress = async (_surface, _ip, limit) => ({
        allowed: true,
        limit,
        remaining: 1,
        reset: 30,
    });
    t.after(() => {
        Object.assign(accessDeps, original);

        if (base === undefined) {
            delete process.env.SEARCH_API_BASE;
        } else {
            process.env.SEARCH_API_BASE = base;
        }
    });

    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);

        if (url.startsWith('http://apis.test/api/datasets/spec_gone/')) {
            return Promise.resolve(new Response(null, { status: 404 }));
        }

        if (url.startsWith('http://apis.test/')) {
            return Promise.resolve(new Response('not json', { status: 200 }));
        }

        return realFetch(input, init);
    });

    const lines: { path: string; status: number; tier: unknown }[] = [];
    t.mock.method(console, 'log', (line: string) => lines.push(JSON.parse(line)));
    t.after(registerRequestLogging());

    // Writes the route's Response as Next's sendResponse does: each header
    // through appendHeader before the body.
    const server = createServer(async (request, response) => {
        const [, , , spec = '', cv = ''] = (request.url ?? '').split('/');
        const res = await GET(
            new Request(`http://site.test${request.url}`) as unknown as NextRequest,
            { params: Promise.resolve({ spec, cv }) },
        );

        response.statusCode = res.status;
        res.headers.forEach((value, name) => response.appendHeader(name, value));
        response.end(await res.text());
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
        server.closeAllConnections();
        server.close();
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const paths = [
        '/api/version-download/not-a-spec/cv_1',
        '/api/version-download/spec_gone/cv_1',
        '/api/version-download/spec_bad/cv_1',
    ];
    const seen: { status: number; tier: string | null }[] = [];

    for (const path of paths) {
        const res = await fetch(`http://127.0.0.1:${address.port}${path}`);
        await res.text();
        seen.push({ status: res.status, tier: res.headers.get('x-dfo-limit-tier') });
    }

    while (lines.length < paths.length) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }

    assert.deepEqual(seen, [
        { status: 400, tier: null },
        { status: 404, tier: null },
        { status: 502, tier: null },
    ]);
    assert.deepEqual(
        lines.map(({ path, status, tier }) => ({ path, status, tier })),
        paths.map((path, index) => ({ path, status: [400, 404, 502][index], tier: 'address' })),
    );
});
