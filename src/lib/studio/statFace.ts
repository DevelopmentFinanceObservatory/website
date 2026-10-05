/**
 * A stat card's face: the number, a per cent sign after it when the unit is
 * a percentage, and one muted caption under it reading "unit · price basis ·
 * period · change" ("US Dollar · constant 2023 prices · 2024 · +1.9% from
 * 2023").
 *
 * The unit arrives in one of three shapes. A string is the graph's label
 * ("US Dollar") or, where the graph names none, the raw ref ("USDollar",
 * "Percent"), which reads spaced as Search spaces it. A card saved before
 * the platform labelled units holds a currency ref ("CurrencyUSD"). A
 * structured unit names an ISO 4217 currency, its magnitude and its price
 * basis. Currency names come from Intl.
 *
 * The value is scaled by the unit's magnitude ("441.9 in millions" is
 * 441,900,000) before it is compacted once, so the face never says "M" and
 * "millions" together.
 */

import type { KeyNumberWidget } from '../chat/widgets.ts';
import { spaceCamel } from '../spaceCamel.ts';
import type { PayloadChange, PayloadUnit } from './payload.ts';
import { formatPeriod } from './period.ts';

/** The raw headline a stat card is drawn from. A card sketched from an
 *  older payload has no period. */
export type StatValue = {
    value: number;
    period?: string;
    unit?: PayloadUnit;
    change?: PayloadChange;
};

export type StatFace = {
    // The number as the card prints it: "23.4M", "441.9", "12.3".
    amount: string;
    // Set lighter after the number: "%" for a percentage, else empty.
    suffix: string;
    // Unit words, price basis, period and change, joined by " · ".
    caption: string;
};

type UnitReading = {
    // Words for the unit, or null for a percentage (its sign is the suffix)
    // and for no unit.
    words: string | null;
    percent: boolean;
    // The magnitude in words ("millions"), null for none and for "units".
    magnitude: string | null;
    basis: string | null;
    scale: number;
};

const MAGNITUDES: Record<string, number> = { thousands: 1e3, millions: 1e6, billions: 1e9 };
const PERCENT = /^(%|percent|percentage)$/i;
const ISO_CURRENCY = /^[A-Z]{3}$/;
// The platform's currency unit ref: "Currency" and an ISO 4217 code.
const CURRENCY_REF = /^Currency([A-Z]{3})$/;

const CURRENCY_NAMES = new Intl.DisplayNames(['en'], { type: 'currency' });

// A unit's name: an ISO code or currency ref by Intl ("USD" and
// "CurrencyUSD" → "US Dollar"), a graph label as it stands, a raw ref spaced
// ("USDollar" → "US Dollar").
const unitName = (unit: string): string => {
    const iso = unit.match(CURRENCY_REF)?.[1] ?? (ISO_CURRENCY.test(unit) ? unit : null);

    return iso ? (CURRENCY_NAMES.of(iso) ?? iso) : spaceCamel(unit);
};

const priceBasis = (prices: string | null, baseYear: number | null): string | null => {
    if (!prices) {
        return null;
    }

    return prices === 'constant' && baseYear != null
        ? `constant ${baseYear} prices`
        : `${prices} prices`;
};

const readUnit = (unit: PayloadUnit | null | undefined): UnitReading => {
    if (unit == null) {
        return { words: null, percent: false, magnitude: null, basis: null, scale: 1 };
    }

    if (typeof unit === 'string') {
        const percent = PERCENT.test(unit);
        return {
            words: percent ? null : unitName(unit),
            percent,
            magnitude: null,
            basis: null,
            scale: 1,
        };
    }

    const scale = (unit.magnitude && MAGNITUDES[unit.magnitude]) || 1;

    return {
        words: unit.currency ? unitName(unit.currency) : null,
        percent: false,
        magnitude: scale === 1 ? null : unit.magnitude,
        basis: priceBasis(unit.prices, unit.base_year),
        scale,
    };
};

const oneDecimal = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    signDisplay: 'negative',
});
const twoDecimals = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    signDisplay: 'negative',
});

