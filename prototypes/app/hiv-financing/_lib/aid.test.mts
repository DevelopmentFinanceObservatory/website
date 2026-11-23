import assert from 'node:assert/strict';
import test from 'node:test';

import {
    aidFromRows,
    aidNames,
    AidRowsError,
    PRICE_BASE,
    YEARS,
    type AidCheck,
    type AidKey,
    type AidNames,
    type AidRow,
} from './aid.ts';
import { AID_DATA, AID_READ_ROWS, aidRows } from './rowsFixture.mts';

const names = aidNames(AID_READ_ROWS);
const scope = { years: YEARS, priceBase: PRICE_BASE, names };

test('the rows give the figures, every check passing', () => {
    assert.deepStrictEqual(aidFromRows(aidRows(), scope), AID_DATA);
});

test("the names are the aid read's labels, with the overrides, for countries only", () => {
    assert.deepStrictEqual(names, {
        providers: {
            GlobalFund: 'Global Fund',
            InternationalDevelopmentAssociation: 'International Development Association',
            'country/GBR': 'United Kingdom',
            'country/USA': 'United States',
        },
        recipients: { 'country/CIV': "Côte d'Ivoire", 'country/KEN': 'Kenya' },
    });
});

const labelRefusal = (change: (row: AidRow) => AidRow | null, code: string) => {
    const rows = AID_READ_ROWS.flatMap((row, index) => {
        const changed = index === 0 ? change(row) : row;

        return changed === null ? [row] : [row, changed];
    });

    assert.throws(
        () => aidNames(rows),
        (error) => error instanceof AidRowsError && error.code === code,
    );
};

test('a missing or second label for a code the page may print fails the names', () => {
    labelRefusal(
        (row) => ({ ...row, financingProvider: 'NewDonor', financingProvider_label: null }),
        'aid_unlabelled',
    );
    labelRefusal(
        (row) => ({ ...row, financingRecipient: 'country/UGA', financingRecipient_label: '' }),
        'aid_unlabelled',
    );
    labelRefusal((row) => ({ ...row, financingProvider_label: 'USA' }), 'aid_two_labels');
    labelRefusal(
        (row) => ({ ...row, financingRecipient_label: 'Kenya, Republic of' }),
        'aid_two_labels',
    );
    // A region the page never prints may lack a label.
    assert.doesNotThrow(() =>
        aidNames([
            ...AID_READ_ROWS,
            {
                ...AID_READ_ROWS[0]!,
                financingRecipient: 'Bilateral',
                financingRecipient_label: null,
            },
        ]),
    );
});

test('a provider counts by its code, whatever its label', () => {
    const rows = aidRows();
    const renamed = {
        ...names,
        providers: { ...names.providers, 'country/USA': 'United States Agency' },
    };

    assert.deepStrictEqual(
        aidFromRows(rows, { ...scope, names: renamed }).allocated,
        AID_DATA.allocated,
    );
});

const refusal = (change: (rows: Record<AidKey, AidRow[]>) => void, code: string) => {
    const rows = aidRows();

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
    const rows = aidRows();

    rows.allocatedByProvider.push({
        ...rows.allocatedByProvider[0]!,
        financingProvider: 'SmallDonor',
        value: 10,
    });
    assert.deepStrictEqual(aidFromRows(rows, scope).otherProviders, AID_DATA.otherProviders);
});

const LAST = String(YEARS.at(-1));
const US = 'country/USA';
const GLOBAL_FUND = 'GlobalFund';

const inYear = (row: AidRow, year: string) => String(row.time_period) === year;

/** The checks `aidFromRows` names for rows that `change` mutates, after the control passes. */
const broken = (
    change: (rows: Record<AidKey, AidRow[]>) => void,
    names: AidNames = scope.names,
): readonly AidCheck[] => {
    const rows = aidRows();

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

test("figures that break the page's checks are refused, each check by its code", () => {
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
