import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

// caller.ts reads its settings at import, so set them before loading it.
process.env.CALLER_HMAC_KEY = 'test-key';
process.env.TRUSTED_PROXY_HOPS = '1';

const { withCaller } = await import('../events/dataView.ts');

const PROPS = {
    specIds: ['spec_a1'],
    contentVersions: ['cv_1'],
    via: 'pinned_ref' as const,
    surface: 'page' as const,
    originAllowed: false,
};

const digest = (address: string) =>
    `ip:${createHmac('sha256', 'test-key').update(address).digest('hex').slice(0, 32)}`;

test('withCaller records the digest requestCaller gives for the X-Forwarded-For client', () => {
    // One trusted hop: the client is the second entry from the right.
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });

    assert.equal(withCaller(PROPS, headers).caller, digest('203.0.113.7'));
    assert.match(withCaller(PROPS, headers).caller ?? '', /^ip:[0-9a-f]{32}$/);
});

test('withCaller records null when no client address resolves', () => {
    // No header, a client entry that is no address, and fewer entries than hops.
    for (const forwarded of [undefined, 'not-an-ip, 10.0.0.1', '10.0.0.1']) {
        const headers = new Headers(forwarded ? { 'x-forwarded-for': forwarded } : {});

        assert.equal(withCaller(PROPS, headers).caller, null);
    }
});

test('withCaller replaces a caller already on the props', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    const forged = { ...PROPS, caller: 'ip:' + 'f'.repeat(32) };

    assert.equal(withCaller(forged, headers).caller, digest('203.0.113.7'));
});
