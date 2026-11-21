import assert from 'node:assert/strict';
import test from 'node:test';

import {
    checkPage,
    exitCode,
    expectedTier,
    liveSwitch,
    problems,
    withRetries,
    type Failure,
    type PageLike,
    type Result,
} from './check-live.mts';

const result = (over: Partial<Result> = {}): Result => ({
    slug: 'p',
    live: false,
    tier: 'committed',
    ms: 10,
    failure: null,
    errors: [],
    ...over,
});

const timeout = () => Object.assign(new Error('timeout'), { name: 'TimeoutError' });

/** A page that loads, holds an island with `tier` and `live`, unless told otherwise. */
const fakePage = (
    options: {
        tier?: string;
        live?: string | null;
        island?: boolean;
        navigation?: Error;
        hangs?: boolean;
        pageError?: string;
    } = {},
): PageLike => {
    let onError: (error: Error) => void = () => {};
    const attributes: Record<string, string | null> = {
        'data-read-tier': options.tier ?? 'committed',
        'data-read-live': options.live === undefined ? 'false' : options.live,
    };

    return {
        on: (_event, handler) => {
            onError = handler;
        },
        goto: async () => {
            if (options.navigation !== undefined) {
                throw options.navigation;
            }

            if (options.pageError !== undefined) {
                onError(new Error(options.pageError));
            }
        },
        $: async () => (options.island === false ? null : {}),
        waitForSelector: async () => {
            if (options.hangs) {
                throw timeout();
            }
        },
        getAttribute: async (_selector, name) => attributes[name] ?? null,
    };
};

test("a switch on implies stored and off committed; the island's attribute is the switch", () => {
    assert.equal(expectedTier(true), 'stored');
    assert.equal(expectedTier(false), 'committed');
    assert.equal(liveSwitch('true'), true);
    assert.equal(liveSwitch('false'), false);
    assert.equal(liveSwitch(null), null);
    assert.equal(liveSwitch('yes'), null);
});

test('a run passes only when every page settles on the tier its island states, with no error', () => {
    assert.equal(exitCode([result(), result({ live: true, tier: 'stored' })]), 0);
    assert.equal(exitCode([result(), result({ tier: 'stored' })]), 1);
    assert.equal(exitCode([result({ live: true, tier: 'committed' })]), 1);
    assert.equal(exitCode([result({ tier: 'failed' })]), 1);
    assert.equal(exitCode([result({ live: null })]), 1);
    assert.equal(exitCode([result({ tier: null, failure: 'not_settled' })]), 1);
    assert.equal(exitCode([result({ errors: ['boom'] })]), 1);
    assert.equal(exitCode([]), 1);
});

test('checkPage checks the settled tier against the served switch, and reports a page error', async () => {
    assert.deepEqual(
        problems(await checkPage(fakePage({ tier: 'stored', live: 'true' }), 'u', 'p')),
        [],
    );
    assert.deepEqual(problems(await checkPage(fakePage(), 'u', 'p')), []);

    // A served switch that is on, with the island on committed figures.
    const wrong = await checkPage(fakePage({ tier: 'committed', live: 'true' }), 'u', 'p');

    assert.equal(wrong.failure, null);
    assert.equal(problems(wrong).length, 1);

    const unstated = await checkPage(fakePage({ live: null }), 'u', 'p');

    assert.equal(unstated.live, null);
    assert.equal(exitCode([unstated]), 1);

    const errored = await checkPage(fakePage({ pageError: 'boom' }), 'u', 'p');

    assert.deepEqual(errored.errors, ['boom']);
    assert.equal(exitCode([errored]), 1);
});

test('checkPage names a navigation timeout, a failed load, a missing island and an unsettled one apart', async () => {
    const cases: [PageLike, Failure][] = [
        [fakePage({ navigation: timeout() }), 'navigation_timeout'],
        [fakePage({ navigation: new Error('net::ERR_NAME_NOT_RESOLVED') }), 'navigation_failed'],
        [fakePage({ island: false }), 'no_island'],
        [fakePage({ hangs: true }), 'not_settled'],
    ];

    for (const [page, failure] of cases) {
        const checked = await checkPage(page, 'u', 'p');

        assert.equal(checked.failure, failure);
        assert.equal(checked.tier, null);
        assert.equal(exitCode([checked]), 1);
    }
});

test('a page with no island fails at once, without waiting for it to settle', async () => {
    let waited = false;
    const page: PageLike = {
        ...fakePage({ island: false }),
        waitForSelector: async () => {
            waited = true;
        },
    };

    assert.equal((await checkPage(page, 'u', 'p')).failure, 'no_island');
    assert.equal(waited, false);
});

test('withRetries runs again after a failing run, up to its attempts, and stops at a pass', async () => {
    const slept: number[] = [];
    const sleep = async (ms: number) => {
        slept.push(ms);
    };
    const runs = [[result({ tier: 'loading' })], [result()], [result()]];
    let made = 0;
    const passed = await withRetries(async () => runs[made++] ?? [], {
        attempts: 4,
        delayMs: 20,
        sleep,
    });

    assert.equal(exitCode(passed), 0);
    assert.equal(made, 2);
    assert.deepEqual(slept, [20]);

    made = 0;
    const failed = await withRetries(async () => [result({ live: true })], {
        attempts: 3,
        delayMs: 20,
        sleep: async () => {
            made += 1;
        },
    });

    assert.equal(exitCode(failed), 1);
    assert.equal(made, 2);
});
