import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import type { CountsData } from '../_data/types.ts';

import { countsFromRows, READ_KEYS, roundHalfEven, type ReadKey } from './derive.ts';

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
    Object.fromEntries(
        READ_KEYS.map((key): [ReadKey, Row[]] => {
            const { priceBasis, providers, rows } = fixture[key];

            return [
                key,
                rows.map(([index, year, value]) => {
                    const [id, label, kind] = providers[index]!;

                    return {
                        financingProvider: id,
                        financingProvider_label: label,
                        financingProvider_kind: kind,
                        time_period: year,
                        value,
                        price_basis: priceBasis,
                    };
                }),
            ];
        }),
    ) as Record<ReadKey, Row[]>;

test('the pinned reads give counts.json exactly', () => {
    assert.deepStrictEqual(countsFromRows(pinnedRows(), counts), counts);
});

test('rows that break a rule the figures rest on are refused', async (t) => {
    const cases: [string, (rows: Record<ReadKey, Row[]>) => void][] = [
        [
            'a duplicate group that no longer repeats its provider',
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
    ];

    for (const [label, breakRows] of cases) {
        await t.test(label, () => {
            const rows = pinnedRows();

            breakRows(rows);
            assert.throws(() => countsFromRows(rows, counts));
        });
    }
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
