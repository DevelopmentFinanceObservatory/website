import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DatasetRef } from '@developmentfinance/client';

import type { HivData } from '../_data/types.ts';

import {
    AID_KEYS,
    aidFromRows,
    aidRecipes,
    AidRowsError,
    islandTier,
    readAid,
    type AidCheck,
    type AidKey,
    type AidNames,
    type AidRow,
    RECIPE_KEYS,
} from './aid.ts';

import { recordOf } from '#lib/record.ts';

const load = <T,>(name: string): T =>
    (JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')) as { data: T })
        .data;

// The trees and rows of the pinned reads, as fetch.py wrote them, and the figures it derived.
const fixture = load<{
    recipes: Record<string, unknown>;
    rows: Record<
        AidKey,
        {
            unit: Record<string, unknown>;
            rows: [member: string | null, period: string | number, value: number][];
        }
    >;
}>('aid-fixture.json');
const hiv = load<HivData>('hiv.json');
const names = load<AidNames>('names.json');
const liveRefs = load<Record<string, unknown>>('live-refs.json');
const MEMBER: Record<AidKey, string | null> = {
    allocatedByProvider: 'financingProvider',
    unallocatedByProvider: 'financingProvider',
    allocatedByRecipient: 'financingRecipient',
    usByRecipient: 'financingRecipient',
    globalFundByRecipient: 'financingRecipient',
    loans: 'financingProvider',
    gf12250Total: null,
    gf12110Total: null,
    'gf-12250': 'financingRecipient',
    'gf-12110': 'financingRecipient',
};

/** Each recipe's and read's rows, as `Dataset.toRows()` gives them. */
const pinnedRows = (): Record<AidKey, AidRow[]> =>
    recordOf(AID_KEYS, (key) => {
        const { unit, rows } = fixture.rows[key];
        const column = MEMBER[key];

        return rows.map(([member, period, value]) => ({
            ...(column === null ? {} : { [column]: member }),
            time_period: period,
            value,
            ...unit,
        }));
    });

const scope = { years: hiv.years, priceBase: hiv.priceBase, names };

test('the recipes send the trees fetch.py sent', () => {
    const recipes = aidRecipes(
        {
            aid: DatasetRef.fromJSON(liveRefs.aid),
            'gf-12250': DatasetRef.fromJSON(liveRefs['gf-12250']),
            'gf-12110': DatasetRef.fromJSON(liveRefs['gf-12110']),
        },
        [hiv.years[0]!, hiv.years.at(-1)!],
    );

    assert.deepStrictEqual(
        recordOf(RECIPE_KEYS, (key) => recipes[key].tree()),
        fixture.recipes,
    );
});

test('the pinned rows give hiv.json exactly', () => {
    assert.deepStrictEqual(aidFromRows(pinnedRows(), scope), hiv);
});

test('a provider counts by its code, whatever its label', () => {
    const rows = pinnedRows();
    const renamed = {
        ...names,
        providers: { ...names.providers, 'country/USA': 'United States Agency' },
    };

    assert.deepStrictEqual(
        aidFromRows(rows, { ...scope, names: renamed }).allocated,
        hiv.allocated,
    );
});

const refusal = (change: (rows: Record<AidKey, AidRow[]>) => void, code: string) => {
    const rows = pinnedRows();

    change(rows);
    assert.throws(
        () => aidFromRows(rows, scope),
        (error) => error instanceof AidRowsError && error.code === code,
    );
};

test('rows the derivation cannot trust are refused', () => {
    refusal((rows) => {
        rows['gf-12110'].push(rows['gf-12110'][0]!);
    }, 'aid_repeated_row');
    refusal((rows) => {
        rows.allocatedByRecipient[0] = { ...rows.allocatedByRecipient[0]!, value: null };
    }, 'aid_unreadable_row');
    refusal((rows) => {
        rows.loans[0] = {
            ...rows.loans[0]!,
            unit: JSON.stringify({ currency: 'USD', prices: 'current' }),
        };
    }, 'aid_wrong_unit');
    refusal((rows) => {
        rows.allocatedByRecipient.push({
            ...rows.allocatedByRecipient[0]!,
            financingRecipient: 'DACAfricaUnallocated',
        });
    }, 'aid_not_a_country');
    refusal((rows) => {
        rows.loans.push({ ...rows.loans[0]!, financingProvider: 'NewLender' });
    }, 'aid_unnamed');
});

test('a provider without a name is fine where the page prints none', () => {
    const rows = pinnedRows();

    rows.allocatedByProvider.push({
        ...rows.allocatedByProvider[0]!,
        financingProvider: 'SmallDonor',
        value: 10,
    });
    assert.deepStrictEqual(aidFromRows(rows, scope).otherProviders, hiv.otherProviders);
});

const LAST = String(hiv.years.at(-1));
const US = 'country/USA';
const GLOBAL_FUND = 'GlobalFund';

const inYear = (row: AidRow, year: string) => String(row.time_period) === year;

/** The checks `aidFromRows` names for rows that `change` mutates, after the control passes. */
const broken = (
    change: (rows: Record<AidKey, AidRow[]>) => void,
    names: AidNames = scope.names,
): readonly AidCheck[] => {
    const rows = pinnedRows();

    change(rows);

    try {
        aidFromRows(rows, { ...scope, names });
    } catch (error) {
        if (error instanceof AidRowsError && error.code === 'aid_checks_failed') {
            return error.checks;
        }

        throw error;
    }

    return [];
};

test("figures that break the step's checks are refused, each check by its code", () => {
    assert.deepEqual(
        broken(() => {}),
        [],
    );
    // A provider key's allocated total that its countries do not sum to.
    assert.deepEqual(
        broken((rows) => {
            rows.allocatedByProvider = rows.allocatedByProvider.map((row) =>
                row.financingProvider === US && inYear(row, LAST)
                    ? { ...row, value: Number(row.value) + 1e9 }
                    : row,
            );
        }),
        ['aid_countries_off_allocated'],
    );
    // No Global Fund money to countries in an earlier year.
    assert.deepEqual(
        broken((rows) => {
            rows.allocatedByProvider = rows.allocatedByProvider.map((row) =>
                row.financingProvider === GLOBAL_FUND && inYear(row, '2016')
                    ? { ...row, value: 0 }
                    : row,
            );
        }),
        ['aid_year_without_money'],
    );
    // The United States and the Global Fund keep 1% of their last-year money, and another
    // provider gives the rest, so the countries sum to the totals.
    assert.deepEqual(
        broken((rows) => {
            let moved = 0;
            const shrink = (row: AidRow) => {
                moved += Number(row.value) * 0.99;

                return { ...row, value: Number(row.value) * 0.01 };
            };

            for (const key of ['usByRecipient', 'globalFundByRecipient'] as const) {
                rows[key] = rows[key].map((row) => (inYear(row, LAST) ? shrink(row) : row));
            }

            moved = 0;
            rows.allocatedByProvider = rows.allocatedByProvider.map((row) =>
                [US, GLOBAL_FUND].includes(String(row.financingProvider)) && inYear(row, LAST)
                    ? shrink(row)
                    : row,
            );
            const other = rows.allocatedByProvider.findIndex(
                (row) =>
                    ![US, GLOBAL_FUND].includes(String(row.financingProvider)) && inYear(row, LAST),
            );

            rows.allocatedByProvider[other] = {
                ...rows.allocatedByProvider[other]!,
                value: Number(rows.allocatedByProvider[other]!.value) + moved,
            };
        }),
        ['aid_share_below_lede'],
    );
    // 12110 leading before 2020, which How to interpret says it did not.
    assert.deepEqual(
        broken((rows) => {
            rows.gf12110Total = rows.gf12110Total.map((row) =>
                inYear(row, '2016') ? { ...row, value: 1e10 } : row,
            );
        }),
        ['aid_gf_switch_moved'],
    );
    // No other provider giving $1m in the first or last year. Their money to countries also
    // drops below what the countries sum to.
    assert.deepEqual(
        broken((rows) => {
            rows.allocatedByProvider = rows.allocatedByProvider.map((row) =>
                ![US, GLOBAL_FUND].includes(String(row.financingProvider))
                    ? { ...row, value: 1 }
                    : row,
            );
        }),
        ['aid_countries_off_allocated', 'aid_no_other_providers'],
    );
    // A recipient whose last-year total rounds to zero, kept for its rounded US dollar.
    assert.deepEqual(
        broken(
            (rows) => {
                rows.allocatedByRecipient.push({
                    ...rows.allocatedByRecipient[0]!,
                    financingRecipient: 'country/ZZZ',
                    time_period: LAST,
                    value: 0.4,
                });
                rows.usByRecipient.push({
                    ...rows.usByRecipient[0]!,
                    financingRecipient: 'country/ZZZ',
                    time_period: LAST,
                    value: 0.6,
                });
            },
            { ...names, recipients: { ...names.recipients, 'country/ZZZ': 'Zedland' } },
        ),
        ['aid_countries_not_recipients'],
    );
    // A country recipient of the aid read that DFO marks residual, so it is no party.
    assert.deepEqual(
        broken(() => {}, {
            ...names,
            recipients: { ...names.recipients, 'country/ZZZ': 'Zedland' },
        }),
        ['aid_parties_not_countries'],
    );
});

test('a ref the client cannot read rejects the read, and does not throw', async () => {
    let read: Promise<unknown> | undefined;

    assert.doesNotThrow(() => {
        read = readAid(hiv, {
            refs: { aid: {}, 'gf-12250': {}, 'gf-12110': {} },
            names,
        });
    });
    await assert.rejects(read!);
});

test("the island's tier is the older of the aid's and the UNAIDS read's", () => {
    // Aid read from hiv.json, as while the page does not read it live.
    assert.equal(islandTier('committed', 'stored'), 'committed');
    assert.equal(islandTier('stored', 'pinned'), 'pinned');
    assert.equal(islandTier('stored', 'stored'), 'stored');
    assert.equal(islandTier('loading', 'stored'), 'loading');
    assert.equal(islandTier('committed', 'failed'), 'failed');
});
