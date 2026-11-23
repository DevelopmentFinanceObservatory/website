import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import refs from '../_data/refs.json' with { type: 'json' };

import { parseClassification } from './classification.ts';
import { recipientGroups } from './figures.ts';
import { context } from './fixture.mts';
import { loadRefresh, profilesOf } from './refresh.ts';

const profiles = parseClassification(
    readFileSync(new URL('../_data/fragility-2026.tsv', import.meta.url), 'utf8'),
);
const built = { contexts: profiles.map((profile) => context(profile)), groups: {} as never };

test('the browser takes the classification back from the built figures, in its order', () => {
    assert.deepEqual(profilesOf(built), profiles);
});

test('the browser reads again what the build reads, for the same recipients', async () => {
    const { sources } = await loadRefresh(built);
    const groups = recipientGroups(refs.data, profiles);

    assert.deepEqual(
        Object.keys(sources).toSorted(),
        [
            ...Object.keys(groups).flatMap((key) => [key, `${key}/purposes`, `${key}/providers`]),
            ...['climate-total', 'climate-adaptation', 'climate-mitigation'].map(
                (key) => `${key}/total`,
            ),
            ...Object.keys(refs.data).filter((key) => !/^aid-|^climate-/.test(key)),
        ].toSorted(),
    );
});
