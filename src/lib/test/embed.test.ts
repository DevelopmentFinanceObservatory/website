import assert from 'node:assert/strict';
import test from 'node:test';

import { isEmbedPath } from '../embed.ts';

const cases: [string, boolean][] = [
    ['/embed/abc', true],
    ['/embed/abc/x', true],
    ['/embed', false],
    ['/embedded', false],
    ['/embed-abc', false],
    ['/', false],
    ['/s/abc', false],
];

for (const [pathname, expected] of cases) {
    test(`isEmbedPath(${pathname}) is ${expected}`, () => {
        assert.equal(isEmbedPath(pathname), expected);
    });
}
