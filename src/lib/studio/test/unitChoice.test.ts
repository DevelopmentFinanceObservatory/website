import assert from 'node:assert/strict';
import test from 'node:test';

import {
    baseYears,
    currencyRows,
    matchesQuery,
    priceRows,
    servesUnit,
    unitAnswer,
    unitChanged,
    unitChips,
    unitText,
    withBaseYear,
    withCurrency,
    withPrices,
} from '../unitChoice.ts';
import type { UnitChoice, UnitOffer } from '../wire.ts';

/** US dollars and euros at both bases over different base-year runs, Kenyan
 *  shillings at current prices only, and two currencies behind "Change to
 *  any currency". */
const offer: UnitOffer = {
    currencies: [
        {
            code: 'USD',
            name: 'US dollars',
            prices: ['current', 'constant'],
            base_year_min: 1970,
            base_year_max: 2024,
        },
        {
            code: 'EUR',
            name: 'euros',
            prices: ['current', 'constant'],
            base_year_min: 1999,
            base_year_max: 2020,
        },
        { code: 'KES', name: 'Kenyan shillings', prices: ['current'] },
        { code: 'ZAR', name: 'South African rand', prices: ['current'] },
        {
            code: 'GBP',
            name: 'British pounds',
            prices: ['constant'],
            base_year_min: 2000,
            base_year_max: 2010,
        },
    ],
    presets: ['USD', 'KES', 'USD', 'XXX'],
    start: { currency: 'USD', prices: 'constant', base_year: 2023 },
};

const constantUsd: UnitChoice = { currency: 'USD', prices: 'constant', base_year: 2023 };
const currentUsd: UnitChoice = { currency: 'USD', prices: 'current' };

test('the chips name the currency and prices, and the base year only on constant prices', () => {
    assert.deepEqual(
        unitChips(offer, constantUsd).map((chip) => chip.label),
        ['US dollars', 'Constant', '2023 prices'],
    );
    assert.deepEqual(
        unitChips(offer, { currency: 'EUR', prices: 'current' }).map((chip) => chip.label),
        ['Euros', 'Current'],
    );
});

test('the currency list holds the offered presets, then the rest by name once opened', () => {
    const codes = (unit: UnitChoice, all: boolean) =>
        currencyRows(offer, unit, all).map((row) => row.value);

    assert.deepEqual(codes(constantUsd, false), ['USD', 'KES']);
    assert.deepEqual(codes({ currency: 'ZAR', prices: 'current' }, false), ['USD', 'KES', 'ZAR']);
    assert.deepEqual(codes(constantUsd, true), ['USD', 'KES', 'GBP', 'EUR', 'ZAR']);
});

test('the prices list leaves out a basis the currency cannot serve', () => {
    assert.deepEqual(
        priceRows(offer, currentUsd).map((row) => row.value),
        ['current', 'constant'],
    );
    assert.deepEqual(
        priceRows(offer, { currency: 'KES', prices: 'current' }).map((row) => row.value),
        ['current'],
    );
});

test('base years run newest first over the currency range, none without one', () => {
    const years = baseYears(offer, { currency: 'EUR', prices: 'constant', base_year: 2010 });

    assert.equal(years.length, 22);
    assert.deepEqual([years[0], years.at(-1)], [2020, 1999]);
    assert.deepEqual(baseYears(offer, { currency: 'KES', prices: 'current' }), []);
});

test('a currency pick keeps the basis it can and moves the base year into range', async (t) => {
    const cases: [string, UnitChoice, string, UnitChoice][] = [
        ['current-only currency', constantUsd, 'KES', { currency: 'KES', prices: 'current' }],
        [
            'year past the range',
            constantUsd,
            'EUR',
            { currency: 'EUR', prices: 'constant', base_year: 2020 },
        ],
        ['current kept', currentUsd, 'EUR', { currency: 'EUR', prices: 'current' }],
        [
            'constant-only currency',
            currentUsd,
            'GBP',
            { currency: 'GBP', prices: 'constant', base_year: 2010 },
        ],
        ['currency not offered', constantUsd, 'JPY', constantUsd],
    ];

    for (const [name, unit, code, expected] of cases) {
        await t.test(name, () => assert.deepEqual(withCurrency(offer, unit, code), expected));
    }
});

test('constant prices take the starting base year inside the currency range', () => {
    assert.deepEqual(withPrices(offer, currentUsd, 'constant'), constantUsd);
    assert.deepEqual(withPrices(offer, { currency: 'EUR', prices: 'current' }, 'constant'), {
        currency: 'EUR',
        prices: 'constant',
        base_year: 2020,
    });
    assert.deepEqual(withPrices(offer, constantUsd, 'current'), currentUsd);
    assert.deepEqual(withBaseYear(constantUsd, 1990), { ...constantUsd, base_year: 1990 });
});

test('the offer serves only offered currencies at their bases and years', async (t) => {
    const cases: [string, UnitChoice, boolean][] = [
        ['constant in range', constantUsd, true],
        ['current', currentUsd, true],
        ['currency not offered', { currency: 'JPY', prices: 'current' }, false],
        ['basis not served', { currency: 'KES', prices: 'constant', base_year: 2020 }, false],
        ['year out of range', { currency: 'EUR', prices: 'constant', base_year: 2023 }, false],
        ['constant without a year', { currency: 'USD', prices: 'constant' }, false],
        ['current with a year', { currency: 'USD', prices: 'current', base_year: 2023 }, false],
    ];

    for (const [name, unit, expected] of cases) {
        await t.test(name, () => assert.equal(servesUnit(offer, unit), expected));
    }
});

test('a change counts the base year only on constant prices', () => {
    assert.equal(unitChanged(constantUsd, constantUsd), false);
    assert.equal(unitChanged(constantUsd, { ...constantUsd, base_year: 2020 }), true);
    assert.equal(unitChanged(currentUsd, { ...currentUsd, base_year: 2020 }), false);
    assert.equal(unitChanged(constantUsd, currentUsd), true);
});

test('the unit reads as words and answers without a base year on current prices', () => {
    assert.equal(unitText(offer, constantUsd), 'Constant 2023 US dollars');
    assert.equal(unitText(offer, currentUsd), 'Current US dollars');
    assert.deepEqual(unitAnswer({ ...currentUsd, base_year: null }), {
        kind: 'unit',
        currency: 'USD',
        prices: 'current',
    });
});

test('a typed filter matches any text, ignoring case and spaces', () => {
    assert.equal(matchesQuery(' us ', 'US dollars', 'USD'), true);
    assert.equal(matchesQuery('eur', 'Kenyan shillings', 'KES'), false);
    assert.equal(matchesQuery('', 'anything'), true);
});

test('a pick never lands on a unit the currency does not serve', () => {
    // XOF serves constant prices with no base-year run and no current
    // basis, so there is no year to take and the unit stays where it was.
    const bare: UnitOffer = {
        currencies: [
            {
                code: 'USD',
                name: 'US dollars',
                prices: ['current', 'constant'],
                base_year_min: 2000,
                base_year_max: 2020,
            },
            { code: 'XOF', name: 'CFA francs', prices: ['constant'] },
        ],
        presets: ['USD'],
        start: { currency: 'USD', prices: 'current' },
    };
    const unit: UnitChoice = { currency: 'USD', prices: 'current' };

    assert.deepEqual(withCurrency(bare, unit, 'XOF'), unit);
    assert.equal(servesUnit(bare, withCurrency(bare, unit, 'XOF')), true);
});
