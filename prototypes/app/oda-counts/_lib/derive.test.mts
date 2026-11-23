import assert from 'node:assert/strict';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import type { SeriesKey } from '../_data/types.ts';

import {
    countsFromRows,
    MONETARY,
    partialYears,
    READ_KEYS,
    roundHalfEven,
    type ReadKey,
} from './derive.ts';

import { recordOf } from '#lib/record.ts';

const YEARS = [2017, 2018, 2024, 2025];
const BASE_YEAR = 2024;

/** Each provider's gross disbursements in millions of current US dollars, by year. A provider
 *  has no rows in a year it leaves out. */
// prettier-ignore
const PROVIDERS: { id: string; label: string; kind: string; gross: Record<number, number> }[] = [
    // Grant equivalents in 2024, 0.9 of gross, are France's known $15.444bn.
    { id: 'country/FRA', label: 'France', kind: 'official', gross: { 2017: 13_000, 2018: 15_000, 2024: 17_160, 2025: 17_500 } },
    { id: 'country/DEU', label: 'Germany', kind: 'official', gross: { 2017: 25_000, 2018: 26_000, 2024: 30_000 } },
    { id: 'country/ITA', label: 'Italy', kind: 'official', gross: { 2017: 6_000, 2018: 5_000, 2024: 6_500 } },
    { id: 'country/GBR', label: 'United Kingdom', kind: 'official', gross: { 2017: 18_000, 2018: 19_000, 2024: 18_000 } },
    { id: 'EuropeanUnionInstitutions', label: 'EU institutions', kind: 'official', gross: { 2017: 16_000, 2018: 16_500, 2024: 20_000, 2025: 21_000 } },
    { id: 'DACMultilaterals', label: 'DAC multilaterals', kind: 'total', gross: { 2017: 16_000, 2018: 16_500, 2024: 20_000, 2025: 21_000 } },
    { id: 'DACCountriesTotal', label: 'DAC countries', kind: 'total', gross: { 2017: 160_000, 2018: 165_000, 2024: 230_000, 2025: 200_000 } },
    { id: 'DACNonDACCountries', label: 'DAC non-DAC countries', kind: 'total', gross: { 2017: 9_000, 2018: 9_500, 2024: 11_000 } },
];

/** Each series as a share of gross disbursements. */
const SHARE: Record<Exclude<SeriesKey, 'headline'>, number> = {
    gross: 1,
    net: 0.8,
    grantEquivalent: 0.9,
    commitments: 1.1,
    bilateral: 0.7,
    multilateral: 0.3,
    refugeeCosts: 0.05,
    grossNonGrants: 0.1,
};

/** A series' value in US dollars: the headline is net to 2017 and grant equivalents after, and
 *  constant prices are 1.1 times current prices outside the base year. */
const valueOf = (key: SeriesKey, prices: string, year: number, gross: number): number => {
    const share = SHARE[key === 'headline' ? (year < 2018 ? 'net' : 'grantEquivalent') : key];
    const deflator = prices === 'constant' && year !== BASE_YEAR ? 1.1 : 1;

    return gross * 1e6 * share * deflator;
};

/** Every read's rows, with the columns the derivation reads. */
const fixtureRows = (): Record<ReadKey, Row[]> =>
    recordOf(READ_KEYS, (read) => {
        const [key, prices] = read.split('/') as [SeriesKey | 'odaGni', string];

        return PROVIDERS.flatMap(({ id, label, kind, gross }) =>
            Object.entries(gross).map(([year, value]): Row => ({
                financingProvider: id,
                financingProvider_label: label,
                financingProvider_kind: kind,
                time_period: Number(year),
                value: key === 'odaGni' ? 0.5 : valueOf(key, prices, Number(year), value),
                price_basis: key === 'odaGni' ? null : prices,
            })),
        );
    });

/** One member per read, as each read serves. */
const ONE_MEMBER = recordOf(READ_KEYS, () => 1);

const scope = { years: YEARS, baseYear: BASE_YEAR, members: ONE_MEMBER };

/** The first row of `key` for `provider` in `year`. */
const rowOf = (rows: Record<ReadKey, Row[]>, key: ReadKey, provider: string, year: number) => {
    const row = rows[key].find(
        (each) => each.financingProvider === provider && each.time_period === year,
    );

    assert.ok(row, `${key} holds ${provider} in ${year}`);

    return row;
};

test('the reads give countries by name, then group totals by name, less the duplicate group', () => {
    const { years, baseYear, donors } = countsFromRows(fixtureRows(), scope);

    assert.deepEqual(years, YEARS);
    assert.equal(baseYear, BASE_YEAR);
    assert.deepEqual(
        donors.map(({ name, isGroup }) => [name, isGroup]),
        [
            ['EU institutions', false],
            ['France', false],
            ['Germany', false],
            ['Italy', false],
            ['United Kingdom', false],
            ['DAC countries', true],
            ['Non-DAC countries reporting to the DAC', true],
        ],
    );
});

test('each series is in millions at both price bases, and ODA/GNI a percentage', () => {
    const { donors } = countsFromRows(fixtureRows(), scope);
    const france = donors.find(({ id }) => id === 'country/FRA');

    assert.ok(france);
    assert.deepEqual(Object.keys(france.series), MONETARY);
    assert.deepEqual(france.series.gross.current, [13_000, 15_000, 17_160, 17_500]);
    assert.deepEqual(france.series.gross.constant, [14_300, 16_500, 17_160, 19_250]);
    // Net to 2017, grant equivalents from 2018.
    assert.deepEqual(france.series.headline.current, [10_400, 13_500, 15_444, 15_750]);
    assert.deepEqual(france.odaGni, [0.5, 0.5, 0.5, 0.5]);
});

