import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseYear, ViewData } from '../_data/types.ts';

import { thresholdsData } from './views.ts';

const base = (year: number, debtFace: number): BaseYear => ({
    year,
    debtFace,
    debtPV: debtFace,
    gdp: 100,
    capacity: 'weak',
    capacitySource: 'dsa',
    dsaDate: null,
    riskRating: null,
    years: [],
});

const view = (year: number, iso3s: string[]): ViewData => ({
    year,
    vintage: { ids: `IDS ${year}`, weo: 'October', capacityAsOf: `${year}-01-01`, archived: false },
    countries: iso3s.map((iso3, index) => ({
        iso3,
        name: iso3,
        fdl2024: index === 0 ? 'insolvent' : null,
        base: base(year, index + year),
    })),
});

test("thresholdsData keys each country's bases and the vintages by base year", () => {
    const data = thresholdsData([view(2024, ['AAA', 'BBB']), view(2025, ['AAA', 'BBB'])], 2025);

    assert.deepEqual(data.baseYears, [2024, 2025]);
    assert.equal(data.defaultYear, 2025);
    assert.equal(data.measure, 'pv');
    assert.deepEqual(Object.keys(data.vintages), ['2024', '2025']);
    assert.equal(data.vintages['2025']?.ids, 'IDS 2025');
    assert.deepEqual(
        data.countries.map(({ iso3, fdl2024, bases }) => [
            iso3,
            fdl2024,
            bases['2024']?.debtFace,
            bases['2025']?.debtFace,
        ]),
        [
            ['AAA', 'insolvent', 2024, 2025],
            ['BBB', null, 2025, 2026],
        ],
    );
});

test('thresholdsData refuses views of other countries and a default year it lacks', () => {
    assert.throws(
        () => thresholdsData([view(2024, ['AAA', 'BBB']), view(2025, ['BBB', 'AAA'])], 2025),
        /other countries/,
    );
    assert.throws(
        () => thresholdsData([view(2024, ['AAA']), view(2025, ['AAA', 'BBB'])], 2025),
        /other countries/,
    );
    assert.throws(() => thresholdsData([view(2024, ['AAA'])], 2025), /default year 2025/);
    assert.throws(() => thresholdsData([], 2025), /No base year/);
});
