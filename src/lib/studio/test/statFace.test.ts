/**
 * `statFace`: a stat card's number, suffix and caption per unit kind, the
 * value scaled by its magnitude before it is compacted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { KeyNumberWidget } from '../../chat/widgets.ts';
import type { PayloadChange, PayloadUnit, StructuredUnit } from '../payload.ts';
import {
    compact,
    keyNumberFace,
    statFace,
    unitDescription,
    unitWords,
    type StatFace,
} from '../statFace.ts';
import { composedUnit } from './fixtures/envelope-composed-unit.ts';

const population = { stat_var: 'dcid:Count_Person', label: 'Total population' };
const euros = { currency: 'EUR', magnitude: null, prices: 'constant', base_year: 2020 };
const NO_AMOUNT: StructuredUnit = {
    currency: null,
    magnitude: null,
    prices: null,
    base_year: null,
};
const eurosPerPerson: PayloadUnit = { numerator: euros, denominator: population };

const dollars = (fields: Partial<StructuredUnit> = {}): StructuredUnit => ({
    currency: 'USD',
    magnitude: null,
    prices: 'current',
    base_year: null,
    ...fields,
});

const rise: PayloadChange = { derivation: 'percent_change', basis: ['2023', '2024'], value: 1.89 };

const CASES: [string, PayloadUnit | undefined, number, PayloadChange | undefined, StatFace][] = [
    [
        'graph label',
        'US Dollar',
        23_400_000,
        undefined,
        { amount: '23.4M', suffix: '', caption: 'US Dollar · 2024' },
    ],
    [
        'raw camel ref, spaced',
        'USDollar',
        23_400_000,
        undefined,
        { amount: '23.4M', suffix: '', caption: 'US Dollar · 2024' },
    ],
    [
        'saved currency ref, named by Intl',
        'CurrencyUSD',
        441.9,
        rise,
        { amount: '441.9', suffix: '', caption: 'US Dollar · 2024 · +1.9% from 2023' },
    ],
    [
        'structured ISO currency with price basis',
        dollars({ prices: 'constant', base_year: 2023 }),
        441.9,
        undefined,
        { amount: '441.9', suffix: '', caption: 'US Dollar · constant 2023 prices · 2024' },
    ],
    [
        'magnitude scales the value before compacting',
        dollars({ magnitude: 'millions' }),
        23_400,
        undefined,
        { amount: '23.4B', suffix: '', caption: 'US Dollar · current prices · 2024' },
    ],
    [
        'magnitude scales a difference too',
        dollars({ magnitude: 'millions' }),
        23.4,
        { derivation: 'difference', basis: ['2023', '2024'], value: -1.1 },
        {
            amount: '23.4M',
            suffix: '',
            caption: 'US Dollar · current prices · 2024 · −1.1M from 2023',
        },
    ],
    [
        'percent: a suffix, uncompacted, a difference in points',
        'Percent',
        12.3,
        { derivation: 'difference', basis: ['2023', '2024'], value: -1.2 },
        { amount: '12.3', suffix: '%', caption: '2024 · −1.2 pts from 2023' },
    ],
    [
        'percent and its points keep two decimals',
        'Percent',
        0.32,
        { derivation: 'difference', basis: ['2023', '2024'], value: 0.04 },
        { amount: '0.32', suffix: '%', caption: '2024 · +0.04 pts from 2023' },
    ],
    [
        'a small percent keeps its second decimal; points that round to zero read unchanged',
        'Percentage',
        0.04,
        { derivation: 'difference', basis: ['2023', '2024'], value: 0.004 },
        { amount: '0.04', suffix: '%', caption: '2024 · unchanged from 2023' },
    ],
    [
        'a negative amount takes the typographic minus',
        'Person',
        -23_400_000,
        undefined,
        { amount: '−23.4M', suffix: '', caption: 'Person · 2024' },
    ],
    [
        'a negative percent takes the typographic minus',
        'Percent',
        -0.32,
        undefined,
        { amount: '−0.32', suffix: '%', caption: '2024' },
    ],
    [
        'a percent change that rounds to zero reads unchanged',
        'Person',
        23_400_000,
        { derivation: 'percent_change', basis: ['2023', '2024'], value: -0.04 },
        { amount: '23.4M', suffix: '', caption: 'Person · 2024 · unchanged from 2023' },
    ],
    [
        'percent sign as the unit',
        '%',
        1_250,
        undefined,
        { amount: '1,250', suffix: '%', caption: '2024' },
    ],
    [
        'other label with a difference in its own unit',
        'Person',
        23_700_000,
        { derivation: 'difference', basis: ['2023', '2024'], value: 1_100_000 },
        { amount: '23.7M', suffix: '', caption: 'Person · 2024 · +1.1M from 2023' },
    ],
    [
        'change over years that end before the headline',
        'Person',
        23_700_000,
        { derivation: 'percent_change', basis: ['2020', '2021'], value: 50 },
        { amount: '23.7M', suffix: '', caption: 'Person · 2024 · +50% from 2020 to 2021' },
    ],
    ['no unit', undefined, 64_000, undefined, { amount: '64.0K', suffix: '', caption: '2024' }],
    [
        'a saved structured unit with every member null reads as no unit',
        dollars({ currency: null, prices: null }),
        64_000,
        undefined,
        { amount: '64.0K', suffix: '', caption: '2024' },
    ],
    [
        'composed: a raw ref over a StatVar named by its label',
        { numerator: 'USDollar', denominator: population },
        58.31,
        undefined,
        { amount: '58.31', suffix: '', caption: 'US Dollar per Total population · 2024' },
    ],
    [
        'composed: the numerator keeps its price basis beside it',
        eurosPerPerson,
        58.31,
        rise,
        {
            amount: '58.31',
            suffix: '',
            caption: 'Euro (constant 2020 prices) per Total population · 2024 · +1.9% from 2023',
        },
    ],
    [
        'composed: the numerator magnitude scales the value and a difference',
        { numerator: dollars({ magnitude: 'thousands' }), denominator: 'Person' },
        2.5,
        { derivation: 'difference', basis: ['2023', '2024'], value: 0.5 },
        {
            amount: '2.5K',
            suffix: '',
            caption: 'US Dollar (current prices) per Person · 2024 · +500 from 2023',
        },
    ],
    [
        'trillions scale the value',
        dollars({ magnitude: 'trillions' }),
        2.5,
        undefined,
        { amount: '2.5T', suffix: '', caption: 'US Dollar · current prices · 2024' },
    ],
    [
        'composed: a numerator in trillions scales the value',
        { numerator: dollars({ magnitude: 'trillions' }), denominator: population },
        2.5,
        undefined,
        {
            amount: '2.5T',
            suffix: '',
            caption: 'US Dollar (current prices) per Total population · 2024',
        },
    ],
    [
        'composed: a numerator that names no currency scales the value and reads as its qualifiers',
        { numerator: { ...NO_AMOUNT, magnitude: 'thousands' }, denominator: population },
        2.5,
        undefined,
        { amount: '2.5K', suffix: '', caption: 'per Total population · 2024' },
    ],
    [
        'composed: a side that states nothing leaves no unit and no scale',
        { numerator: { ...NO_AMOUNT, magnitude: 'thousands' }, denominator: NO_AMOUNT },
        2.5,
        undefined,
        { amount: '2.5', suffix: '', caption: '2024' },
    ],
    [
        'composed: a denominator keeps its own price basis, and a percentage is named',
        { numerator: 'Percent', denominator: dollars({ prices: 'constant', base_year: 2023 }) },
        0.32,
        undefined,
        {
            amount: '0.32',
            suffix: '',
            caption: 'Percent per US Dollar (constant 2023 prices) · 2024',
        },
    ],
];

for (const [name, unit, value, change, expected] of CASES) {
    test(`statFace: ${name}`, () => {
        assert.deepEqual(statFace({ value, period: '2024', unit, change }), expected);
    });
}

test('statFace: a span period reads with an en dash, and no period leaves the caption to the unit', () => {
    assert.equal(statFace({ value: 1, period: '2018/2022' }).caption, '2018–2022');
    assert.equal(statFace({ value: 1, unit: 'Year' }).caption, 'Year');
});

const DESCRIPTIONS: [string, PayloadUnit | null, string | null][] = [
    [
        'structured currency',
        dollars({ prices: 'constant', base_year: 2023 }),
        'US Dollar, constant 2023 prices',
    ],
    [
        'structured currency keeps its magnitude, since the values stay unscaled',
        dollars({ magnitude: 'millions', prices: 'constant', base_year: 2023 }),
        'US Dollar, millions, constant 2023 prices',
    ],
    [
        'magnitude in units reads as none',
        dollars({ magnitude: 'units' }),
        'US Dollar, current prices',
    ],
    ['structured without currency', dollars({ currency: null, prices: null }), null],
    ['raw ref', 'USDollar', 'US Dollar'],
    ['percent', 'Percent', 'Percent'],
    ['none', null, null],
    ['composed', composedUnit, 'US Dollar per Total population'],
    [
        'composed with a numerator price basis',
        eurosPerPerson,
        'Euro (constant 2020 prices) per Total population',
    ],
    [
        'composed keeps the numerator magnitude, since the values stay unscaled',
        { numerator: dollars({ magnitude: 'millions' }), denominator: population },
        'US Dollar (millions, current prices) per Total population',
    ],
    [
        'composed with a numerator that names no currency reads as its qualifiers',
        { numerator: dollars({ currency: null, magnitude: 'thousands' }), denominator: population },
        'thousands, current prices per Total population',
    ],
    [
        'composed with a denominator that names no currency',
        { numerator: 'USDollar', denominator: { ...NO_AMOUNT, magnitude: 'thousands' } },
        'US Dollar per thousands',
    ],
    [
        'composed with a part that states nothing',
        { numerator: NO_AMOUNT, denominator: population },
        null,
    ],
    [
        'composed in trillions',
        { numerator: dollars({ magnitude: 'trillions' }), denominator: population },
        'US Dollar (trillions, current prices) per Total population',
    ],
    ['trillions', dollars({ magnitude: 'trillions' }), 'US Dollar, trillions, current prices'],
];

for (const [name, unit, expected] of DESCRIPTIONS) {
    test(`unitDescription: ${name}`, () => {
        assert.equal(unitDescription(unit), expected);
    });
}

const WORDS: [string, PayloadUnit, string | null][] = [
    ['composed', composedUnit, 'US Dollar per Total population'],
    ['composed drops the numerator brackets', eurosPerPerson, 'Euro per Total population'],
    [
        'composed drops the denominator brackets too',
        { numerator: 'Euro', denominator: dollars({ magnitude: 'millions' }) },
        'Euro per US Dollar',
    ],
    [
        'composed with a denominator that names no currency',
        { numerator: 'USDollar', denominator: { ...NO_AMOUNT, magnitude: 'thousands' } },
        'US Dollar per thousands',
    ],
    [
        'composed with a numerator that names no currency',
        { numerator: { ...NO_AMOUNT, magnitude: 'thousands' }, denominator: population },
        'per Total population',
    ],
    [
        'composed with neither side naming a currency',
        {
            numerator: { ...NO_AMOUNT, magnitude: 'thousands' },
            denominator: { ...NO_AMOUNT, prices: 'constant', base_year: 2020 },
        },
        'per constant 2020 prices',
    ],
    ['structured, qualifiers left to the face', dollars({ magnitude: 'millions' }), 'US Dollar'],
];

for (const [name, unit, expected] of WORDS) {
    test(`unitWords: ${name}`, () => {
        assert.equal(unitWords(unit), expected);
    });
}

const COMPACTS: [number, string][] = [
    [999.99, '999.99'],
    [999.995, '1.0K'],
    [999_949, '999.9K'],
    [999_950, '1.0M'],
    [-999_950, '-1.0M'],
    [999_950_000, '1.0B'],
    [999_950_000_000, '1.0T'],
    [37_000, '37.0K'],
];

for (const [value, expected] of COMPACTS) {
    test(`compact: ${value} reads ${expected}`, () => {
        assert.equal(compact(value), expected);
    });
}

for (const unit of ['Percent', 'Percentage', '%']) {
    test(`keyNumberFace: a saved ${unit} card without \`stat\` keeps its per cent sign`, () => {
        const saved: KeyNumberWidget = {
            kind: 'key_number',
            id: 'k',
            label: 'ODA/GNI',
            value: '0.32',
            unit,
            period: '2024',
        };

        assert.deepEqual(keyNumberFace(saved), { amount: '0.32', suffix: '%', caption: '2024' });
    });
}

test('keyNumberFace: a card saved before `stat` reads its display text, its unit named', () => {
    const saved: KeyNumberWidget = {
        kind: 'key_number',
        id: 'k',
        label: 'Aid',
        value: '23.4 M',
        unit: 'CurrencyUSD',
        period: '2024',
        change: '+4.0% from 2023 to 2024',
    };

    assert.deepEqual(keyNumberFace(saved), {
        amount: '23.4 M',
        suffix: '',
        caption: 'US Dollar · 2024 · +4.0% from 2023 to 2024',
    });
    assert.deepEqual(
        keyNumberFace({ ...saved, stat: { value: 12.3, period: '2024', unit: 'Percent' } }),
        { amount: '12.3', suffix: '%', caption: '2024' },
    );
});
