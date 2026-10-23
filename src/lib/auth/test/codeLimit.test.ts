/**
 * `codeLimit.ts` without a database: which inbox an address counts as
 * (`inbox.ts`) and the keys a send counts against. takeCodeAllowance runs
 * against Postgres in db/test/limit-counter.test.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CODE_LIMITS, codeLimitKeys } from '../codeLimit.ts';
import { inboxOf } from '../inbox.ts';

for (const [email, inbox] of [
    ['Ana.Silva@Finance.gov.br', 'ana.silva@finance.gov.br'],
    ['ana+dfo@finance.gov.br', 'ana@finance.gov.br'],
    ['a.n.a+x@gmail.com', 'ana@gmail.com'],
    ['ana@googlemail.com', 'ana@gmail.com'],
] as const) {
    test(`inboxOf(${email}) is ${inbox}`, () => {
        assert.equal(inboxOf(email), inbox);
    });
}

test('variants of one inbox share a key; other inboxes do not', () => {
    const [a] = codeLimitKeys('secret', 'a.n.a+1@gmail.com', null);
    const [b] = codeLimitKeys('secret', 'ANA+2@gmail.com', null);
    const [c] = codeLimitKeys('secret', 'ana2@gmail.com', null);

    assert.equal(a!.key, b!.key);
    assert.notEqual(a!.key, c!.key);
});

test('the network key is the IPv6 /64; clients with no known IP share one', () => {
    const one = codeLimitKeys('secret', 'ana@one.org', '2001:db8:1:2::10');
    const sameBlock = codeLimitKeys('secret', 'ana@one.org', '2001:db8:1:2:ffff::1');
    const otherBlock = codeLimitKeys('secret', 'ana@one.org', '2001:db8:1:3::10');
    const unknown = codeLimitKeys('secret', 'ana@one.org', null);
    const otherUnknown = codeLimitKeys('secret', 'bea@one.org', null);

    for (const keys of [one, unknown]) {
        assert.deepEqual(
            keys.map(({ max }) => max),
            [CODE_LIMITS.address, CODE_LIMITS.network],
        );
    }
    assert.equal(one[1]!.key, sameBlock[1]!.key);
    assert.notEqual(one[1]!.key, otherBlock[1]!.key);
    assert.equal(unknown[1]!.key, otherUnknown[1]!.key);
    assert.notEqual(unknown[1]!.key, one[1]!.key);
});

test('keys are hex digests behind a sign-in-code prefix, so neither the address nor the IP is stored', () => {
    for (const { key } of codeLimitKeys('secret', 'ana@one.org', '198.51.100.7')) {
        assert.match(key, /^sign-in-code:[0-9a-f]{64}$/);
    }
});

test('a different secret gives different keys', () => {
    assert.notEqual(
        codeLimitKeys('one', 'ana@one.org', null)[0]!.key,
        codeLimitKeys('two', 'ana@one.org', null)[0]!.key,
    );
});
