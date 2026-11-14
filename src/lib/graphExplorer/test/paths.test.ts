/**
 * `paths.ts`: the screen a path belongs to.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECK_SHEET_PATH, EXPLORE_PATH, NEW_SHEET_PATH, screenOf } from '../paths.ts';

for (const [path, screen] of [
    [EXPLORE_PATH, 'explore'],
    [`${EXPLORE_PATH}?node=FinancialFlow`, 'explore'],
    [NEW_SHEET_PATH, 'new-sheet'],
    [`${NEW_SHEET_PATH}?class=FinancialFlow`, 'new-sheet'],
    [CHECK_SHEET_PATH, 'check-sheet'],
] as const) {
    test(`${path} belongs to the ${screen} screen`, () => {
        assert.equal(screenOf(path), screen);
    });
}
