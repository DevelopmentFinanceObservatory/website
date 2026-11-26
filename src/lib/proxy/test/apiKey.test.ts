/**
 * `apiKey.ts`: where a call's API key is read from. A `dfo_` bearer or
 * `X-API-Key` is a key only with the `dfo_` prefix, any other bearer is not,
 * two different keys are a conflict, and an over-long key is refused unread.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bearerKey, carriesKey, MAX_KEY_LENGTH, readApiKey } from '../apiKey.ts';

const KEY = `dfo_k_${'a'.repeat(32)}`;
const read = (headers: Record<string, string>) => readApiKey(new Headers(headers));

test('readApiKey: no headers is no key', () => {
    assert.deepEqual(read({}), { kind: 'none' });
});

test('readApiKey: a dfo_ bearer is a key, whatever the scheme case or spacing', () => {
    for (const value of [`Bearer ${KEY}`, `bearer ${KEY}`, `BEARER   ${KEY}  `]) {
        assert.deepEqual(read({ authorization: value }), { kind: 'key', key: KEY }, value);
    }
});

test('readApiKey: X-API-Key is a key', () => {
    assert.deepEqual(read({ 'x-api-key': KEY }), { kind: 'key', key: KEY });
    assert.deepEqual(read({ 'X-API-Key': ` ${KEY} ` }), { kind: 'key', key: KEY });
});

test('readApiKey: an X-API-Key that is not a dfo_ key is not a key', () => {
    for (const value of ['another-service-secret', 'DFO_X', `x${KEY}`]) {
        assert.deepEqual(read({ 'x-api-key': value }), { kind: 'none' }, value);
    }

    // A foreign alias beside a key neither conflicts with it nor replaces it.
    assert.deepEqual(read({ authorization: `Bearer ${KEY}`, 'x-api-key': 'other' }), {
        kind: 'key',
        key: KEY,
    });
});

test('readApiKey: a bearer that is not a dfo_ key is not a key', () => {
    for (const value of ['Bearer sk-live-123', 'Bearer eyJhbGciOi.payload.sig', 'Bearer DFO_X']) {
        assert.deepEqual(read({ authorization: value }), { kind: 'none' }, value);
    }

    // Other schemes are not ours either, even with our prefix in them.
    assert.deepEqual(read({ authorization: `Basic ${KEY}` }), { kind: 'none' });
    assert.deepEqual(read({ authorization: `Token ${KEY}` }), { kind: 'none' });
});

test('readApiKey: a foreign bearer beside X-API-Key leaves the key to X-API-Key', () => {
    assert.deepEqual(read({ authorization: 'Bearer harness-token', 'x-api-key': KEY }), {
        kind: 'key',
        key: KEY,
    });
});

test('readApiKey: both headers with one value are one key', () => {
    assert.deepEqual(read({ authorization: `Bearer ${KEY}`, 'x-api-key': KEY }), {
        kind: 'key',
        key: KEY,
    });
});

test('readApiKey: both headers with different values conflict', () => {
    assert.deepEqual(read({ authorization: `Bearer ${KEY}`, 'x-api-key': `${KEY}b` }), {
        kind: 'conflict',
    });
    assert.deepEqual(read({ authorization: `Bearer ${KEY}`, 'x-api-key': 'dfo_other' }), {
        kind: 'conflict',
    });
});

test('readApiKey: a blank X-API-Key is no key', () => {
    assert.deepEqual(read({ 'x-api-key': '   ' }), { kind: 'none' });
});

test('readApiKey: a value over the maximum length is refused unread', () => {
    const long = `dfo_${'x'.repeat(MAX_KEY_LENGTH)}`;

    assert.deepEqual(read({ authorization: `Bearer ${long}` }), { kind: 'too-long' });
    assert.deepEqual(read({ 'x-api-key': long }), { kind: 'too-long' });
    assert.deepEqual(read({ 'x-api-key': `dfo_${'d'.repeat(MAX_KEY_LENGTH - 4)}` }).kind, 'key');
    assert.deepEqual(
        read({ 'x-api-key': `dfo_${'d'.repeat(MAX_KEY_LENGTH - 3)}` }).kind,
        'too-long',
    );
    // A foreign value is not a key, so its length is no concern.
    assert.deepEqual(read({ 'x-api-key': 'd'.repeat(MAX_KEY_LENGTH + 1) }), { kind: 'none' });
});

test('bearerKey: names the key in an Authorization value, or nothing', () => {
    assert.equal(bearerKey(`Bearer ${KEY}`), KEY);
    assert.equal(bearerKey('Bearer abc'), undefined);
    assert.equal(bearerKey(null), undefined);
});

test('carriesKey: a dfo_ token anywhere in a header value, in any scheme', () => {
    assert.equal(carriesKey(`Bearer ${KEY}`), true);
    assert.equal(carriesKey(`Token ${KEY}`), true);
    assert.equal(carriesKey(KEY), true);
    assert.equal(carriesKey(`Basic x, ${KEY}`), true);
    assert.equal(carriesKey('Bearer harness-token'), false);
    assert.equal(carriesKey('Bearer notdfo_x'), false);
});
