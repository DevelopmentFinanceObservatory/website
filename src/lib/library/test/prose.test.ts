import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProse } from '../prose.ts';

test('prose splits at blank lines, keeps single breaks and lists bullet runs', () => {
    assert.deepEqual(parseProse('One\nTwo\n\n  \nThree'), [
        { type: 'paragraph', lines: ['One', 'Two'] },
        { type: 'paragraph', lines: ['Three'] },
    ]);
    assert.deepEqual(parseProse('Intro:\n- a\n• b\nAfter\n\n- c'), [
        { type: 'paragraph', lines: ['Intro:'] },
        { type: 'list', items: ['a', 'b'] },
        { type: 'paragraph', lines: ['After'] },
        { type: 'list', items: ['c'] },
    ]);
    assert.deepEqual(parseProse('  \n'), []);
});
