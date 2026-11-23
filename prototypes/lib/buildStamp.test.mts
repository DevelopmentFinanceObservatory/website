import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStamp, matchesBuild, parseBuildStamp } from './buildStamp.ts';

test('a CI build stamps its commit and run, and a local build its commit alone', () => {
    assert.equal(buildStamp({ commit: 'abc', run: '42' }), 'abc+42');
    assert.equal(buildStamp({ commit: 'local', run: undefined }), 'local');
    assert.deepEqual(parseBuildStamp('abc+42'), { commit: 'abc', run: '42' });
    assert.deepEqual(parseBuildStamp('local'), { commit: 'local', run: null });
});

test('a stamp matches its commit with any run, and its run only when one is expected', () => {
    const stamp = buildStamp({ commit: 'abc', run: '42' });

    assert.equal(matchesBuild(stamp, { commit: 'abc', run: null }), true);
    assert.equal(matchesBuild(stamp, { commit: 'abc', run: '42' }), true);
    assert.equal(matchesBuild(stamp, { commit: 'abc', run: '41' }), false);
    assert.equal(matchesBuild(stamp, { commit: 'abd', run: null }), false);
    assert.equal(matchesBuild(null, { commit: 'abc', run: null }), false);
});
