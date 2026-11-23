import assert from 'node:assert/strict';
import test from 'node:test';

import { unaidsByCountry, type UnaidsRows } from './unaids.ts';

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

test('unaidsByCountry reads a row with a null value as no figure', () => {
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
