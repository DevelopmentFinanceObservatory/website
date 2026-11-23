// A test helper: asserts two pages' sources read the same things, comparing recipes with
// `Recipe.equals`, since a recipe keeps its tree in private fields deepEqual cannot see.
import assert from 'node:assert/strict';

import type { LiveSource } from './liveRead.ts';

/** Asserts `actual` holds the keys of `expected`, each the same ref or an equal recipe. */
export const assertSameSources = (
    actual: Readonly<Record<string, LiveSource>>,
    expected: Readonly<Record<string, LiveSource>>,
): void => {
    assert.deepEqual(Object.keys(actual).toSorted(), Object.keys(expected).toSorted());

    for (const [key, source] of Object.entries(expected)) {
        const other = actual[key];

        if ('recipe' in source) {
            assert.ok(other !== undefined && 'recipe' in other, `${key} is no recipe`);
            assert.ok(source.recipe.equals(other.recipe), `${key} sends another recipe`);
        } else {
            assert.deepEqual(other, source, `${key} reads another ref`);
        }
    }
};
