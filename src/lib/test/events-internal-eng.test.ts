import assert from 'node:assert/strict';
import test from 'node:test';

import {
    anonymousWho,
    isInternalEng,
    parseInternalEng,
    withInternalEng,
} from '../events/internalEng.ts';

const LIST = parseInternalEng(' Eng@One.org, example.org ,@partner.example,,');

test('the list is trimmed, lowercased and drops empty entries; unset is empty', () => {
    assert.deepEqual(LIST, ['eng@one.org', 'example.org', '@partner.example']);
    assert.deepEqual(parseInternalEng(undefined), []);
    assert.deepEqual(parseInternalEng(''), []);
});

test('an address entry matches that address only; a domain entry matches that domain only', () => {
    const cases: [string | null | undefined, boolean][] = [
        ['ENG@one.org', true],
        ['other@one.org', false],
        ['anyone@example.org', true],
        ['anyone@partner.example', true],
        ['anyone@sub.example.org', false],
        ['anyone@notexample.org', false],
        ['', false],
        [null, false],
        [undefined, false],
    ];

    for (const [email, expected] of cases) {
        assert.equal(isInternalEng({ email, emailVerified: true }, LIST), expected, String(email));
    }
});

test('an unverified email, or no user, matches nobody', () => {
    assert.equal(isInternalEng({ email: 'eng@one.org', emailVerified: false }, LIST), false);
    assert.equal(isInternalEng({ email: 'eng@one.org', emailVerified: null }, LIST), false);
    assert.equal(isInternalEng({ email: 'eng@one.org' }, LIST), false);
    assert.equal(isInternalEng(null, LIST), false);
});

test('an empty list matches nobody', () => {
    assert.equal(isInternalEng({ email: 'eng@one.org', emailVerified: true }, []), false);
});

test('withInternalEng sets internal_eng from the user and overrides a claim in the props', () => {
    const verified = (email: string) => ({ email, emailVerified: true });

    assert.deepEqual(withInternalEng({ slug: 'a' }, verified('eng@one.org'), LIST), {
        slug: 'a',
        internal_eng: true,
    });
    assert.equal(withInternalEng({}, verified('x@other.org'), LIST).internal_eng, false);
    assert.equal(withInternalEng({}, null, LIST).internal_eng, false);
    assert.equal(
        withInternalEng({ internal_eng: true }, verified('x@other.org'), LIST).internal_eng,
        false,
    );
    assert.equal(withInternalEng({}, verified('eng@one.org'), []).internal_eng, false);
});

test('anonymousWho keeps the email for internal_eng and never an account id', () => {
    const user = { id: 'u1', email: 'eng@one.org', emailVerified: true };
    const who = anonymousWho(user);

    assert.equal(who.userId, null);
    assert.equal(isInternalEng(who, LIST), true);
    assert.equal(anonymousWho(null).userId, null);
});
