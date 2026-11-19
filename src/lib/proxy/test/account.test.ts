/**
 * `account.ts`: the x-dfo-account digest is the export's `user_hash` for the
 * same user, a guest gets none, and an unset key sends none and says so once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { exportRow, exportRules } from '../../../../db/event-export.ts';
import { accountDigest, accountFor, setAccount } from '../account.ts';

const KEY = 'export-key';

test('accountDigest: equals the event export’s user_hash for the same user id', () => {
    for (const userId of ['user_1', 'Kx9fQ2mZ', 'ünïcode-id']) {
        const { user_hash } = exportRow(
            {
                id: 1,
                createdAt: '2026-11-19T00:00:00.000000Z',
                name: 'studio.card',
                userId,
                visitorId: null,
                page: null,
                props: {},
            },
            KEY,
            exportRules(KEY),
        );

        assert.equal(accountDigest(userId, KEY), user_hash, userId);
    }
});

test('accountFor: a signed-in user gets the digest, a guest none', () => {
    const account = accountFor({ EXPORT_ID_HMAC_KEY: KEY }, () => assert.fail('logged'));

    assert.equal(account('user_1'), accountDigest('user_1', KEY));
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
