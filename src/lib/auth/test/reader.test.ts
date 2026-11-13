/**
 * `reader.ts`: the Graph Explorer admits a signed-in user whose verified
 * email's domain is exactly an allowlisted one, and nobody when the
 * allowlist is unset or empty.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { decideReader, parseEmailDomains } from '../reader.ts';

const ALLOWED = parseEmailDomains('partner.example, example.org');

const user = (email: string, emailVerified = true) => ({ email, emailVerified });

const kind = (email: string, domains = ALLOWED, emailVerified = true) =>
    decideReader(user(email, emailVerified), domains).kind;

test('signed out', () => {
    assert.deepEqual(decideReader(null, ALLOWED), { kind: 'signed_out' });
});

test('an unverified email is refused, even on an allowed domain', () => {
    assert.equal(kind('a@partner.example', ALLOWED, false), 'email_not_verified');
});

test('a verified email on an allowed domain is admitted with its user', () => {
    const reader = user('a@partner.example');

    assert.deepEqual(decideReader(reader, ALLOWED), { kind: 'admitted', user: reader });
    assert.equal(kind('b@example.org'), 'admitted');
});

test('the domain must match exactly', () => {
    assert.equal(kind('a@elsewhere.example'), 'domain_not_allowed');
    assert.equal(kind('a@evil-partner.example'), 'domain_not_allowed');
    assert.equal(kind('a@partner.example.evil.org'), 'domain_not_allowed');
    assert.equal(kind('a@sub.partner.example'), 'domain_not_allowed');
    assert.equal(kind('partner.example'), 'domain_not_allowed');
});

test('the domain after the last @ decides', () => {
    assert.equal(kind('a@partner.example@elsewhere.example'), 'domain_not_allowed');
    assert.equal(kind('a@elsewhere.example@partner.example'), 'admitted');
});

test('case does not matter on either side', () => {
    assert.equal(kind('A@Partner.EXAMPLE'), 'admitted');
    assert.equal(kind('a@partner.example', parseEmailDomains(' PARTNER.Example ')), 'admitted');
});

test('an empty or unset allowlist admits nobody', () => {
    for (const value of [undefined, '', ' , ,']) {
        assert.equal(kind('a@partner.example', parseEmailDomains(value)), 'domain_not_allowed');
    }
});

test('the allowlist is trimmed, lowercased, without empty entries', () => {
    assert.deepEqual(
        [...parseEmailDomains(' Partner.Example ,, example.org ,')],
        ['partner.example', 'example.org'],
    );
    assert.deepEqual([...parseEmailDomains(undefined)], []);
});
