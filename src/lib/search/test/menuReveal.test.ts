import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { afterScrollSettles } from '../menuReveal.ts';

// A page whose scroll events the test dispatches, with Node's own
// EventTarget and mocked timers, and a count of how often the menu opened.
const page = (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const target = new EventTarget();
    const controller = new AbortController();
    let opens = 0;
    afterScrollSettles(target, controller.signal, () => (opens += 1), {
        quietMs: 150,
        capMs: 1000,
    });

    return {
        fire: (type: string) => target.dispatchEvent(new Event(type)),
        tick: (ms: number) => t.mock.timers.tick(ms),
        abort: () => controller.abort(),
        opens: () => opens,
    };
};

test('scrollend opens the menu once, and later timers do not open it again', (t) => {
    const p = page(t);
    p.fire('scroll');
    p.fire('scrollend');
    p.tick(2000);
    assert.equal(p.opens(), 1);
});

test('a scroll still moving holds the menu until it goes quiet', (t) => {
    const p = page(t);
    for (let frame = 0; frame < 5; frame += 1) {
        p.tick(100);
        p.fire('scroll');
    }
    assert.equal(p.opens(), 0);
    p.tick(150);
    assert.equal(p.opens(), 1);
});

test('a scroll that never settles opens the menu at the cap', (t) => {
    const p = page(t);
    for (let elapsed = 0; elapsed < 999; elapsed += 100) {
        p.fire('scroll');
        p.tick(100);
    }
    assert.equal(p.opens(), 1);
});

for (const [name, interrupt] of [
    ['an abort', (p: ReturnType<typeof page>) => p.abort()],
    ['a pointer press', (p: ReturnType<typeof page>) => p.fire('pointerdown')],
    ['a wheel turn', (p: ReturnType<typeof page>) => p.fire('wheel')],
] as const) {
    test(`${name} during the scroll keeps the menu shut`, (t) => {
        const p = page(t);
        p.fire('scroll');
        interrupt(p);
        p.fire('scrollend');
        p.tick(2000);
        assert.equal(p.opens(), 0);
    });
}
