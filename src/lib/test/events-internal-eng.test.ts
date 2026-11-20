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

test('anonymousWho matches domain entries only and never carries an account id', () => {
    const verified = (email: string) => anonymousWho({ email, emailVerified: true });

    // eng@one.org is an address entry, so its own anonymous events read false.
    assert.equal(isInternalEng(verified('eng@one.org'), LIST), false);
    assert.equal(isInternalEng(verified('Anyone@Example.org'), LIST), true);
    assert.equal(isInternalEng(verified('anyone@partner.example'), LIST), true);
    assert.equal(isInternalEng(anonymousWho({ email: 'a@example.org' }), LIST), false);
    assert.equal(verified('eng@one.org').userId, null);
    assert.equal(anonymousWho(null).email, null);
});
