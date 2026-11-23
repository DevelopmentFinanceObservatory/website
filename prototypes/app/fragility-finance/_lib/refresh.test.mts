import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import refs from '../_data/refs.json' with { type: 'json' };

import { parseClassification } from './classification.ts';
import { recipientGroups, sources } from './figures.ts';
import { context } from './fixture.mts';
import { loadRefresh, profilesOf } from './refresh.ts';

import { assertSameSources } from '#lib/sameSources.mts';

const profiles = parseClassification(
    readFileSync(new URL('../_data/fragility-2026.tsv', import.meta.url), 'utf8'),
);
const built = { contexts: profiles.map((profile) => context(profile)), groups: {} as never };

test('the browser takes the classification back from the built figures, in its order', () => {
    assert.deepEqual(profilesOf(built), profiles);
});

test('the browser reads again the sources the build reads', async () => {
    const { sources: loaded } = await loadRefresh(built);

    // As _lib/build.ts reads them, from the classification file.
    assertSameSources(loaded, sources(refs.data, recipientGroups(refs.data, profiles)));
});
