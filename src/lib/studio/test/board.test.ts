import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scrollView } from '../../../components/organisms/Studio/canvas/board.ts';

test('a glide sent past the sheet edge eases all the way to the edge', () => {
    const frames: FrameRequestCallback[] = [];
    const tops: number[] = [];
    const scroller = {
        scrollLeft: 0,
        scrollTop: 300,
        scrollWidth: 1000,
        clientWidth: 1000,
        scrollHeight: 2000,
        clientHeight: 500,
        addEventListener: () => {},
        removeEventListener: () => {},
        scrollTo({ top = 0 }: ScrollToOptions) {
            // The browser holds the position inside the scroll range.
            this.scrollTop = Math.max(0, top);
            tops.push(this.scrollTop);
        },
    };

    Object.assign(globalThis, {
        window: { matchMedia: () => ({ matches: false }) },
        getComputedStyle: () => ({ getPropertyValue: () => '900ms' }),
        requestAnimationFrame: (run: FrameRequestCallback) => frames.push(run),
        cancelAnimationFrame: () => {},
    });

    const start = performance.now();

    scrollView(scroller as unknown as HTMLElement, { left: 0, top: -400 });

    for (let at = 100; frames.length > 0; at += 100) {
        frames.shift()!(start + at);
    }

    assert.equal(Math.round(tops.at(-1)!), 0);
    // Every frame before the glide's end is still on its way: none reaches
    // the edge early and stops there.
    assert.ok(tops.slice(0, -1).every((top) => top > 0));
});
