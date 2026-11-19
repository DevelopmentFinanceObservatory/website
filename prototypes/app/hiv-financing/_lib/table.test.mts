import assert from 'node:assert/strict';
import test from 'node:test';

import { COUNTRIES, country, IVORY_COAST, KENYA, UKRAINE } from './fixture.mts';
import { sortRows, tableRows, toCsv } from './table.ts';

const ROWS = tableRows(COUNTRIES);

test('a row holds last-year dollars, shares and UNAIDS figures', () => {
    assert.deepEqual(tableRows([KENYA])[0], {
        iso3: 'KEN',
        name: 'Kenya',
        aid: 304e6,
        byProvider: { us: 200e6, globalFund: 100e6, other: 4e6 },
        shares: { us: 200 / 304, globalFund: 100 / 304, other: 4 / 304 },
        mixPercents: { us: '66%', globalFund: '33%', other: '1%' },
        globalFundMulti: 5e6,
        flagged: true,
        plhiv: 1_400_000,
        perPerson: 304e6 / 1.4e6,
        art: 87.3,
        deaths: 20_810,
    });
});

test('rows flag Global Fund multi-disease grants and blank aid per person under 5,000 people', () => {
    const small = country({
        aid: { us: [0, 1e6], globalFund: [0, 0], other: [0, 0] },
        plhiv: 4_000,
    });

    assert.deepEqual(
        tableRows([KENYA, IVORY_COAST, UKRAINE, small]).map(({ flagged, perPerson }) => [
            flagged,
            perPerson === null,
        ]),
        [
            [true, false],
            [false, false],
            [false, true],
            [false, true],
        ],
    );
});

test('sortRows puts missing values last in both directions', () => {
    const order = (key: Parameters<typeof sortRows>[1], direction: 'ascending' | 'descending') =>
        sortRows(ROWS, key, direction).map((row) => row.iso3);

    assert.deepEqual(order('aid', 'descending'), ['KEN', 'CIV', 'UKR', 'COD', 'COG', 'MEX']);
    assert.deepEqual(order('art', 'descending'), ['KEN', 'MEX', 'COD', 'COG', 'CIV', 'UKR']);
    assert.deepEqual(order('art', 'ascending'), ['COG', 'COD', 'MEX', 'KEN', 'CIV', 'UKR']);
    // The mix column sorts on the US share, and Mexico's 0 sorts as a value.
    assert.deepEqual(order('mix', 'descending'), ['COG', 'KEN', 'UKR', 'CIV', 'COD', 'MEX']);
    assert.deepEqual(order('name', 'ascending'), ['CIV', 'COD', 'KEN', 'MEX', 'COG', 'UKR']);
});

test('toCsv writes a BOM, raw money, deaths as printed, empty cells and RFC 4180 quoting', () => {
    const quoted = country({ iso3: 'QQQ', name: 'Name, with "quotes"' });

    assert.equal(
        toCsv(tableRows([KENYA, quoted]), 2024),
        '\uFEFF' +
            [
                'iso3,country,hiv_aid_2024_usd,us_2024_usd,global_fund_2024_usd,other_2024_usd,global_fund_multi_2024_usd,people_living_with_hiv_2024,aid_per_person_2024_usd,art_coverage_2024_pct,aids_deaths_2024',
                'KEN,Kenya,304000000,200000000,100000000,4000000,5000000,1400000,217.14,87.3,20800',
                'QQQ,"Name, with ""quotes""",0,0,0,0,0,,,,',
                '',
            ].join('\r\n'),
    );
});
