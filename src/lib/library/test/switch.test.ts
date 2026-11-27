import assert from 'node:assert/strict';
import test from 'node:test';

import { readLibraryEnabled } from '../switch.ts';

test('LIBRARY_ENABLED turns the Library on only when it is exactly true', () => {
    assert.equal(readLibraryEnabled('true'), true);

    for (const value of [undefined, '', 'false', 'TRUE', 'True', ' true', 'true ', '1', 'yes']) {
        assert.equal(readLibraryEnabled(value), false, String(value));
    }
});