// Each letter, and the size from which a number takes it: where the tier
// below would round up to 1,000 of its own unit (999.995 to "1,000" at two
// decimals, 999,950 to "1000.0K" at one), so 999,950 reads "1.0M".
const LETTERS = [
    [1e12, 'T', 1e12 - 5e7],
    [1e9, 'B', 1e9 - 5e4],
    [1e6, 'M', 1e6 - 50],
    [1e3, 'K', 1e3 - 0.005],
] as const;

/** A number compacted to one decimal with K, M, B or T ("23.4M"); below a
 *  thousand, up to two decimals ("441.9"). `gap` sits between the number
 *  and its letter. */
export const compact = (value: number, gap = ''): string => {
    const abs = Math.abs(value);

    for (const [size, letter, from] of LETTERS) {
        if (abs >= from) {
            return `${(value / size).toFixed(1)}${gap}${letter}`;
        }
    }

    return twoDecimals.format(value);
};

/** A table cell's number, its letter spaced: "37.0 K". */
export const cellNumber = (value: number): string => compact(value, ' ');

// A face number with the typographic minus the change line uses.
const typographicMinus = (text: string): string => text.replace(/^-/, '−');

// A typographic minus for a fall, a plus for a rise.
const signed = (value: number, text: string): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`;

// "+1.9% from 2023", or "+1.9% from 2020 to 2021" when the comparison ends
// on a year other than the headline's. A difference reads in the card's own
// unit, and a difference between percentages in points at two decimals. A
// change that rounds to zero reads "unchanged from 2023".
const changeText = (
    { derivation, basis, value }: PayloadChange,
    unit: UnitReading,
    period: string | undefined,
): string => {
    const [start, end] = basis.map(formatPeriod);
    const from = period && end === formatPeriod(period) ? `from ${start}` : `from ${start} to ${end}`;
    const size = Math.abs(value) * (derivation === 'percent_change' ? 1 : unit.scale);
    const amount =
        derivation === 'percent_change'
            ? oneDecimal.format(size)
            : unit.percent
              ? twoDecimals.format(size)
              : compact(size);

    if (amount === '0') {
        return `unchanged ${from}`;
    }

    const suffix = derivation === 'percent_change' ? '%' : unit.percent ? ' pts' : '';

    return `${signed(value, `${amount}${suffix}`)} ${from}`;
};

/** The unit as the More Info panel names it: its words, its magnitude and
 *  its price basis ("US Dollar, millions, constant 2023 prices"), since the
 *  card's chart, table and file hold the values unscaled. A percentage reads
 *  "Percent", and no unit gives null. */
export const unitDescription = (unit: PayloadUnit | null | undefined): string | null => {
    const reading = readUnit(unit);
    const parts = [
        reading.percent ? 'Percent' : reading.words,
        reading.magnitude,
        reading.basis,
    ].filter(Boolean);

    return parts.length ? parts.join(', ') : null;
};

/** The unit in words for a caption or a chip: "US Dollar", "Person". A percentage
 *  and no unit give null. */
export const unitWords = (unit: PayloadUnit | null | undefined): string | null =>
    readUnit(unit).words;

/** The number with its suffix as one string: "23.4M", "12.3%". */
export const faceText = ({ amount, suffix }: StatFace): string => `${amount}${suffix}`;

export const statFace = ({ value, period, unit, change }: StatValue): StatFace => {
    const reading = readUnit(unit);
    const scaled = value * reading.scale;

    return {
        amount: typographicMinus(reading.percent ? twoDecimals.format(scaled) : compact(scaled)),
        suffix: reading.percent ? '%' : '',
        caption: [
            reading.words,
            reading.basis,
            period && formatPeriod(period),
            change && changeText(change, reading, period),
        ]
            .filter(Boolean)
            .join(' · '),
    };
};

/** A stat card's face: drawn from its raw headline, or, for a card saved
 *  before it kept one, from the display text it holds. */
export const keyNumberFace = (widget: KeyNumberWidget): StatFace => {
    if (widget.stat) {
        return statFace(widget.stat);
    }

    const reading = readUnit(widget.unit);

    return {
        amount: widget.value,
        suffix: reading.percent ? '%' : '',
        caption: [reading.words, widget.period, widget.change].filter(Boolean).join(' · '),
    };
};