test('a group total is blank where it sums only some members, a country is not', () => {
    const { donors } = countsFromRows(fixtureRows(), scope);
    const seriesOf = (id: string) => donors.find((donor) => donor.id === id)?.series;

    // In 2025 two of the five countries report, fewer than half.
    assert.deepEqual(seriesOf('DACCountriesTotal')?.gross.current, [
        160_000,
        165_000,
        230_000,
        null,
    ]);
    assert.equal(seriesOf('country/FRA')?.gross.current[3], 17_500);
    // Grant equivalents before 2018 sum only the members that reported them early.
    assert.equal(seriesOf('DACCountriesTotal')?.grantEquivalent.current[0], null);
    assert.equal(seriesOf('country/FRA')?.grantEquivalent.current[0], 11_700);
});

test('a row without a value is skipped', () => {
    const rows = fixtureRows();

    rows['gross/current'].push({
        ...rowOf(rows, 'gross/current', 'country/FRA', 2018),
        value: null,
    });
    assert.deepStrictEqual(countsFromRows(rows, scope), countsFromRows(fixtureRows(), scope));
});

test('a group total is partial in a year fewer than half the countries report', () => {
    const values = new Map([
        [
            'A',
            new Map([
                [2020, 1],
                [2021, 1],
                [2022, 1],
            ]),
        ],
        [
            'B',
            new Map([
                [2020, 1],
                [2021, 1],
            ]),
        ],
        ['C', new Map([[2020, 1]])],
        ['D', new Map([[2020, 1]])],
        // A group reports in 2022, which must not count as a second country.
        ['Group', new Map([[2022, 1]])],
    ]);
    const countries = new Set(['A', 'B', 'C', 'D']);

    // 2021 has exactly half of 2020's four countries, which is not fewer than half.
    assert.deepStrictEqual(
        partialYears(values, countries, [2020, 2021, 2022], 'gross'),
        new Set([2022]),
    );
});

test('rows that break a rule the figures rest on are refused', async (t) => {
    const cases: [string, (rows: Record<ReadKey, Row[]>) => void][] = [
        [
            'a duplicate group that differs from its provider',
            (rows) => {
                const row = rowOf(rows, 'gross/current', 'DACMultilaterals', 2018);

                row.value = Number(row.value) + 1;
            },
        ],
        [
            'a second row for a provider and year',
            (rows) => rows['net/constant'].push({ ...rows['net/constant'][0]! }),
        ],
        [
            'a price basis other than the read’s',
            (rows) => {
                rows['gross/constant'][0]!.price_basis = 'current';
            },
        ],
        [
            'a group total that reads as a country',
            (rows) => {
                for (const row of rows['gross/current']) {
                    if (row.financingProvider === 'DACCountriesTotal') {
                        row.financingProvider_kind = 'official';
                    }
                }
            },
        ],
        [
            'a renamed group with no figures',
            (rows) => {
                rows['gross/current'] = rows['gross/current'].filter(
                    (row) => row.financingProvider !== 'DACNonDACCountries',
                );
            },
        ],
        [
            'a known value more than 0.5% away',
            (rows) => {
                const row = rowOf(rows, 'grantEquivalent/current', 'country/FRA', 2024);

                row.value = Number(row.value) * 1.006;
            },
        ],
        [
            'a headline that differs from net disbursements before 2018',
            (rows) => {
                const row = rowOf(rows, 'headline/current', 'country/FRA', 2017);

                row.value = Number(row.value) * 1.01;
            },
        ],
        [
            'a headline that differs from grant equivalents from 2018',
            (rows) => {
                const row = rowOf(rows, 'headline/current', 'country/FRA', 2018);

                row.value = Number(row.value) * 1.01;
            },
        ],
        [
            'constant prices that differ from current prices in the base year',
            (rows) => {
                const row = rowOf(rows, 'bilateral/constant', 'country/FRA', BASE_YEAR);

                row.value = Number(row.value) * 1.01;
            },
        ],
    ];

    for (const [label, breakRows] of cases) {
        await t.test(label, () => {
            const rows = fixtureRows();

            breakRows(rows);
            assert.throws(() => countsFromRows(rows, scope));
        });
    }

    await t.test('a read that serves two members', () => {
        assert.throws(() =>
            countsFromRows(fixtureRows(), {
                ...scope,
                members: { ...ONE_MEMBER, 'grantEquivalent/constant': 2 },
            }),
        );
    });
});

test('a revised preliminary year passes, since only closed years are known', () => {
    const rows = fixtureRows();

    for (const key of ['gross/current', 'net/current'] as const) {
        const row = rowOf(rows, key, 'country/FRA', 2025);

        row.value = Number(row.value) * 1.2;
    }

    assert.doesNotThrow(() => countsFromRows(rows, scope));
});

test('rounds as Python does, an exact tie going to the even digit', () => {
    for (const [x, digits, expected] of [
        [0.125, 2, 0.12],
        [0.375, 2, 0.38],
        [-0.125, 2, -0.12],
        [2.675, 2, 2.67], // the double lies below 2.675
        [1234.5678, 2, 1234.57],
        [0.0005, 3, 0.001], // the double lies above 0.0005
        [-0.001, 2, -0],
        [99.999, 2, 100],
    ] as const) {
        assert.ok(Object.is(roundHalfEven(x, digits), expected), `${x} to ${digits}`);
    }
});
