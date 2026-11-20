import assert from 'node:assert/strict';
import test from 'node:test';

import { boundedLookup } from '../events/boundedLookup.ts';
import { shareViewEvent } from '../events/shareView.ts';
import { ttlMemo } from '../events/ttlMemo.ts';

const never = <T>(): Promise<T> => new Promise<T>(() => {});

test('boundedLookup answers the fallback for a lookup that never settles, throws or rejects', async (t) => {
    t.mock.method(console, 'warn', () => {});

    assert.equal(await boundedLookup(() => Promise.resolve('read'), 'fallback', 'x', 20), 'read');
    assert.equal(await boundedLookup(never<string>, 'fallback', 'x', 20), 'fallback');
    assert.equal(
        await boundedLookup(() => Promise.reject(new Error('db')), 'fallback', 'x'),
        'fallback',
    );
    assert.equal(
        await boundedLookup(
            () => {
                throw new Error('sync');
            },
            'fallback',
            'x',
        ),
        'fallback',
    );
});

const SESSION = { user: { id: 'u1', email: 'Ana@Example.org', emailVerified: true } };

// The two never-settling share-view reads each wait LOOKUP_TIMEOUT_MS (500 ms).
test('a share view records a signed-out view when the session read never settles', async (t) => {
    t.mock.method(console, 'warn', () => {});

    const event = await shareViewEvent({
        shareId: 's1',
        props: { kind: 'card' },
        label: 'share.open',
        readSession: never,
        ownsShare: () => Promise.resolve(true),
    });

    assert.deepEqual(event.props, { kind: 'card', shareId: 's1', owner: false });
    assert.equal(event.who.userId, null);
    assert.equal(event.who.email, null);
});

test('a share view counts the viewer as a non-owner when the owner read never settles', async (t) => {
    t.mock.method(console, 'warn', () => {});

    const event = await shareViewEvent({
        shareId: 's1',
        props: { kind: 'card' },
        label: 'embed.view',
        readSession: () => Promise.resolve(SESSION),
        ownsShare: never,
    });

    assert.deepEqual(event.props, { kind: 'card', shareId: 's1', owner: false });
});

test("an owner's own view keeps owner and drops the share id; no view carries the user id", async () => {
    const owned = await shareViewEvent({
        shareId: 's1',
        props: { kind: 'card' },
        label: 'share.open',
        readSession: () => Promise.resolve(SESSION),
        ownsShare: (shareId, userId) => Promise.resolve(shareId === 's1' && userId === 'u1'),
    });

    assert.deepEqual(owned.props, { kind: 'card', owner: true });
    assert.equal(owned.who.userId, null);
    assert.equal(owned.who.email, '@example.org');
});

test('ttlMemo loads a key once within the TTL, again after it, and forgets a rejected load', async () => {
    let clock = 0;
    let loads = 0;
    const memo = ttlMemo<string>({ ttlMs: 100, max: 2, now: () => clock });
    const load = () => {
        loads += 1;
        return Promise.resolve(`v${loads}`);
    };

    assert.equal(await memo('a', load), 'v1');
    clock = 99;
    assert.equal(await memo('a', load), 'v1');
    clock = 100;
    assert.equal(await memo('a', load), 'v2');

    await assert.rejects(memo('b', () => Promise.reject(new Error('db'))));
    assert.equal(await memo('b', load), 'v3');
});

test('ttlMemo holds at most max keys, dropping the oldest', async () => {
    let loads = 0;
    const memo = ttlMemo<number>({ ttlMs: 1_000, max: 2, now: () => 0 });
    const load = () => Promise.resolve((loads += 1));

    await memo('a', load);
    await memo('b', load);
    await memo('c', load);
    assert.equal(loads, 3);

    await memo('c', load);
    await memo('b', load);
    assert.equal(loads, 3);

    await memo('a', load);
    assert.equal(loads, 4);
});
