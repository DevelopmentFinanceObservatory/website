import assert from 'node:assert/strict';
import test from 'node:test';

import { libraryViewOf, readLibraryEnabled } from '../switch.ts';

test('LIBRARY_ENABLED turns the Library on only when it is exactly true', () => {
    assert.equal(readLibraryEnabled('true'), true);

    for (const value of [undefined, '', 'false', 'TRUE', 'True', ' true', 'true ', '1', 'yes']) {
        assert.equal(readLibraryEnabled(value), false, String(value));
    }
});

test('the Library view is open when enabled, a preview for admins when not, else hidden', () => {
    const rows: [boolean, boolean, 'open' | 'preview' | null][] = [
        [true, true, 'open'],
        [true, false, 'open'],
        [false, true, 'preview'],
        [false, false, null],
    ];

    for (const [enabled, isAdmin, view] of rows) {
        assert.equal(libraryViewOf(enabled, isAdmin), view, `${enabled} ${isAdmin}`);
    }
});
