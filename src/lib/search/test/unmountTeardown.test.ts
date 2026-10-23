import assert from 'node:assert/strict';
import test from 'node:test';

import { unmountTeardown } from '../unmountTeardown.ts';

/** A teardown over a manual queue, and how many times it ran. */
const lifecycle = () => {
    const queue: (() => void)[] = [];
    let runs = 0;
    const guard = unmountTeardown(
        () => runs++,
        (run) => queue.push(run),
    );

    return {
        guard,
        flush: () => queue.splice(0).forEach((run) => run()),
        runs: () => runs,
    };
};

test('a Strict Mode unmount and remount in one pass tears nothing down', () => {
    const { guard, flush, runs } = lifecycle();

    guard.mount();
    guard.unmount();
    guard.mount();
    flush();

    assert.equal(runs(), 0);
    assert.equal(guard.left(), false);
});

test('a real unmount tears down once, after the pass that unmounted it', () => {
    const { guard, flush, runs } = lifecycle();

    guard.mount();
    guard.unmount();
    guard.mount();
    guard.unmount();

    assert.equal(runs(), 0);
    assert.equal(guard.left(), false);

    flush();
    flush();

    assert.equal(runs(), 1);
    assert.equal(guard.left(), true);

    guard.mount();

    assert.equal(guard.left(), false);
});
