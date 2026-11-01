import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';

import type { Browser } from 'playwright-core';

import { launchBrowser } from '../browser.ts';

/** The browser the Chrome-backed tests share, or why none starts. */
export const startBrowser = (): Promise<Browser | string> =>
    launchBrowser().catch((error: Error) => error.message);

/**
 * Whether a test that needs `browser` can run. Without one the test skips
 * with the reason, and under CI it fails with it, so a runner missing Chrome
 * cannot drop these tests unseen.
 */
export const hasBrowser = (t: TestContext, browser: Browser | string): browser is Browser => {
    if (typeof browser !== 'string') {
        return true;
    }

    if (process.env.CI) {
        assert.fail(browser);
    }

    t.skip(browser);

    return false;
};
