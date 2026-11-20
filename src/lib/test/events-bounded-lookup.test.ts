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

test('a share view records who viewed it, and only a confirmed non-owner view keeps the share id', async (t) => {
    t.mock.method(console, 'warn', () => {});

    const owns = (shareId: string, userId: string) =>
        Promise.resolve(shareId === 's1' && userId === 'u1');
    const cases = [
        ['signed out', () => Promise.resolve(null), owns, { shareId: 's1', viewer: 'signed_out' }],
        ['the owner', () => Promise.resolve(SESSION), owns, { viewer: 'owner' }],
        [
            'another signed-in user',
            () => Promise.resolve({ user: { ...SESSION.user, id: 'u2' } }),
            owns,
            { shareId: 's1', viewer: 'other' },
        ],
        [
            'a session read that rejects',
            () => Promise.reject(new Error('db')),
            owns,
            { viewer: 'unknown' },
        ],
        [
            'an owner read that rejects',
            () => Promise.resolve(SESSION),
            () => Promise.reject(new Error('db')),
            { viewer: 'unknown' },
        ],
    ] as const;

    for (const [label, readSession, ownsShare, expected] of cases) {
        await t.test(label, async () => {
            const event = await shareViewEvent({
                shareId: 's1',
                props: { kind: 'card' },
                label: 'share.open',
                readSession,
                ownsShare,
            });

            assert.deepEqual(event.props, { kind: 'card', ...expected });
            assert.equal(event.who.userId, null);
        });
    }
});

test("a share view's who keeps the session email's domain alone", async () => {
    const event = await shareViewEvent({
        shareId: 's1',
        props: { kind: 'card' },
        label: 'embed.view',
        readSession: () => Promise.resolve(SESSION),
        ownsShare: () => Promise.resolve(true),
    });

    assert.equal(event.who.email, '@example.org');
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
