/**
 * A stat card's face: the number, a per cent sign after it when the unit is
 * a percentage, and one muted caption under it reading "unit · price basis ·
 * period · change" ("US Dollar · constant 2023 prices · 2024 · +1.9% from
 * 2023").
 *
 * The unit arrives in one of four shapes. A string is the graph's label
 * ("US Dollar") or, where the graph names none, the raw ref ("USDollar",
 * "Percent"), which reads spaced as Search spaces it. A card saved before
 * the platform labelled units holds a currency ref ("CurrencyUSD"). A
 * structured unit names an ISO 4217 currency, its magnitude and its price
 * basis. Currency names come from Intl. A composed unit is the unit of a
 * quotient of two measures and reads "numerator per denominator", each part
 * a string, a structured unit, or a StatVar named by its label ("US Dollar
 * per Total population").
 *
 * A composed unit's magnitude and price basis sit in brackets beside the
 * part they belong to ("Euro (constant 2020 prices) per Total population"),
 * so each stays with its own part.
 *
 * The value is scaled by the unit's magnitude ("441.9 in millions" is
 * 441,900,000) before it is compacted once, so the face never says "M" and
 * "millions" together. A composed unit scales by its numerator's magnitude.
 */

import type { KeyNumberWidget } from '../chat/widgets.ts';
import { spaceCamel } from '../spaceCamel.ts';
import type { PayloadChange, PayloadUnit, StructuredUnit, UnitPart } from './payload.ts';
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
    // Words for the unit, a composed unit's numerator alone, or null for a
    // percentage (its sign is the suffix) and for no unit.
    words: string | null;
    // A composed unit's denominator; null for every other unit.
    per: UnitReading | null;
    percent: boolean;
    // The magnitude in words ("millions"), null for none and for "units".
    magnitude: string | null;
    basis: string | null;
    scale: number;
};

const MAGNITUDES: Record<string, number> = {
    thousands: 1e3,
    millions: 1e6,
    billions: 1e9,
    trillions: 1e12,
};
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

/** Whether a unit is a percentage: "Percent", "Percentage" or "%". */
export const isPercentUnit = (unit: string | null | undefined): boolean =>
    unit != null && PERCENT.test(unit);

const NO_UNIT: UnitReading = {
    words: null,
    per: null,
    percent: false,
    magnitude: null,
    basis: null,
    scale: 1,
};

const readStructured = (unit: StructuredUnit): UnitReading => {
    const scale = (unit.magnitude && MAGNITUDES[unit.magnitude]) || 1;

    return {
        ...NO_UNIT,
        words: unit.currency ? unitName(unit.currency) : null,
        magnitude: scale === 1 ? null : unit.magnitude,
        basis: priceBasis(unit.prices, unit.base_year),
        scale,
    };
};

// One side of a composed unit. A percentage is named here, since a rate
// per something takes no per cent sign.
const readPart = (part: UnitPart): UnitReading => {
    if (typeof part === 'string') {
        return { ...NO_UNIT, words: unitName(part) };
    }

    return 'stat_var' in part ? { ...NO_UNIT, words: part.label } : readStructured(part);
};

// A side of a composed unit: its words with what qualifies them ("Euro
// (millions, constant 2020 prices)"), or the qualifiers alone where it names
// no currency ("thousands"). Null when it states neither.
const side = (words: string | null, qualifiers: (string | null)[]): string | null => {
    const stated = qualifiers.filter(Boolean);

    if (!words) {
        return stated.join(', ') || null;
    }

    return stated.length ? `${words} (${stated.join(', ')})` : words;
};

// Whether a side of a composed unit names or qualifies anything.
const qualified = ({ words, magnitude, basis }: UnitReading): boolean =>
    Boolean(words ?? magnitude ?? basis);

const readUnit = (unit: PayloadUnit | null | undefined): UnitReading => {
    if (unit == null) {
        return NO_UNIT;
    }

    if (typeof unit === 'string') {
        const percent = isPercentUnit(unit);

        return { ...NO_UNIT, words: percent ? null : unitName(unit), percent };
    }

    if (!('numerator' in unit)) {
        return readStructured(unit);
    }

    const numerator = readPart(unit.numerator);
    const per = readPart(unit.denominator);

    // A side that states nothing leaves no unit to read, and no scale.
    return qualified(numerator) && qualified(per) ? { ...numerator, per } : NO_UNIT;
};

// The unit's name and its qualifiers as the pieces a caption or a
// description joins. A composed unit is one piece: each side's qualifiers
// bracketed beside its name, or standing alone where the side names no
// currency. With `brackets` off a named side keeps its name alone, which is
// the unit in words.
const unitPieces = (
    name: string | null,
    reading: UnitReading,
    qualifiers: (string | null)[],
    brackets = true,
): (string | null)[] => {
    const named = (words: string | null, own: (string | null)[]) =>
        side(words, words && !brackets ? [] : own);

    if (!reading.per) {
        return [name, ...(brackets ? qualifiers : [])];
    }

    const numerator = named(name, qualifiers);
    const denominator = named(reading.per.words, [reading.per.magnitude, reading.per.basis]);

    return [numerator ? `${numerator} per ${denominator}` : `per ${denominator}`];
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

/** A percentage's number in full, up to two decimals ("5.33", "1,250"). */
export const percentNumber = (value: number): string => twoDecimals.format(value);

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
    const from =
        period && end === formatPeriod(period) ? `from ${start}` : `from ${start} to ${end}`;
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
 *  card's chart, table and file hold the values unscaled. A composed unit
 *  brackets them beside its numerator ("Euro (constant 2020 prices) per
 *  Total population"). A percentage reads "Percent", and no unit gives
 *  null. */
export const unitDescription = (unit: PayloadUnit | null | undefined): string | null => {
    const reading = readUnit(unit);
    const parts = unitPieces(reading.percent ? 'Percent' : reading.words, reading, [
        reading.magnitude,
        reading.basis,
    ]).filter(Boolean);

    return parts.length ? parts.join(', ') : null;
};

/** The unit in words for a caption or a chip: "US Dollar", "Person", "US
 *  Dollar per Total population". A percentage and no unit give null. */
export const unitWords = (unit: PayloadUnit | null | undefined): string | null => {
    const reading = readUnit(unit);

    return unitPieces(reading.words, reading, [reading.basis], false)[0] ?? null;
};

/** The number with its suffix as one string: "23.4M", "12.3%". */
export const faceText = ({ amount, suffix }: StatFace): string => `${amount}${suffix}`;

export const statFace = ({ value, period, unit, change }: StatValue): StatFace => {
    const reading = readUnit(unit);
    const scaled = value * reading.scale;

    return {
        amount: typographicMinus(reading.percent ? percentNumber(scaled) : compact(scaled)),
        suffix: reading.percent ? '%' : '',
        caption: [
            ...unitPieces(reading.words, reading, [reading.basis]),
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
