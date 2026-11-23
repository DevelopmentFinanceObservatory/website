import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { AID_KEYS, AidRowsError, GF_KEYS, RECIPE_KEYS, YEARS } from './aid.ts';
import { hivFromRows, type HivKey, hivSources } from './figures.ts';
import { AID_DATA, AID_READ_ROWS, aidRows } from './rowsFixture.mts';

const LAST = YEARS.at(-1)!;

const rows = (): Record<HivKey, Record<string, unknown>[]> => ({
    ...aidRows(),
    aid: AID_READ_ROWS,
    plhiv: [
        { observationAbout: 'country/KEN', time_period: LAST, value: 1_400_000 },
        { observationAbout: 'country/CIV', time_period: LAST, value: 200_000 },
        // A region the page leaves out.
        { observationAbout: 'africa', time_period: LAST, value: 25_000_000 },
    ],
    art: [{ observationAbout: 'country/KEN', time_period: LAST, value: 87.3 }],
    deaths: [
        { observationAbout: 'country/KEN', time_period: YEARS[0], value: 30_000 },
        { observationAbout: 'country/KEN', time_period: LAST, value: 20_000 },
    ],
});

test('the figures are the aid figures, named from the aid read, and UNAIDS for each country', () => {
    assert.deepStrictEqual(hivFromRows(rows()), {
        data: AID_DATA,
        unaids: {
            KEN: {
                plhiv: 1_400_000,
                art: 87.3,
                deaths: YEARS.map((year) =>
                    year === YEARS[0] ? 30_000 : year === LAST ? 20_000 : null,
                ),
            },
            CIV: { plhiv: 200_000, art: null, deaths: YEARS.map(() => null) },
        },
    });
});

test('a build read whose labels or figures break a check fails', () => {
    const unlabelled = rows();

    unlabelled.aid = unlabelled.aid.map((row) =>
        row.financingProvider === 'country/GBR' ? { ...row, financingProvider_label: null } : row,
    );
    assert.throws(
        () => hivFromRows(unlabelled),
        (error) => error instanceof AidRowsError && error.code === 'aid_unlabelled',
    );

    // A country recipient of the aid read with no aid party, so its money is not counted.
    const extra = rows();

    extra.aid = [
        ...extra.aid,
        {
            ...AID_READ_ROWS[0]!,
            financingRecipient: 'country/UGA',
            financingRecipient_label: 'Uganda',
        },
    ];
    assert.throws(
        () => hivFromRows(extra),
        (error) =>
            error instanceof AidRowsError &&
            error.code === 'aid_checks_failed' &&
            error.checks.includes('aid_parties_not_countries'),
    );
});

test('the build reads each recipe, the Global Fund and aid reads, and the UNAIDS reads', () => {
    const refs = JSON.parse(
        readFileSync(new URL('../_data/live-refs.json', import.meta.url), 'utf8'),
    ).data;
    const sources = hivSources(refs);
    const readKeys = [...GF_KEYS, 'aid', 'plhiv', 'art', 'deaths'] as const;

    assert.deepEqual(
        Object.keys(sources).toSorted(),
        [...AID_KEYS, 'aid', 'plhiv', 'art', 'deaths'].toSorted(),
    );

    for (const key of RECIPE_KEYS) {
        assert.ok('recipe' in sources[key], key);
    }

    for (const key of readKeys) {
        assert.deepEqual(sources[key], { ref: refs[key] }, key);
    }
});
