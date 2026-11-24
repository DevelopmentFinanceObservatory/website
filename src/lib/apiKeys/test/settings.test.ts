import assert from 'node:assert/strict';
import test from 'node:test';

import {
    adminFrom,
    isAdmin,
    limitNotice,
    maxKeysPerAccount,
    parseAdminEmails,
    parseEmailInput,
    parseLabel,
    parseLimitInput,
} from '../settings.ts';

const user = (email: string, emailVerified = true) => ({ id: 'u1', email, emailVerified });

test('maxKeysPerAccount: the env value, else 5', () => {
    assert.equal(maxKeysPerAccount(undefined), 5);
    assert.equal(maxKeysPerAccount(''), 5);
    assert.equal(maxKeysPerAccount('3'), 3);
    assert.equal(maxKeysPerAccount(' 12 '), 12);

    for (const bad of ['0', '-1', '2.5', 'many', 'NaN']) {
        assert.equal(maxKeysPerAccount(bad), 5, bad);
    }
});

test('parseAdminEmails: trimmed, lowercased, empties dropped; unset names nobody', () => {
    assert.deepEqual([...parseAdminEmails(' A@x.org, ,b@Y.org,')], ['a@x.org', 'b@y.org']);
    assert.equal(parseAdminEmails(undefined).size, 0);
    assert.equal(parseAdminEmails('').size, 0);
    assert.equal(parseAdminEmails(' , ').size, 0);
});

test('isAdmin: matches the email whatever the case, and needs it verified', () => {
    const admins = parseAdminEmails('Ops@Example.org');

    assert.equal(isAdmin(user('ops@example.org'), admins), true);
    assert.equal(isAdmin(user('OPS@EXAMPLE.ORG'), admins), true);
    assert.equal(isAdmin(user('other@example.org'), admins), false);
    assert.equal(isAdmin(user('ops@example.org', false), admins), false);
    assert.equal(isAdmin(null, admins), false);
    assert.equal(isAdmin(undefined, admins), false);
});

test('adminFrom: an empty or unset ADMIN_EMAILS admits nobody; signed out is not an admin', () => {
    assert.equal(adminFrom(user('ops@example.org'), undefined), null);
    assert.equal(adminFrom(user('ops@example.org'), ''), null);
    assert.equal(adminFrom(user('ops@example.org'), ' , '), null);
    assert.equal(adminFrom(null, 'ops@example.org'), null);
    assert.equal(adminFrom(user('x@example.org'), 'ops@example.org'), null);
    assert.deepEqual(adminFrom(user('Ops@example.org'), 'ops@example.org, b@c.d'), {
        id: 'u1',
        email: 'Ops@example.org',
    });
});

test('an address that only contains an admin address is not one', () => {
    assert.equal(adminFrom(user('ops@example.org.evil.test'), 'ops@example.org'), null);
    assert.equal(adminFrom(user('xops@example.org'), 'ops@example.org'), null);
});

test('parseLabel: 1 to 32 characters, trimmed, no control characters', () => {
    assert.equal(parseLabel('  my notebook '), 'my notebook');
    assert.equal(parseLabel('x'.repeat(32)), 'x'.repeat(32));
    assert.equal(parseLabel('x'.repeat(33)), null);
    assert.equal(parseLabel('   '), null);
    assert.equal(parseLabel(''), null);
    assert.equal(parseLabel('a\nb'), null);
    assert.equal(parseLabel(undefined), null);
    assert.equal(parseLabel(42), null);
});

test('parseLimitInput: a positive integer, or empty to clear', () => {
    assert.deepEqual(parseLimitInput('250'), { ok: true, limit: 250 });
    assert.deepEqual(parseLimitInput(' 7 '), { ok: true, limit: 7 });
    assert.deepEqual(parseLimitInput(''), { ok: true, limit: null });
    assert.deepEqual(parseLimitInput('  '), { ok: true, limit: null });

    for (const bad of ['0', '-5', '1.5', '1e3', 'ten', '2147483648', '99999999999', null, 5]) {
        assert.deepEqual(parseLimitInput(bad), { ok: false }, String(bad));
    }

    assert.deepEqual(parseLimitInput('2147483647'), { ok: true, limit: 2147483647 });
});

test('parseEmailInput: trimmed, lowercased, address-shaped', () => {
    assert.equal(parseEmailInput(' Ops@Example.org '), 'ops@example.org');
    assert.equal(parseEmailInput('no at sign'), null);
    assert.equal(parseEmailInput('a b@c.d'), null);
    assert.equal(parseEmailInput(null), null);
});

test('limitNotice: a known code, and nothing for anything else', () => {
    for (const code of ['saved', 'cleared', 'no-account', 'invalid']) {
        assert.equal(typeof limitNotice(code), 'string', code);
    }

    for (const code of ['', 'nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
        assert.equal(limitNotice(code), undefined, code);
    }
});
