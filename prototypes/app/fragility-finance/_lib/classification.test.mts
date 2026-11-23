import assert from 'node:assert/strict';
import test from 'node:test';

import { NAMES, parseClassification } from './classification.ts';

const HEADER = [
    'iso3',
    'country',
    'overall',
    'tier',
    'Economic.PC1',
    'Environmental.PC1',
    'Human.PC1',
    'Political.PC1',
    'Security.PC1',
    'Societal.PC1',
    'eco',
    'env',
    'hum',
    'pol',
    'sec',
    'soc',
    'country-fr',
].join('\t');

/** A row of the OECD's file for `iso3`, its dimension scores `overall` less up to 0.006. */
const line = (iso3: string, country: string, overall: number, tier: string) =>
    [
        iso3,
        country,
        overall,
        tier,
        ...[0, 0.001, 0.002, 0.003, 0.004, 0.006].map((step) => overall - step),
        ...[3, 1, 1, 2, 2, 1],
        country,
    ].join('\t');

/** A file of `extreme` and `high` contexts, in no order of score, the first COD. */
const file = (extreme: number, high: number) =>
    [
        HEADER,
        ...Array.from({ length: extreme + high }, (_, index) =>
            line(
                index === 0 ? 'COD' : `C${index}`,
                index === 0 ? 'Congo, Dem. Rep.' : `Country ${index}`,
                -1 - ((index * 7) % 62) / 10 - index / 1000,
                index < extreme ? 'extreme' : 'high',
            ),
        ),
    ].join('\n') + '\n';

test('the classification ranks 62 contexts by score, most fragile first', () => {
    const profiles = parseClassification(file(20, 42));

    assert.equal(profiles.length, 62);
    assert.deepEqual(
        profiles.map(({ rank }) => rank),
        Array.from({ length: 62 }, (_, index) => index + 1),
    );
    assert.ok(
        profiles.every((each, index) => index === 0 || profiles[index - 1]!.score <= each.score),
    );

    const congo = profiles.find(({ iso3 }) => iso3 === 'COD');

    // Scores round to two places, -1.006 to -1.01; the short name replaces the OECD's.
    assert.deepEqual(congo, {
        iso3: 'COD',
        name: NAMES.COD,
        tier: 'extreme',
        score: -1,
        rank: 62,
        dimensions: {
            eco: { score: -1, category: 3 },
            env: { score: -1, category: 1 },
            hum: { score: -1, category: 1 },
            pol: { score: -1, category: 2 },
            sec: { score: -1, category: 2 },
            soc: { score: -1.01, category: 1 },
        },
    });
    assert.equal(profiles.find(({ iso3 }) => iso3 === 'C1')?.name, 'Country 1');
});

test('the classification refuses other than 20 extreme and 42 high contexts', () => {
    assert.throws(() => parseClassification(file(21, 41)), /found 21 and 41/);
    assert.throws(() => parseClassification(file(20, 41)), /found 20 and 41/);
    assert.throws(
        () => parseClassification(file(20, 42).replace('\textreme\t', '\tmedium\t')),
        /COD has the tier medium/,
    );
    assert.throws(
        () => parseClassification(file(20, 42).replace('\t-1\t', '\t\t')),
        /COD has no number in overall/,
    );
});
