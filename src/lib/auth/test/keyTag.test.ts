import assert from 'node:assert/strict';
import test from 'node:test';

import { API_KEY_PREFIX, generateKey } from '../apiKeyOptions.ts';
import { hasValidTag, keyTag, parseTagSecrets, signKey, tagSecrets } from '../keyTag.ts';

const A = '0123456789abcdef0123456789abcdef';
const B = 'fedcba9876543210fedcba9876543210';
const BODY = 'dfo_live_abcdefghijklmnopqrstuvwxyzABCDEF';

test('the tag is the first 8 base64url characters of HMAC-SHA-256 over the body', () => {
    // Computed apart from this code, with
    //   printf %s "$BODY" | openssl dgst -sha256 -hmac "$A" -binary | base64 | tr '+/' '-_' | cut -c1-8
    // Partners hold keys in this format, so it must not drift.
    assert.equal(keyTag(BODY, A), 'RhG3ZaVb');
    assert.equal(keyTag(BODY, B), 'nAXrG7_9');
    assert.equal(signKey(BODY, [A, B]), `${BODY}RhG3ZaVb`);
});

test('a key signed by any listed secret verifies; others do not', () => {
    assert.equal(hasValidTag(`${BODY}RhG3ZaVb`, [A]), true);
    assert.equal(hasValidTag(`${BODY}RhG3ZaVb`, [B, A]), true, 'a later secret verifies');
    assert.equal(hasValidTag(`${BODY}nAXrG7_9`, [A]), false, 'a retired secret does not');
    assert.equal(hasValidTag(`${BODY}RhG3ZaVc`, [A]), false, 'one character off');
    assert.equal(hasValidTag(`${BODY}RhG3ZaVb`, []), false, 'no secrets, no key');
});

test('only the exact shape verifies', () => {
    const tagged = signKey(BODY, [A]);

    assert.equal(hasValidTag(`${tagged}x`, [A]), false);
    assert.equal(hasValidTag(tagged.slice(1), [A]), false);
    assert.equal(hasValidTag(BODY, [A]), false, 'an untagged key of the old form');
    assert.equal(hasValidTag(` ${tagged}`, [A]), false);
    assert.equal(hasValidTag(tagged.replace('dfo_live_', 'dfo_test_'), [A]), false);
});

test('the secret list is required, comma-separated and long enough', () => {
    assert.deepEqual(parseTagSecrets(` ${A} , ${B} `), [A, B]);
    assert.throws(() => parseTagSecrets(undefined), /API_KEY_TAG_SECRETS is not set/);
    assert.throws(() => parseTagSecrets(' , '), /API_KEY_TAG_SECRETS is not set/);
    assert.throws(() => parseTagSecrets(`${A},short`), /at least 32/);
    assert.deepEqual(tagSecrets({ API_KEY_TAG_SECRETS: A }), [A]);
    assert.throws(() => signKey(BODY, []), /cannot be made/);
});

test('a minted key carries the prefix, 32 letters and a tag from the first secret', () => {
    const key = generateKey(() => [B, A])({ length: 32, prefix: API_KEY_PREFIX });

    assert.match(key, /^dfo_live_[A-Za-z]{32}[A-Za-z0-9_-]{8}$/);
    assert.equal(hasValidTag(key, [B]), true);
    assert.equal(hasValidTag(key, [A]), false);
});
