import assert from 'node:assert/strict';
import test from 'node:test';

import { runWhileSeen } from '../net.ts';

// Stand-in browser globals: observers the test drives by hand and a
// requestAnimationFrame queue the test flushes one frame at a time.
type Callback = (entries: unknown[]) => void;

const intersections: Callback[] = [];
const resizes: Callback[] = [];
let frames = new Map<number, (now: number) => void>();
let nextHandle = 1;

const install = () => {
    intersections.length = 0;
    resizes.length = 0;
    frames = new Map();
    Object.assign(globalThis, {
        IntersectionObserver: class {
            constructor(callback: Callback) {
                intersections.push(callback);
            }
            observe() {}
            disconnect() {}
        },
        ResizeObserver: class {
            constructor(callback: Callback) {
                resizes.push(callback);
            }
            observe() {}
            disconnect() {}
        },
        requestAnimationFrame: (callback: (now: number) => void) => {
            const handle = nextHandle++;

            frames.set(handle, callback);

            return handle;
        },
        cancelAnimationFrame: (handle: number) => {
            frames.delete(handle);
        },
        document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    });
};

const intersect = (isIntersecting: boolean) =>
    intersections.forEach((callback) => callback([{ isIntersecting }]));

const resize = (width: number, height: number) =>
    resizes.forEach((callback) => callback([{ contentRect: { width, height } }]));

const flushFrame = () => {
    const queued = [...frames.values()];

    frames.clear();
    queued.forEach((callback) => callback(performance.now()));
};

const target = {} as Element;
const host = {} as Element;

test('a hidden host queues no frame while its watched element is on screen', () => {
    install();
    let drawn = 0;
    const stop = runWhileSeen(target, () => drawn++, undefined, host);

    intersect(true);
    assert.equal(frames.size, 0);

    resize(1440, 900);
    assert.equal(frames.size, 1);
    flushFrame();
    flushFrame();
    assert.equal(drawn, 2);

    resize(0, 0);
    assert.equal(frames.size, 0);
    flushFrame();
    assert.equal(drawn, 2);

    resize(1440, 900);
    assert.equal(frames.size, 1);

    intersect(false);
    assert.equal(frames.size, 0);

    stop();
});

test('without a sized element the loop follows intersection alone', () => {
    install();
    const stop = runWhileSeen(target, () => {});

    assert.equal(resizes.length, 0);
    intersect(true);
    assert.equal(frames.size, 1);
    intersect(false);
    assert.equal(frames.size, 0);

    stop();
});
