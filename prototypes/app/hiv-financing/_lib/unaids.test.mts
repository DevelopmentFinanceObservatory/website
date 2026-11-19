import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { UnaidsFigures } from '../_data/types.ts';

import { pythonRound, unaidsByCountry, type UnaidsRows } from './unaids.ts';

// Real rows from the pinned reads, with the figures `unaids_by_country` in fetch.py gives for
// them; the step rewrites the file on every run.
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

test('unaidsByCountry refuses two rows for one year and a row it cannot read', () => {
    const row = { observationAbout: 'country/KEN', time_period: 2024, value: 1 };

    assert.throws(
        () => unaidsByCountry(['KEN'], { plhiv: [row, row], art: [], deaths: [] }, [2024]),
        /more than one row for 2024/,
    );
    assert.throws(
        () =>
            unaidsByCountry(
                ['KEN'],
                { plhiv: [{ ...row, value: null }], art: [], deaths: [] },
                [2024],
            ),
        /a row with time_period 2024 and value null/,
    );
});

test('pythonRound rounds an exact half to even, as Python round does', () => {
    // Python: round(0.5), round(1.5), round(2.5), round(87.25, 1), round(87.75, 1),
    // round(0.15, 1), round(2.675, 2), round(-2.5), round(1234.4999).
    const cases: [number, number, number][] = [
        [0.5, 0, 0],
        [1.5, 0, 2],
        [2.5, 0, 2],
        [87.25, 1, 87.2],
        [87.75, 1, 87.8],
        [0.15, 1, 0.1],
        [2.675, 2, 2.67],
        [-2.5, 0, -2],
        [1234.4999, 0, 1234],
    ];

    for (const [value, digits, expected] of cases) {
        assert.equal(pythonRound(value, digits), expected, `round(${value}, ${digits})`);
    }
});
