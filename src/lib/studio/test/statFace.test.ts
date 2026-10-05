/**
 * `statFace`: a stat card's number, suffix and caption per unit kind, the
 * value scaled by its magnitude before it is compacted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { KeyNumberWidget } from '../../chat/widgets.ts';
import type { PayloadChange, PayloadUnit } from '../payload.ts';
import { compact, keyNumberFace, statFace, unitDescription, type StatFace } from '../statFace.ts';

const dollars = (fields: Partial<Exclude<PayloadUnit, string>> = {}): PayloadUnit => ({
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
];

for (const [name, unit, expected] of DESCRIPTIONS) {
    test(`unitDescription: ${name}`, () => {
        assert.equal(unitDescription(unit), expected);
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
