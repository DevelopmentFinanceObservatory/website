/**
 * `account.ts`: a signed-in user gets the digest, a guest gets none, and an
 * unset key sends none and says so once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { accountFor, exportDigest, setAccount } from '../account.ts';

const KEY = 'export-key';

test('accountFor: a signed-in user gets the digest, a guest none', () => {
    const account = accountFor({ EXPORT_ID_HMAC_KEY: KEY }, () => assert.fail('logged'));

    assert.equal(account('user_1'), exportDigest('user_1', KEY));
    assert.equal(account(null), undefined);
});

test('accountFor: without EXPORT_ID_HMAC_KEY sends no account and logs once', () => {
    for (const key of [undefined, '']) {
        const logged: string[] = [];
        const account = accountFor({ EXPORT_ID_HMAC_KEY: key }, (message) => logged.push(message));

        assert.equal(account('user_1'), undefined);
        assert.equal(account('user_2'), undefined);
        assert.equal(logged.length, 1);
    }
});

test('setAccount: drops a client-sent account, and sends none for a guest', () => {
    const headers = new Headers({ 'x-dfo-account': 'forged' });

    setAccount(headers, undefined);
    assert.equal(headers.has('x-dfo-account'), false);

    setAccount(headers, 'abc');
    assert.equal(headers.get('x-dfo-account'), 'abc');
});
