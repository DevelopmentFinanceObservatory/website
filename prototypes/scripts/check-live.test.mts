import assert from 'node:assert/strict';
import test from 'node:test';

import {
    checkPage,
    exitCode,
    expectedTier,
    problems,
    readFlag,
    type PageLike,
    type Result,
} from './check-live.mts';

const result = (over: Partial<Result> = {}): Result => ({
    slug: 'p',
    expected: 'committed',
    tier: 'committed',
    ms: 10,
    errors: [],
    ...over,
});

const fakePage = (options: { tier?: string; hangs?: boolean; pageError?: string }): PageLike => {
    let onError: (error: Error) => void = () => {};

    return {
        on: (_event, handler) => {
            onError = handler;
        },
        goto: async () => {
            if (options.pageError !== undefined) {
                onError(new Error(options.pageError));
            }
        },
        waitForSelector: async () => {
            if (options.hangs) {
                throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
            }
        },
        getAttribute: async () => options.tier ?? null,
    };
};

test('readFlag reads the switch from source and refuses a missing one', () => {
    assert.equal(readFlag('export const READ_LIVE = true;\n', 'READ_LIVE'), true);
    assert.equal(readFlag('export const READ_LIVE = false;\n', 'READ_LIVE'), false);
    assert.throws(() => readFlag('const READ_LIVE = true;', 'READ_LIVE'));
});

test('a flag on implies stored and a flag off implies committed', () => {
    assert.equal(expectedTier(true), 'stored');
    assert.equal(expectedTier(false), 'committed');
});

test('a run passes only when every page matches and none errors or hangs', () => {
    assert.equal(exitCode([result(), result()]), 0);
    assert.equal(exitCode([result(), result({ tier: 'stored' })]), 1);
    assert.equal(exitCode([result({ tier: 'failed' })]), 1);
    assert.equal(exitCode([result({ tier: null })]), 1);
    assert.equal(exitCode([result({ errors: ['boom'] })]), 1);
    assert.equal(exitCode([]), 1);
});

test('checkPage reports the settled tier, a page error and a page that never settles', async () => {
    const ok = await checkPage(fakePage({ tier: 'stored' }), 'u', 'p', 'stored');

    assert.deepEqual(problems(ok), []);

    const wrong = await checkPage(fakePage({ tier: 'committed' }), 'u', 'p', 'stored');

    assert.equal(wrong.tier, 'committed');
    assert.equal(problems(wrong).length, 1);

    const errored = await checkPage(
        fakePage({ tier: 'committed', pageError: 'boom' }),
        'u',
        'p',
        'committed',
    );

    assert.deepEqual(errored.errors, ['boom']);
    assert.equal(exitCode([errored]), 1);

    const hung = await checkPage(fakePage({ hangs: true }), 'u', 'p', 'stored');

    assert.equal(hung.tier, null);
    assert.equal(exitCode([hung]), 1);
});
