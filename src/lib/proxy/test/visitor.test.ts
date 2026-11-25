/**
 * `visitor.ts`: which `dfo_v` tokens read as a visitor, when a GET gets
 * a new cookie and with which attributes, and the start-up rule for a
 * missing CALLER_HMAC_KEY.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';

import {
    checkVisitorKey,
    issueVisitorCookie,
    mintVisitorToken,
    readVisitor,
    verifyVisitorToken,
    visitorKey,
    visitorLimitsOn,
    VISITOR_TOKEN_TTL,
} from '../visitor.ts';
import { visitorCounterKey, visitorDailyCounterKey } from '../limitCounter.ts';

const CALLER_KEY = 'test-caller-key';
const KEY = visitorKey(CALLER_KEY);
const NOW = 1_800_000_000_000;
const TTL_MS = VISITOR_TOKEN_TTL * 1000;

const saved = {
    key: process.env.CALLER_HMAC_KEY,
    enabled: process.env.VISITOR_LIMITS_ENABLED,
};

const restore = (name: string, value: string | undefined) => {
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
};

beforeEach(() => {
    process.env.CALLER_HMAC_KEY = CALLER_KEY;
    delete process.env.VISITOR_LIMITS_ENABLED;
});

afterEach(() => {
    restore('CALLER_HMAC_KEY', saved.key);
    restore('VISITOR_LIMITS_ENABLED', saved.enabled);
});

const withCookie = (cookie: string) => new Headers({ cookie });
const idOf = (token: string) => token.split('.')[0];

const pageLoad = (cookie?: string, overrides: Partial<{ method: string; dest: string }> = {}) => ({
    method: overrides.method ?? 'GET',
    url: 'https://developmentfinance.org/data',
    headers: new Headers({
        'sec-fetch-dest': overrides.dest ?? 'document',
        ...(cookie ? { cookie } : {}),
    }),
});

test('the key is HMAC-SHA-256 of visitor-token under CALLER_HMAC_KEY', () => {
    assert.deepEqual(KEY, createHmac('sha256', CALLER_KEY).update('visitor-token').digest());
});

test('readVisitor: a token this key signed reads as its id until it expires', () => {
    const token = mintVisitorToken(KEY, NOW);

    assert.equal(readVisitor(withCookie(`a=1; dfo_v=${token}; b=2`), NOW), idOf(token));
    assert.equal(readVisitor(withCookie(`dfo_v=${token}`), NOW + TTL_MS - 1000), idOf(token));
    assert.equal(readVisitor(withCookie(`dfo_v=${token}`), NOW + TTL_MS), null);
});

test('readVisitor: refuses a forged, altered, foreign-key or malformed token', () => {
    const token = mintVisitorToken(KEY, NOW);
    const [id, expires, tag = ''] = token.split('.');
    const flipped = `${tag.slice(0, -2)}${tag.at(-2) === 'A' ? 'B' : 'A'}${tag.at(-1)}`;
    const cases = {
        forgedTag: `${id}.${expires}.${flipped}`,
        laterExpiry: `${id}.${Number(expires) + 3600}.${tag}`,
        otherId: `${'A'.repeat(22)}.${expires}.${tag}`,
        otherKey: mintVisitorToken(visitorKey('another-key'), NOW),
        noTag: `${id}.${expires}`,
        empty: '',
    };

    for (const [name, value] of Object.entries(cases)) {
        assert.equal(readVisitor(withCookie(`dfo_v=${value}`), NOW), null, name);
    }
});

test('readVisitor: a valid token after an invalid one still reads', () => {
    const token = mintVisitorToken(KEY, NOW);

    assert.equal(readVisitor(withCookie(`dfo_v=junk; dfo_v=${token}`), NOW), idOf(token));
});

test('readVisitor: null without CALLER_HMAC_KEY', () => {
    const token = mintVisitorToken(KEY, NOW);
    delete process.env.CALLER_HMAC_KEY;

    assert.equal(readVisitor(withCookie(`dfo_v=${token}`), NOW), null);
});

test('verifyVisitorToken returns the id and expiry', () => {
    const token = mintVisitorToken(KEY, NOW);

    assert.deepEqual(verifyVisitorToken(token, KEY, NOW), {
        id: idOf(token),
        expires: NOW / 1000 + VISITOR_TOKEN_TTL,
    });
});

test('visitorLimitsOn: needs the key and the switch', () => {
    assert.equal(visitorLimitsOn(), true);

    process.env.VISITOR_LIMITS_ENABLED = 'false';
    assert.equal(visitorLimitsOn(), false);

    process.env.VISITOR_LIMITS_ENABLED = 'true';
    delete process.env.CALLER_HMAC_KEY;
    assert.equal(visitorLimitsOn(), false);
});

test('issueVisitorCookie: a page load without a token gets one that reads back', () => {
    const cookie = issueVisitorCookie(pageLoad(), NOW);

    assert.ok(cookie);
    assert.deepEqual(
        { ...cookie, value: undefined },
        {
            name: 'dfo_v',
            value: undefined,
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 86_400,
        },
    );
    assert.equal(readVisitor(withCookie(`dfo_v=${cookie.value}`), NOW), idOf(cookie.value));
});

test('issueVisitorCookie: renews past half-life, keeps a fresher token', () => {
    const token = `dfo_v=${mintVisitorToken(KEY, NOW)}`;

    assert.equal(issueVisitorCookie(pageLoad(token), NOW + TTL_MS / 2 - 1000), null);
    assert.ok(issueVisitorCookie(pageLoad(token), NOW + TTL_MS / 2 + 1000));
    assert.ok(issueVisitorCookie(pageLoad('dfo_v=forged.1.x'), NOW));
});

test('issueVisitorCookie: a renewal keeps the id, so the per-minute and daily counters carry over', () => {
    const held = mintVisitorToken(KEY, NOW);
    const at = NOW + TTL_MS / 2 + 1000;
    const renewed = issueVisitorCookie(pageLoad(`dfo_v=${held}`), at);
    const counters = (id: string | null) =>
        id && [visitorCounterKey('api', id), visitorDailyCounterKey('api', id)];

    assert.ok(renewed);
    assert.notEqual(renewed.value, held);
    assert.ok(verifyVisitorToken(renewed.value, KEY, at)!.expires * 1000 > NOW + TTL_MS);
    assert.deepEqual(
        counters(readVisitor(withCookie(`dfo_v=${renewed.value}`), at)),
        counters(readVisitor(withCookie(`dfo_v=${held}`), at)),
    );
});

test('issueVisitorCookie: any GET gets one, an RSC navigation or prefetch included; a POST does not', () => {
    for (const dest of ['empty', 'iframe']) {
        assert.ok(issueVisitorCookie(pageLoad(undefined, { dest }), NOW), dest);
    }

    const noDest = pageLoad();
    noDest.headers.delete('sec-fetch-dest');
    assert.ok(issueVisitorCookie(noDest, NOW));

    assert.equal(issueVisitorCookie(pageLoad(undefined, { method: 'POST' }), NOW), null);
});

test('issueVisitorCookie: none with the switch off or no key', () => {
    process.env.VISITOR_LIMITS_ENABLED = 'off';
    assert.equal(issueVisitorCookie(pageLoad(), NOW), null);

    delete process.env.VISITOR_LIMITS_ENABLED;
    delete process.env.CALLER_HMAC_KEY;
    assert.equal(issueVisitorCookie(pageLoad(), NOW), null);
});

test('issueVisitorCookie: Secure except over plain http to localhost', () => {
    const at = (url: string) => issueVisitorCookie({ ...pageLoad(), url }, NOW)?.secure;

    assert.equal(at('http://localhost:3000/'), false);
    assert.equal(at('http://127.0.0.1:3000/'), false);
    assert.equal(at('https://localhost:3000/'), true);
    assert.equal(at('http://developmentfinance.org/'), true);
});

test('checkVisitorKey: production with limits on refuses to start without the key', () => {
    const logged: string[] = [];
    const log = (message: string) => logged.push(message);

    checkVisitorKey(true, log);
    assert.deepEqual(logged, []);

    delete process.env.CALLER_HMAC_KEY;
    assert.throws(() => checkVisitorKey(true, log));
    assert.deepEqual(logged, []);

    checkVisitorKey(false, log);
    assert.equal(logged.length, 1);

    process.env.VISITOR_LIMITS_ENABLED = 'false';
    checkVisitorKey(true, log);
    assert.equal(logged.length, 2);
});
