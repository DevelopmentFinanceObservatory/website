import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { UnaidsFigures } from '../_data/types.ts';

import { readingOf, unaidsByCountry, type UnaidsRows } from './unaids.ts';

// Real rows from the pinned reads, with the figures `unaids_by_country` in fetch.py gives for
// them. The step rewrites the file on every run.
const fixture = JSON.parse(
    readFileSync(new URL('../_data/unaids-fixture.json', import.meta.url), 'utf8'),
).data as {
    years: number[];
    countries: string[];
    rows: UnaidsRows;
    expected: Record<string, UnaidsFigures>;
};

test('unaidsByCountry gives what fetch.py gives for the fixture rows', () => {
    assert.deepEqual(
        unaidsByCountry(fixture.countries, fixture.rows, fixture.years),
        fixture.expected,
    );
});

test('unaidsByCountry matches places exactly and leaves a country without rows all null', () => {
    const rows: UnaidsRows = {
        plhiv: [
            { observationAbout: 'country/KENYA', time_period: 2024, value: 9 },
            { observationAbout: 'country/KEN', time_period: 2024, value: 1_000.5 },
        ],
        art: [{ observationAbout: 'country/KEN', time_period: 2024, value: 87.25 }],
        deaths: [{ observationAbout: 'country/KEN', time_period: 2015, value: 2.5 }],
    };

    assert.deepEqual(unaidsByCountry(['KEN', 'UGA'], rows, [2015, 2024]), {
        KEN: { plhiv: 1_000, art: 87.2, deaths: [2, null] },
        UGA: { plhiv: null, art: null, deaths: [null, null] },
    });
});

test('unaidsByCountry reads a row with a null value as no figure, as fetch.py does', () => {
    // The same case as test_unaids_by_country_reads_a_row_with_no_value_as_no_figure in
    // _data/tests/test_fetch.py.
    const rows = [
        { observationAbout: 'country/KEN', time_period: 2015, value: 2.5 },
        { observationAbout: 'country/KEN', time_period: 2024, value: null },
        { observationAbout: 'country/UGA', time_period: 2015, value: Number.NaN },
    ];

    assert.deepEqual(
        unaidsByCountry(['KEN', 'UGA'], { plhiv: rows, art: rows, deaths: rows }, [2015, 2024]),
        {
            KEN: { plhiv: null, art: null, deaths: [2, null] },
            UGA: { plhiv: null, art: null, deaths: [null, null] },
        },
    );
});

test('unaidsByCountry refuses two rows for one year and a row it cannot read', () => {
    const row = { observationAbout: 'country/KEN', time_period: 2024, value: 1 };

    assert.throws(
        () => unaidsByCountry(['KEN'], { plhiv: [row, row], art: [], deaths: [] }, [2024]),
        { code: 'unaids_repeated_year' },
    );

    for (const unreadable of [{ value: '1' }, { time_period: '2024' }, { time_period: null }]) {
        assert.throws(
            () =>
                unaidsByCountry(
                    ['KEN'],
                    { plhiv: [{ ...row, ...unreadable }], art: [], deaths: [] },
                    [2024],
                ),
            { code: 'unaids_unreadable_row' },
        );
    }
});

test('the same countries in another order share one UNAIDS reading', () => {
    const years = [2015, 2024];

    assert.equal(readingOf(['UGA', 'KEN'], years).key, readingOf(['KEN', 'UGA'], years).key);
    assert.notEqual(readingOf(['KEN'], years).key, readingOf(['KEN', 'UGA'], years).key);
    assert.deepEqual(readingOf(['UGA', 'KEN'], years).iso3s, ['KEN', 'UGA']);
});
