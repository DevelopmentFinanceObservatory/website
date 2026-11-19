/**
 * The identity headers `forward()` sends per upstream kind: dfo-apis gets the
 * principal, the caller and the surface, and the client's X-DFO-Client; any
 * other upstream gets the caller and account the route names, and neither
 * the principal nor the surface. A client-sent identity header never survives.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type { NextRequest } from 'next/server';

import type { ForwardOptions } from '../forward.ts';

// Echoes the request headers it received as JSON.
const upstream = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.headers));
});

upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
test.after(() => {
    upstream.closeAllConnections();
    upstream.close();
});

const apisBase = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
// The same server under another origin, so it is not dfo-apis.
const otherBase = `http://localhost:${(upstream.address() as AddressInfo).port}`;

// caller.ts reads its settings at import, so set them before loading it.
process.env.SEARCH_API_BASE = apisBase;
process.env.DFO_CALLER_PRINCIPAL = 'secret';
process.env.CALLER_HMAC_KEY = 'test-key';
process.env.TRUSTED_PROXY_HOPS = '0';
process.env.EXPORT_ID_HMAC_KEY = 'export-key';

const { forward } = await import('../forward.ts');
const { studioIdentity } = await import('../studioIdentity.ts');
const { accountDigest } = await import('../account.ts');

const IDENTITY = ['x-dfo-caller', 'x-dfo-caller-principal', 'x-dfo-surface', 'x-dfo-account'];

// A client that tries to name itself.
const FORGED = {
    'x-forwarded-for': '203.0.113.7',
    'x-dfo-caller': 'ip:forged',
    'x-dfo-caller-principal': 'forged',
    'x-dfo-surface': 'studio',
    'x-dfo-account': 'forged',
};

const received = async (
    target: string,
    headers: Record<string, string>,
    route: Pick<ForwardOptions, 'caller' | 'account'> = {},
): Promise<Record<string, string>> => {
    const res = await forward(
        new Request('http://site.test/api/v1/datasets', { headers }) as NextRequest,
        { target, unreachable: 'unreachable', ...route },
    );
    const echoed = (await res.json()) as Record<string, string>;

    return Object.fromEntries(
        Object.entries(echoed).filter(
            ([name]) => IDENTITY.includes(name) || name === 'x-dfo-client',
        ),
    );
};

test('forward: dfo-apis gets the surface website for a same-origin fetch', async () => {
    const sent = await received(`${apisBase}/api/datasets`, {
        ...FORGED,
        'sec-fetch-site': 'same-origin',
    });

    assert.equal(sent['x-dfo-caller-principal'], 'secret');
    assert.match(sent['x-dfo-caller'] ?? '', /^ip:[0-9a-f]{32}$/);
    assert.equal(sent['x-dfo-surface'], 'website');
    assert.equal('x-dfo-account' in sent, false);
});

test('forward: dfo-apis gets the surface api and the X-DFO-Client of an SDK call', async () => {
    const sent = await received(`${apisBase}/api/datasets`, {
        ...FORGED,
        'x-dfo-client': 'dfo-python/0.4.1 (CPython 3.12)',
    });

    assert.equal(sent['x-dfo-surface'], 'api');
    assert.equal(sent['x-dfo-client'], 'dfo-python/0.4.1 (CPython 3.12)');
    assert.equal(sent['x-dfo-caller-principal'], 'secret');
});

test('forward: another upstream gets the route’s caller and account only', async () => {
    const sent = await received(
        `${otherBase}/api/studio/turn`,
        { ...FORGED, 'sec-fetch-site': 'same-origin' },
        { caller: 'ip:visitor', account: async () => 'digest' },
    );

    assert.deepEqual(sent, { 'x-dfo-caller': 'ip:visitor', 'x-dfo-account': 'digest' });
});

test('forward: a guest’s call to another upstream carries no account', async () => {
    const sent = await received(`${otherBase}/api/studio/turn`, FORGED, { caller: 'ip:visitor' });

    assert.deepEqual(sent, { 'x-dfo-caller': 'ip:visitor' });
});

// The Studio route's identity options sent through the real forward().
const studioSent = (route: string, readUserId: () => Promise<string | null>) =>
    received(
        `${otherBase}/api/studio/${route}`,
        { ...FORGED, 'sec-fetch-site': 'same-origin' },
        studioIdentity(route, new Headers(FORGED), readUserId),
    );

test('studioIdentity: turn and interrupt send the caller and the account digest', async () => {
    for (const route of ['turn', 'interrupt']) {
        const sent = await studioSent(route, async () => 'user_1');

        assert.match(sent['x-dfo-caller'] ?? '', /^ip:[0-9a-f]{32}$/, route);
        assert.equal(sent['x-dfo-account'], accountDigest('user_1', 'export-key'), route);
        assert.equal('x-dfo-caller-principal' in sent, false, route);
    }
});

test('studioIdentity: cancel and composition send neither header', async () => {
    for (const route of ['cancel', 'composition']) {
        const sent = await studioSent(route, async () => assert.fail('session read'));

        assert.deepEqual(sent, {}, route);
    }
});

test('studioIdentity: a session read that rejects forwards the call without an account', async () => {
    const sent = await studioSent('turn', () => Promise.reject(new Error('session store down')));

    assert.match(sent['x-dfo-caller'] ?? '', /^ip:/);
    assert.equal('x-dfo-account' in sent, false);
});

test('studioIdentity: a call the admit check refuses reads no session', async () => {
    let reads = 0;
    const res = await forward(
        new Request('http://site.test/api/v1/studio/turn', { headers: FORGED }) as NextRequest,
        {
            target: `${otherBase}/api/studio/turn`,
            unreachable: 'unreachable',
            admit: async () => new Response(null, { status: 429 }),
            ...studioIdentity('turn', new Headers(FORGED), async () => {
                reads += 1;

                return 'user_1';
            }),
        },
    );

    assert.equal(res.status, 429);
    assert.equal(reads, 0);
});
