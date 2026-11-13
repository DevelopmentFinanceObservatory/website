/**
 * `googleConsent.ts`: the consent trip as the return address records it,
 * and the Create Google Sheet control's state for each answer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    answerState,
    consentReturns,
    consentTrip,
    initialCreateState,
    keepReturned,
    type ConsentTrip,
} from '../googleConsent.ts';
import type { SheetsAnswer } from '../googleSheet.ts';

const trip = (query: string) => consentTrip(new URLSearchParams(query));
const tripOf = (href: string) => consentTrip(new URL(href, 'https://site.example').searchParams);

test('a return with an error never counts as granted', () => {
    assert.equal(trip(''), 'none');
    assert.equal(trip('class=X&google=1'), 'granted');
    assert.equal(trip('class=X&error=access_denied'), 'refused');
    assert.equal(trip('class=X&google=1&error=access_denied'), 'refused');
});

test('only the success address carries the mark, and both drop the last trip', () => {
    const { callbackURL, errorCallbackURL } = consentReturns(
        'https://site.example/graph-explorer/new-sheet?class=X&google=1&error=access_denied',
    );
    assert.equal(callbackURL, '/graph-explorer/new-sheet?class=X&google=1');
    assert.equal(errorCallbackURL, '/graph-explorer/new-sheet?class=X');
    assert.equal(tripOf(errorCallbackURL), 'none');
});

test('the mark of a granted trip survives a rewritten query, and only that one', () => {
    const href = '/graph-explorer/new-sheet?class=Y';
    const kept = (query: string) => keepReturned(href, new URLSearchParams(query));
    assert.equal(tripOf(kept('google=1')), 'granted');
    assert.equal(
        tripOf(keepReturned('/graph-explorer/new-sheet', new URLSearchParams('google=1'))),
        'granted',
    );
    assert.equal(kept(''), href);
    assert.equal(kept('google=1&error=x'), href);
});

test('a refused trip opens on the consent screen again', () => {
    assert.equal(initialCreateState('refused').kind, 'needs_google');
    assert.equal(initialCreateState('none').kind, 'idle');
    assert.equal(initialCreateState('granted').kind, 'idle');
});

const refusal = (code: string, reason?: string) =>
    ({ ok: false, code, reason, message: 'm' }) as SheetsAnswer;

for (const [answer, now, expected] of [
    [{ ok: true, url: 'u', dropdowns: 'added' }, 'none', 'created'],
    [null, 'none', 'failed'],
    [refusal('google_access_needed', 'scope_missing'), 'none', 'needs_google'],
    [refusal('google_access_needed', 'scope_missing'), 'refused', 'needs_google'],
    [refusal('google_access_needed', 'token_expired'), 'granted', 'failed'],
    [refusal('google_renewal_failed'), 'none', 'renewal_failed'],
    [refusal('google_renewal_failed'), 'granted', 'renewal_failed'],
    [refusal('google_failed'), 'none', 'failed'],
    [refusal('auth_failed'), 'none', 'failed'],
    [refusal('signed_out'), 'none', 'failed'],
] as [SheetsAnswer | null, ConsentTrip, string][]) {
    test(`${answer === null ? 'no answer' : answer.ok ? 'a sheet' : answer.code} after trip ${now} is ${expected}`, () => {
        assert.equal(answerState(answer, now).kind, expected);
    });
}

test('a created sheet carries its address and whether its dropdowns failed', () => {
    assert.deepEqual(answerState({ ok: true, url: 'u', dropdowns: 'failed' }, 'none'), {
        kind: 'created',
        url: 'u',
        dropdownsFailed: true,
    });
});
