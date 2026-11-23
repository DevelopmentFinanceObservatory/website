import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import type { CountsData } from '../_data/types.ts';

import { countsFromRows, partialYears, READ_KEYS, roundHalfEven, type ReadKey } from './derive.ts';

import { recordOf } from '#lib/record.ts';

const load = <T,>(name: string): T =>
    JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')) as T;

type Fixture = Record<
    ReadKey,
    {
        priceBasis: string;
        providers: [id: string, label: string, kind: string][];
        rows: [provider: number, year: number, value: number | null][];
    }
>;

const counts = load<{ data: CountsData }>('counts.json').data;
const fixture = load<{ data: Fixture }>('rows-fixture.json').data;

/** Each read's rows at its pinned version, with the columns the derivation reads. */
const pinnedRows = (): Record<ReadKey, Row[]> =>
    recordOf(READ_KEYS, (key) => {
        const { priceBasis, providers, rows } = fixture[key];

        return rows.map(([index, year, value]): Row => {
            const [id, label, kind] = providers[index]!;

            return {
                financingProvider: id,
                financingProvider_label: label,
                financingProvider_kind: kind,
                time_period: year,
                value,
                price_basis: priceBasis,
            };
        });
    });

/** One member per read, as each pinned read serves. */
const ONE_MEMBER = recordOf(READ_KEYS, () => 1);

const scope = { ...counts, members: ONE_MEMBER };

/** The first row of `key` for `provider` in `year`. */
const rowOf = (rows: Record<ReadKey, Row[]>, key: ReadKey, provider: string, year: number) => {
    const row = rows[key].find(
        (each) => each.financingProvider === provider && each.time_period === year,
    );

    assert.ok(row, `${key} holds ${provider} in ${year}`);

    return row;
};

test('the pinned reads give counts.json exactly', () => {
    assert.deepStrictEqual(countsFromRows(pinnedRows(), scope), counts);
});

test('a row without a value is skipped', () => {
    const rows = pinnedRows();

    rows['gross/current'].push({
        ...rowOf(rows, 'gross/current', 'country/FRA', 2020),
        value: null,
    });
    assert.deepStrictEqual(countsFromRows(rows, scope), counts);
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
                const row = rows['gross/current'].find(
                    (each) => each.financingProvider === 'DACMultilaterals',
                );
                row!.value = Number(row!.value) + 1;
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
            'a known value more than 0.5% away',
            (rows) => {
                const row = rowOf(rows, 'net/current', 'country/FRA', 2025);

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
                const row = rowOf(rows, 'bilateral/constant', 'country/FRA', counts.baseYear);

                row.value = Number(row.value) * 1.01;
            },
        ],
    ];

    for (const [label, breakRows] of cases) {
        await t.test(label, () => {
            const rows = pinnedRows();

            breakRows(rows);
            assert.throws(() => countsFromRows(rows, scope));
        });
    }

    await t.test('a read that serves two members', () => {
        assert.throws(() =>
            countsFromRows(pinnedRows(), {
                ...scope,
                members: { ...ONE_MEMBER, 'grantEquivalent/constant': 2 },
            }),
        );
    });
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
