import assert from 'node:assert/strict';
import test from 'node:test';

import { API_KEY_PREFIX, generateKey } from '../apiKeyOptions.ts';
import {
    hasValidTag,
    keyChecksum,
    keyTag,
    parseTagSecrets,
    signKey,
    tagSecrets,
} from '../keyTag.ts';

const A = '0123456789abcdef0123456789abcdef';
const B = 'fedcba9876543210fedcba9876543210';
const BODY = 'dfo_k_abcdefghijklmnopqrstuvwxyzABCDEF';

test('the tag and checksum match an independent computation', () => {
    // Computed apart from this code in Python: the first 8 bytes of
    // hmac.new(secret, BODY, sha256) as a big-endian integer, mod 62**8, in
    // base62; then base62(zlib.crc32(everything after the prefix)), 6 digits.
    // Partners hold keys in this format, so it must not drift.
    assert.equal(keyTag(BODY, A), 'm1OujYLR');
    assert.equal(keyTag(BODY, B), 'QtlZdIvt');
    assert.equal(signKey(BODY, [A, B]), `${BODY}m1OujYLR1rw8Oq`);
});

test("the checksum passes the client contract's key-format vectors", () => {
    // spec-kit client-contract rules/key-format.json, "secret-key-passes" and
    // "checksum-with-leading-zero-passes".
    for (const key of [
        'dfo_k_4f8Kq2ZtR7mWx1NcB9vLp3YhD6sGa0Ue2wanxe',
        'dfo_k_padTest00000000000000000000000020xpmWN',
    ]) {
        const rest = key.slice('dfo_k_'.length);

        assert.equal(keyChecksum(rest.slice(0, -6)), rest.slice(-6), key);
    }
});

test('a key signed by any listed secret verifies; others do not', () => {
    const KEY_A = `${BODY}m1OujYLR1rw8Oq`;
    const KEY_B = `${BODY}QtlZdIvt1yJC6s`;

    assert.equal(hasValidTag(KEY_A, [A]), true);
    assert.equal(hasValidTag(KEY_A, [B, A]), true, 'a later secret verifies');
    assert.equal(hasValidTag(KEY_B, [A]), false, 'a retired secret does not');
    assert.equal(hasValidTag(`${BODY}m1OujYLS1rw8Oq`, [A]), false, 'one tag character off');
    assert.equal(hasValidTag(`${BODY}m1OujYLR1rw8Or`, [A]), false, 'a wrong checksum');
    assert.equal(hasValidTag(KEY_A, []), false, 'no secrets, no key');
});

test('only the exact shape verifies', () => {
    const tagged = signKey(BODY, [A]);

    assert.equal(hasValidTag(`${tagged}x`, [A]), false);
    assert.equal(hasValidTag(tagged.slice(1), [A]), false);
    assert.equal(hasValidTag(BODY, [A]), false, 'an untagged key');
    assert.equal(hasValidTag(` ${tagged}`, [A]), false);
    assert.equal(hasValidTag(tagged.replace('dfo_k_', 'dfo_p_'), [A]), false);
    assert.equal(
        hasValidTag(`dfo_live_${'a'.repeat(32)}RhG3ZaVb`, [A]),
        false,
        'a key of the earlier dfo_live_ form',
    );
});

test('the secret list is required, comma-separated and long enough', () => {
    assert.deepEqual(parseTagSecrets(` ${A} , ${B} `), [A, B]);
    assert.throws(() => parseTagSecrets(undefined));
    assert.throws(() => parseTagSecrets(' , '));
    assert.throws(() => parseTagSecrets(`${A},short`));
    assert.deepEqual(parseTagSecrets(`${A},${'c'.repeat(32)}`), [A, 'c'.repeat(32)]);
    assert.deepEqual(tagSecrets({ API_KEY_TAG_SECRETS: A }), [A]);
    assert.throws(() => signKey(BODY, []));
});

test('a minted key carries the prefix, 32 letters, a tag from the first secret and a checksum', () => {
    const key = generateKey(() => [B, A])({ length: 32, prefix: API_KEY_PREFIX });

    assert.match(key, /^dfo_k_[A-Za-z]{32}[0-9A-Za-z]{14}$/);
    assert.equal(hasValidTag(key, [B]), true);
    assert.equal(hasValidTag(key, [A]), false);
});
