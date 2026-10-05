import assert from 'node:assert/strict';
import test from 'node:test';

import { optionsAsker } from '../optionsAsker.ts';

// A request that settles when the test says so, and counts its calls.
const controlled = () => {
    const settles: ((options: string | null) => void)[] = [];
    let calls = 0;
    const request = () => {
        calls++;

        return new Promise<string | null>((resolve) => settles.push(resolve));
    };

    return { request, settles, calls: () => calls };
};

test('two opens while a request is in flight make one request', async () => {
    const asker = optionsAsker<string>();
    const door = controlled();
    const first = asker.ask('spec-a', door.request);
    const second = asker.ask('spec-a', door.request);

    assert.equal(door.calls(), 1);
    assert.equal(second, null);

    door.settles[0]!('options');

    assert.equal(await first, 'options');
});

test('a failed request clears the marker, so the next open asks again', async () => {
    const asker = optionsAsker<string>();
    const door = controlled();
    const failed = asker.ask('spec-a', door.request);

    door.settles[0]!(null);
    await failed;

    const retried = asker.ask('spec-a', door.request);

    assert.equal(door.calls(), 2);

    door.settles[1]!('options');

    assert.equal(await retried, 'options');
});

test('an answer is kept, so reopening makes no request', async () => {
    const asker = optionsAsker<string>();
    const door = controlled();
    const answered = asker.ask('spec-a', door.request);

    door.settles[0]!('options');
    await answered;

    assert.equal(asker.ask('spec-a', door.request), null);
    assert.equal(door.calls(), 1);
});

test('a spec a mint answered is not asked for, and a reset asks again', () => {
    const asker = optionsAsker<string>();
    const door = controlled();

    asker.answered('spec-a');

    assert.equal(asker.ask('spec-a', door.request), null);

    asker.reset();
    asker.ask('spec-a', door.request);

    assert.equal(door.calls(), 1);
});

test('a request that fails after a reset leaves the newer marker alone', async () => {
    const asker = optionsAsker<string>();
    const door = controlled();
    const stale = asker.ask('spec-a', door.request);

    asker.reset();
    asker.ask('spec-a', door.request);
    door.settles[0]!(null);
    await stale;

    assert.equal(asker.ask('spec-a', door.request), null);
    assert.equal(door.calls(), 2);
});

test('pending hands back the request in flight and nothing once it settles', async () => {
    const asker = optionsAsker<string>();
    const door = controlled();

    assert.equal(asker.pending('spec-a'), null);

    const asked = asker.ask('spec-a', door.request);

    assert.equal(asker.pending('spec-a'), asked);
    assert.equal(asker.pending('spec-b'), null);

    door.settles[0]!('options');
    await asked;

    assert.equal(asker.pending('spec-a'), null);
    assert.equal(asker.ask('spec-a', door.request), null);
    assert.equal(door.calls(), 1);
});
