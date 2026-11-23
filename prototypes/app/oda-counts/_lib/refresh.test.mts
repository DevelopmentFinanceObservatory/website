import test from 'node:test';

import liveRefs from '../_data/live-refs.json' with { type: 'json' };

import { countsSources } from './derive.ts';
import { loadRefresh } from './refresh.ts';

import { assertSameSources } from '#lib/sameSources.mts';

test('the browser reads again the sources the build reads', async () => {
    const { sources } = await loadRefresh();

    // As _lib/build.ts reads them.
    assertSameSources(sources, countsSources(liveRefs.data));
});
