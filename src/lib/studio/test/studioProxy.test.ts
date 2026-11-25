/**
 * The Studio proxy answers a request whose body fails to read with a problem
 * document, not a bare 500: 400 when the client dropped the connection, a
 * retryable 503 for any other failure. It counts a call per visitor when the
 * call carries a valid visitor token, and per address otherwise.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

const { studioProxy } = await import('../studioProxy.ts');
const { accessDeps } = await import('../../proxy/forward.ts');
const { BACKSTOP_LIMITS, COOKIELESS_LIMITS, LIMITS } = await import('../../proxy/rateLimit.ts');
const { mintVisitorToken, visitorKey } = await import('../../proxy/visitor.ts');

const handler = studioProxy({
    getUser: async () => null,
    ownersOf: async () => [],
    claimOwner: async () => [],
});

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

test('studioProxy: counts per visitor with a valid visitor token, else on the cookieless count', async (t) => {
    const callerKey = process.env.CALLER_HMAC_KEY;
    const original = { ...accessDeps };

    process.env.CALLER_HMAC_KEY = 'studio-test-key';
    t.after(() => {
        Object.assign(accessDeps, original);

        if (callerKey === undefined) {
            delete process.env.CALLER_HMAC_KEY;
        } else {
            process.env.CALLER_HMAC_KEY = callerKey;
        }
    });

    const log: string[] = [];
    let allowed = true;
    const verdict = (limit: number) => ({ allowed, limit, remaining: allowed ? 1 : 0, reset: 30 });

    accessDeps.hitAddress = async (surface, _ip, limit) => {
        log.push(`address:${surface}:${limit}`);

        return verdict(limit);
    };
    // Logs the counts of each plan, the call's own then the address's
    // backstop, and refuses on the call's own count when `allowed` is false.
    accessDeps.admit = async (plan) => {
        const [surface, kind] = plan.minute.key.split(':');

        log.push(
            `${kind === 'visitor' ? 'visitor' : 'cookieless'}:${surface}:${plan.minute.limit}`,
        );

        for (const counter of [plan.backstop, plan.day, plan.ceiling]) {
            if (counter) {
                log.push(
                    counter === plan.backstop
                        ? `backstop:${surface}:${counter.limit}`
                        : `daily:${counter.key}:${counter.limit}`,
                );
            }
        }

        return {
            refusedBy: allowed ? null : 'minute',
            verdicts: { minute: verdict(plan.minute.limit) },
        };
    };
    // Logged so the assertions below show the daily allowance is never spent.
    accessDeps.hitDaily = async (counterKey, limit) => {
        log.push(`daily:${counterKey}:${limit}`);

        return verdict(limit);
    };

    const options = (headers: Record<string, string> = {}) =>
        handler(
            Object.assign(
                new Request('http://site.test/api/v1/studio/turn', { method: 'OPTIONS', headers }),
                { nextUrl: new URL('http://site.test/api/v1/studio/turn') },
            ) as unknown as NextRequest,
            { params: Promise.resolve({ path: ['turn'] }) },
        );
    const cookie = `dfo_v=${mintVisitorToken(visitorKey('studio-test-key'), Date.now())}`;

    const visitor = await options({ cookie });
    const cookieless = await options();

    assert.equal(visitor.status, 204);
    assert.equal(visitor.headers.get('x-dfo-limit-tier'), 'visitor');
    assert.equal(cookieless.status, 204);
    assert.equal(cookieless.headers.get('x-dfo-limit-tier'), 'address');
    assert.deepEqual(log, [
        `visitor:api:${LIMITS.api}`,
        `backstop:api:${BACKSTOP_LIMITS.api}`,
        `cookieless:api:${COOKIELESS_LIMITS.api}`,
        `backstop:api:${BACKSTOP_LIMITS.api}`,
    ]);

    // A refusal is the rate_limited document, with no API key hint: the Studio ignores keys.
    allowed = false;

    const refused = await options();
    const document = await refused.json();

    assert.equal(refused.status, 429);
    assert.equal(document.code, 'rate_limited');
    assert.ok(!document.detail.includes('/docs/build/api-keys'));
});
