import assert from 'node:assert/strict';
import test from 'node:test';

import { hasServiceConsent, onServiceConsent, USAGE_STATS_SERVICE } from '../consent.ts';

const details = (given: boolean) => ({
    services: { [USAGE_STATS_SERVICE]: { consent: { given } } },
});

// A stand-in browser window, an EventTarget carrying the CMP stub.
const stubWindow = (ucCmp?: unknown) => {
    Object.assign(globalThis, { window: Object.assign(new EventTarget(), { __ucCmp: ucCmp }) });
};

test.afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
});

test('consent given', async () => {
    stubWindow({ isInitialized: async () => true, getConsentDetails: async () => details(true) });
    assert.equal(await hasServiceConsent(USAGE_STATS_SERVICE), true);
});

test('consent refused, or the service absent', async () => {
    stubWindow({ isInitialized: async () => true, getConsentDetails: async () => details(false) });
    assert.equal(await hasServiceConsent(USAGE_STATS_SERVICE), false);
    assert.equal(await hasServiceConsent('someOtherService'), false);
});

test('CMP not initialised', async () => {
    stubWindow({
        isInitialized: async () => false,
        getConsentDetails: async () => details(true),
    });
    assert.equal(await hasServiceConsent(USAGE_STATS_SERVICE), false);
});

test('API missing', async () => {
    assert.equal(await hasServiceConsent(USAGE_STATS_SERVICE), false); // no window
    stubWindow();
    assert.equal(await hasServiceConsent(USAGE_STATS_SERVICE), false); // no __ucCmp
});

test('API throwing', async () => {
    stubWindow({
        isInitialized: async () => true,
        getConsentDetails: async () => {
            throw new Error('CMP error');
        },
    });
    assert.equal(await hasServiceConsent(USAGE_STATS_SERVICE), false);
});

test('UC_CONSENT events report the service consent until unsubscribed', () => {
    stubWindow();
    const heard: boolean[] = [];
    const stop = onServiceConsent(USAGE_STATS_SERVICE, (given) => heard.push(given));
    const fire = (detail: unknown) =>
        window.dispatchEvent(new CustomEvent('UC_CONSENT', { detail }));

    fire(details(true));
    fire(details(false));
    fire({});
    stop();
    fire(details(true));

    assert.deepEqual(heard, [true, false, false]);
});
