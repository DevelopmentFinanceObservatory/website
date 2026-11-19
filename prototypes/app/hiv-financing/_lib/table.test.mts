import assert from 'node:assert/strict';
import test from 'node:test';

import { COUNTRIES, country, KENYA } from './fixture.mts';
import { sortRows, tableRows, toCsv } from './table.ts';

const ROWS = tableRows(COUNTRIES);

test('a row holds last-year dollars, shares and UNAIDS figures', () => {
    assert.deepEqual(tableRows([KENYA])[0], {
        iso3: 'KEN',
        name: 'Kenya',
        aid: 304e6,
        byProvider: { us: 200e6, globalFund: 100e6, other: 4e6 },
        shares: { us: 200 / 304, globalFund: 100 / 304, other: 4 / 304 },
        plhiv: 1_400_000,
        perPerson: 304e6 / 1.4e6,
        art: 87.3,
        deaths: 20_810,
    });
});

test('sortRows puts missing values last in both directions', () => {
    const order = (key: Parameters<typeof sortRows>[1], direction: 'ascending' | 'descending') =>
        sortRows(ROWS, key, direction).map((row) => row.iso3);

    assert.deepEqual(order('aid', 'descending'), ['KEN', 'CIV', 'UKR', 'COD', 'COG', 'MEX']);
    assert.deepEqual(order('art', 'descending'), ['KEN', 'MEX', 'COD', 'COG', 'CIV', 'UKR']);
    assert.deepEqual(order('art', 'ascending'), ['COG', 'COD', 'MEX', 'KEN', 'CIV', 'UKR']);
    // The mix column sorts on the US share; Mexico's 0 sorts as a value.
    assert.deepEqual(order('mix', 'descending'), ['COG', 'KEN', 'UKR', 'CIV', 'COD', 'MEX']);
    assert.deepEqual(order('name', 'ascending'), ['CIV', 'COD', 'KEN', 'MEX', 'COG', 'UKR']);
});

test('toCsv writes raw numbers, empty cells for missing values and RFC 4180 quoting', () => {
    const quoted = country({ iso3: 'QQQ', name: 'Name, with "quotes"' });

    assert.equal(
        toCsv(tableRows([KENYA, quoted]), 2024),
        [
            'iso3,country,hiv_aid_2024_usd,us_2024_usd,global_fund_2024_usd,other_2024_usd,people_living_with_hiv_2024,aid_per_person_2024_usd,art_coverage_2024_pct,aids_deaths_2024',
            'KEN,Kenya,304000000,200000000,100000000,4000000,1400000,217.14,87.3,20810',
            'QQQ,"Name, with ""quotes""",0,0,0,0,,,,',
            '',
        ].join('\r\n'),
    );
});
