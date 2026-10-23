/**
 * `clientIp.ts`: the header Better Auth keys its limits on carries the
 * address the server resolved and drops any the client sent, and the request
 * body survives the copy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CLIENT_IP_HEADER, clientIpHandlers, withClientIp } from '../clientIp.ts';

const request = (headers: Record<string, string>) =>
    new Request('https://developmentfinance.org/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: 'ana@one.org', otp: '123456' }),
    });

test('the trusted X-Forwarded-For entry replaces a client-sent header', async () => {
    const out = await withClientIp(
        request({
            'x-forwarded-for': '203.0.113.9, 198.51.100.7',
            [CLIENT_IP_HEADER]: '192.0.2.1',
        }),
        0,
    );

    assert.equal(out.headers.get(CLIENT_IP_HEADER), '198.51.100.7');
});

test('one hop in front: the entry before the load balancer is the client', async () => {
    const out = await withClientIp(
        request({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7, 35.191.0.1' }),
        1,
    );

    assert.equal(out.headers.get(CLIENT_IP_HEADER), '198.51.100.7');
});

for (const [label, headers, hops] of [
    ['no X-Forwarded-For', { [CLIENT_IP_HEADER]: '192.0.2.1' }, 0],
    ['an entry that is not an IP', { 'x-forwarded-for': 'unknown' }, 0],
    ['malformed hops', { 'x-forwarded-for': '198.51.100.7' }, { problem: 'bad hops' }],
] as const) {
    test(`${label}: the header is left off`, async () => {
        assert.equal(
            (await withClientIp(request({ ...headers }), hops)).headers.get(CLIENT_IP_HEADER),
            null,
        );
    });
}

test("the route's POST hands Better Auth a copy of Next's request, body and all", async () => {
    // Next gives route handlers a Request from its own fetch implementation,
    // which `new Request(request)` cannot read. This object stands in for it.
    const foreign = {
        url: 'https://developmentfinance.org/api/auth/sign-in/email-otp',
        method: 'POST',
        headers: new Headers({ 'x-forwarded-for': '198.51.100.7' }),
        signal: new AbortController().signal,
        arrayBuffer: async () => new TextEncoder().encode('{"otp":"123456"}').buffer,
    } as unknown as Request;
    const received: Request[] = [];
    const { POST } = clientIpHandlers(
        {
            GET: async () => assert.fail('a POST reached the GET handler'),
            POST: async (copy) => {
                received.push(copy);

                return new Response(null, { status: 204 });
            },
        },
        0,
    );

    assert.equal((await POST(foreign)).status, 204);
    assert.equal(received[0]!.method, 'POST');
    assert.equal(received[0]!.headers.get(CLIENT_IP_HEADER), '198.51.100.7');
    assert.deepEqual(await received[0]!.json(), { otp: '123456' });
});
