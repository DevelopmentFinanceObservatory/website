/**
 * `caller.ts`: which X-Forwarded-For entry names the client, the digest it
 * becomes, the settings it reads, and that a client-sent x-dfo-caller never
 * survives.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
    assertTrustedHops,
    CALLER_HEADER,
    callerConfig,
    clientAddress,
    limiterBucket,
    limiterKeyFor,
    resolveCaller,
    setCaller,
    trustedHops,
} from '../caller.ts';

const KEY = 'test-key';
const digest = (ip: string) =>
    `ip:${createHmac('sha256', KEY).update(ip).digest('hex').slice(0, 32)}`;

test('resolveCaller: 0 hops takes the rightmost entry', () => {
    assert.equal(
        resolveCaller('1.1.1.1, 2.2.2.2, 3.3.3.3', { key: KEY, hops: 0 }),
        digest('3.3.3.3'),
    );
});

test('resolveCaller: each hop moves one entry left', () => {
    assert.equal(
        resolveCaller('1.1.1.1, 2.2.2.2, 3.3.3.3', { key: KEY, hops: 1 }),
        digest('2.2.2.2'),
    );
    assert.equal(
        resolveCaller('1.1.1.1,2.2.2.2,3.3.3.3', { key: KEY, hops: 2 }),
        digest('1.1.1.1'),
    );
});

test('resolveCaller: a client-prepended entry does not change the caller', () => {
    assert.equal(
        resolveCaller('6.6.6.6, 3.3.3.3', { key: KEY, hops: 0 }),
        resolveCaller('3.3.3.3', { key: KEY, hops: 0 }),
    );
});

test('resolveCaller: the digest is 32 hex characters and keyed', () => {
    const caller = resolveCaller('2001:db8::1', { key: KEY, hops: 0 });

    assert.match(caller ?? '', /^ip:[0-9a-f]{32}$/);
    assert.notEqual(caller, resolveCaller('2001:db8::1', { key: 'other', hops: 0 }));
});

test('resolveCaller: a chain shorter than the hops gives no caller', () => {
    assert.equal(resolveCaller('3.3.3.3', { key: KEY, hops: 1 }), undefined);
});

test('resolveCaller: a missing, empty or non-IP entry gives no caller', () => {
    assert.equal(resolveCaller(null, { key: KEY, hops: 0 }), undefined);
    assert.equal(resolveCaller('', { key: KEY, hops: 0 }), undefined);
    assert.equal(resolveCaller('1.1.1.1, ', { key: KEY, hops: 0 }), undefined);
    assert.equal(resolveCaller('unknown', { key: KEY, hops: 0 }), undefined);
    assert.equal(resolveCaller('1.1.1.1:443', { key: KEY, hops: 0 }), undefined);
});

test('callerConfig: reads the key and defaults hops to 0', () => {
    assert.deepEqual(callerConfig({ CALLER_HMAC_KEY: KEY }), { key: KEY, hops: 0 });
    assert.deepEqual(callerConfig({ CALLER_HMAC_KEY: KEY, TRUSTED_PROXY_HOPS: '2' }), {
        key: KEY,
        hops: 2,
    });
});

test('callerConfig: refuses a missing key', () => {
    assert.ok('problem' in callerConfig({}));
    assert.ok('problem' in callerConfig({ CALLER_HMAC_KEY: '' }));
});

test('callerConfig: refuses hops that are not a non-negative integer', () => {
    for (const hops of ['-1', '1.5', 'two']) {
        assert.ok('problem' in callerConfig({ CALLER_HMAC_KEY: KEY, TRUSTED_PROXY_HOPS: hops }));
    }
});

test('setCaller: replaces a client-sent value', () => {
    const headers = new Headers({ [CALLER_HEADER]: 'ip:spoofed' });

    setCaller(headers, 'ip:real');
    assert.equal(headers.get(CALLER_HEADER), 'ip:real');
});

test('setCaller: with no caller, drops a client-sent value', () => {
    const headers = new Headers({ [CALLER_HEADER]: 'ip:spoofed' });

    setCaller(headers, undefined);
    assert.equal(headers.has(CALLER_HEADER), false);
});

test('clientAddress: a client-prepended entry does not change the address', () => {
    assert.equal(clientAddress('6.6.6.6, 3.3.3.3', 0), clientAddress('3.3.3.3', 0));
    assert.equal(
        clientAddress('6.6.6.6, 2.2.2.2, 3.3.3.3', 1),
        clientAddress('2.2.2.2, 3.3.3.3', 1),
    );
    assert.equal(clientAddress('6.6.6.6, 3.3.3.3', 0), '3.3.3.3');
});

test('clientAddress: a missing, short or non-IP entry gives no address', () => {
    assert.equal(clientAddress(null, 0), undefined);
    assert.equal(clientAddress('3.3.3.3', 1), undefined);
    assert.equal(clientAddress('unknown', 0), undefined);
});

test('trustedHops: defaults to 0 and refuses a non-integer', () => {
    assert.equal(trustedHops({}), 0);
    assert.equal(trustedHops({ TRUSTED_PROXY_HOPS: '2' }), 2);
    assert.ok(typeof trustedHops({ TRUSTED_PROXY_HOPS: 'two' }) === 'object');
});

test('assertTrustedHops: accepts an unset or integer value and throws on any other', () => {
    assert.doesNotThrow(() => assertTrustedHops({}));
    assert.doesNotThrow(() => assertTrustedHops({ TRUSTED_PROXY_HOPS: ' 2 ' }));
    assert.throws(
        () => assertTrustedHops({ TRUSTED_PROXY_HOPS: 'two' }),
        /TRUSTED_PROXY_HOPS is not a non-negative integer: two/,
    );
    assert.throws(() => assertTrustedHops({ TRUSTED_PROXY_HOPS: '-1' }));
    assert.throws(() => assertTrustedHops({ TRUSTED_PROXY_HOPS: '1.5' }));
});

test('limiterKeyFor: keys on the client address, or local when there is none', () => {
    const key = limiterKeyFor(1, () => assert.fail('logged'));

    assert.equal(key('1.1.1.1, 2.2.2.2, 3.3.3.3'), '2.2.2.2');
    assert.equal(key(null), 'local');
    assert.equal(key('not-an-ip'), 'local');
});

test('limiterKeyFor: a malformed TRUSTED_PROXY_HOPS logs once and keys as local', () => {
    const logged: string[] = [];
    const key = limiterKeyFor(trustedHops({ TRUSTED_PROXY_HOPS: 'two' }), (message) =>
        logged.push(message),
    );

    assert.equal(key('1.1.1.1, 2.2.2.2'), 'local');
    assert.equal(key('3.3.3.3'), 'local');
    assert.equal(logged.length, 1);
    assert.match(logged[0] ?? '', /TRUSTED_PROXY_HOPS is not a non-negative integer: two/);
});

for (const [address, bucket] of [
    ['2001:db8:1:2:aaaa::1', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:bbbb:cccc:dddd:eeee', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    ['203.0.113.7', '203.0.113.7'],
    ['local', 'local'],
]) {
    test(`limiterBucket: ${address} counts as ${bucket}`, () => {
        assert.equal(limiterBucket(address), bucket);
    });
}
