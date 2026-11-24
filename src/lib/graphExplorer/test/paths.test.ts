/**
 * `paths.ts`: the screen a path belongs to.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECK_SHEET_PATH, EXPLORE_PATH, screenOf, SEED_PATH } from '../paths.ts';

for (const [path, screen] of [
    [EXPLORE_PATH, 'explore'],
    [`${EXPLORE_PATH}?node=FinancialFlow`, 'explore'],
    [SEED_PATH, 'seed'],
    [`${SEED_PATH}?dataset=provenance%2FOECDDAC2A`, 'seed'],
    [CHECK_SHEET_PATH, 'check-sheet'],
] as const) {
    test(`${path} belongs to the ${screen} screen`, () => {
        assert.equal(screenOf(path), screen);
    });
}
