import assert from 'node:assert/strict';
import test from 'node:test';

import { likeContaining, likeLiteral } from '../likePattern.ts';

test('likeLiteral: the pattern characters and the escape stand for themselves', () => {
    assert.equal(likeLiteral('50%_off\\'), '50\\%\\_off\\\\');
    assert.equal(likeLiteral('plain'), 'plain');
    assert.equal(likeContaining('a_b'), '%a\\_b%');
});
