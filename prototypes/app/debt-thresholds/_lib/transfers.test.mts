import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Group } from './thresholds.ts';
import {
    groupTransfers,
    lastActualYear,
    SET_ASIDE_ISO3,
    swing,
    transfersByCountry,
    transfersHeading,
    valuesByCountry,
    type TransferLine,
    type TransfersData,
    type TransfersMembers,
} from './transfers.ts';

const YEARS = [2019, 2020, 2021, 2022, 2023];

const data: TransfersData = {
    release: 'test',
    years: YEARS,
    countries: [
        { iso3: 'AAA', name: 'A', group: 'insolvent', values: [1, 2, null, 4, 5] },
        { iso3: 'BBB', name: 'B', group: 'insolvent', values: [10, null, null, 40, 50] },
        { iso3: 'CCC', name: 'C', group: 'lower-risk', values: [100, 100, 100, 100, 100] },
        { iso3: SET_ASIDE_ISO3, name: 'India', group: 'lower-risk', values: [9, 9, 9, 9, 9] },
        { iso3: 'ZZZ', name: 'Z', group: 'not-in-dsa', values: [7, 7, 7, 7, 7] },
    ],
};

const line = (values: (number | null)[]): TransferLine => ({ key: 'service', members: [], values });

test("groupTransfers regroups countries by the caller's grouping", () => {
    const grouping: Record<string, Group> = { AAA: 'service', BBB: 'service', CCC: 'debt' };
    grouping[SET_ASIDE_ISO3] = 'debt';
    const { lines, aside } = groupTransfers(data, (iso3) => grouping[iso3] ?? null);

    assert.deepEqual(
        lines.map(({ key, members }) => [key, members]),
        [
            ['debt', ['CCC']],
            ['service', ['AAA', 'BBB']],
            ['outside', ['ZZZ']],
        ],
    );
    // A year sums the members that report; a year none reports is null.
    assert.deepEqual(lines[1]?.values, [11, 2, null, 44, 55]);
    assert.equal(aside?.line, 'debt');
    assert.deepEqual(lines[0]?.values, [100, 100, 100, 100, 100]);
});

test('swing finds the inflow before the first outflow and the lowest outflow after it', () => {
    assert.deepEqual(swing(line([30, 50, 10, -4, -8]), YEARS), {
        inflow: { year: 2020, value: 50 },
        outflow: { year: 2023, value: -8 },
    });
    assert.equal(swing(line([5, 5, 5, 5, 5]), YEARS), null);
    assert.equal(swing(line([-1, 5, 5, 5, 5]), YEARS), null);
});

test('transfersHeading states the swing, or asks a question when there is none', () => {
    assert.equal(
        transfersHeading([line([3e9, 52.06e9, 10e9, -11.64e9, 1e9])], YEARS),
        'Countries above the debt-service threshold went from a net inflow of $52.1 billion in 2020 to a net outflow of $11.6 billion in 2022.',
    );
    assert.match(transfersHeading([line([1, 2, 3, 4, 5])], YEARS), /\?$/);
    assert.match(transfersHeading([], YEARS), /\?$/);
});

// S4a's parity fixture: the Python step's output for seven countries, one without rows.
const fixture = JSON.parse(
    readFileSync(new URL('../_data/transfers-fixture.json', import.meta.url), 'utf8'),
).data as {
    rows: Parameters<typeof valuesByCountry>[0];
    members: TransfersMembers['countries'];
    expected: {
        valuesByCountry: Record<string, Record<string, number>>;
        lastActualYear: number;
        years: number[];
        countries: TransfersData['countries'];
    };
};
const members: TransfersMembers = { release: 'test', countries: fixture.members };

test('the port matches the Python step on the fixture rows', () => {
    const values = valuesByCountry(fixture.rows);
    const asObject = Object.fromEntries(
        [...values].map(([iso3, byYear]) => [
            iso3,
            Object.fromEntries([...byYear].map(([year, value]) => [String(year), value])),
        ]),
    );

    assert.deepEqual(asObject, fixture.expected.valuesByCountry);
    assert.equal(lastActualYear(values), fixture.expected.lastActualYear);

    const built = transfersByCountry(fixture.rows, members);

    assert.deepEqual(built.years, fixture.expected.years);
    assert.deepEqual(built.countries, fixture.expected.countries);
});

// The same rows as _data/tests/test_transfers.py: a pre-2010 row, a null value and a
// year reported by one country of three.
const row = (iso3: string, year: number | string, value: number | null) => ({
    financingRecipient: `country/${iso3}`,
    time_period: year,
    value,
});
const synthetic = [
    row('AAA', 2009, 99),
    row('AAA', 2010, 10.04),
    row('BBB', 2010, 5.04),
    row('AAA', 2011, 1),
    row('BBB', 2011, null),
    row('CCC', 2010, -3),
    row('CCC', '2011', -4),
    row('AAA', 2012, 7),
];

test('the port skips early years and nulls and stops where under half report', () => {
    const built = transfersByCountry(synthetic, {
        release: 'test',
        countries: ['AAA', 'BBB', 'CCC', 'DDD'].map((iso3) => ({ iso3, name: iso3, group: 'x' })),
    });

    assert.deepEqual(built.years, [2010, 2011]);
    assert.deepEqual(
        built.countries.map((country) => country.values),
        [
            [10.04, 1],
            [5.04, null],
            [-3, -4],
            [null, null],
        ],
    );
});

test('the port throws when no row survives', () => {
    assert.throws(() => valuesByCountry([row('AAA', 2005, 1), row('AAA', 2012, null)]), /no values/);
});
