/**
 * The pure half of the unit choice (UnitChoice.tsx): the chips a unit
 * question shows (currency, prices and, for constant prices, the base year),
 * the rows each chip's list offers, and the unit a pick moves to. Every pick
 * lands on a unit the offer serves: a currency that lacks the price basis in
 * force takes one it has, and a base year outside the new currency's range
 * moves to the nearer end, as /data's unit picker does.
 */

import { capitalise } from '../capitalise.ts';
import { clamp } from '../search/unitPicker.ts';
import type { UnitAnswer, UnitChoice, UnitCurrency, UnitOffer, UnitPrices } from './wire.ts';

export type UnitChipKey = 'currency' | 'prices' | 'year';

/** One chip: what it shows and the name of what it sets. */
export type UnitChip = { key: UnitChipKey; label: string; name: string };

/** One row of a chip's list: the value a pick sets and the words it shows. */
export type UnitRow<TValue> = { value: TValue; label: string };

const LOCALE = 'en-GB';

const PRICES: UnitPrices[] = ['current', 'constant'];

const PRICES_CHIP: Record<UnitPrices, string> = { current: 'Current', constant: 'Constant' };

const PRICES_ROW: Record<UnitPrices, string> = {
    current: 'Current prices',
    constant: 'Constant prices',
};

/** The offered currency with `code`, if any. */
export const offeredCurrency = (offer: UnitOffer, code: string): UnitCurrency | undefined =>
    offer.currencies.find((currency) => currency.code === code);

/** The currency as a chip or row shows it: Search's noun, capitalised. */
export const currencyLabel = (offer: UnitOffer, code: string): string =>
    capitalise(offeredCurrency(offer, code)?.name ?? code);

/** The run of base years `currency`'s constant prices take, or null. */
export const yearRange = (
    currency: UnitCurrency | undefined,
): { min: number; max: number } | null => {
    const min = currency?.base_year_min;
    const max = currency?.base_year_max;

    return currency?.prices.includes('constant') && min != null && max != null
        ? { min, max }
        : null;
};

/** The chips for `unit`: currency and prices, and the base year when the
 *  prices are constant. */
export const unitChips = (offer: UnitOffer, unit: UnitChoice): UnitChip[] => [
    { key: 'currency', label: currencyLabel(offer, unit.currency), name: 'Currency' },
    { key: 'prices', label: PRICES_CHIP[unit.prices], name: 'Prices' },
    ...(unit.prices === 'constant' && unit.base_year != null
        ? [{ key: 'year' as const, label: `${unit.base_year} prices`, name: 'Base year' }]
        : []),
];

/** The currency list: the offered presets, then, closed, the currency in
 *  force when it is not a preset, or, opened to any currency, every other
 *  offered currency by name. */
export const currencyRows = (
    offer: UnitOffer,
    unit: UnitChoice,
    all: boolean,
): UnitRow<string>[] => {
    const presets = [...new Set(offer.presets)].filter((code) => offeredCurrency(offer, code));
    const row = (code: string): UnitRow<string> => ({
        value: code,
        label: currencyLabel(offer, code),
    });

    if (!all) {
        const shown = presets.includes(unit.currency) ? presets : [...presets, unit.currency];

        return shown.map(row);
    }

    const rest = offer.currencies
        .filter(({ code }) => !presets.includes(code))
        .map(({ code }) => row(code))
        .toSorted((a, b) => a.label.localeCompare(b.label, LOCALE));

    return [...presets.map(row), ...rest];
};

/** The price bases the unit's currency serves, current first. */
export const priceRows = (offer: UnitOffer, unit: UnitChoice): UnitRow<UnitPrices>[] => {
    const served = offeredCurrency(offer, unit.currency)?.prices ?? [];

    return PRICES.filter((prices) => served.includes(prices)).map((prices) => ({
        value: prices,
        label: PRICES_ROW[prices],
    }));
};

/** The base years the unit's currency takes, newest first. */
export const baseYears = (offer: UnitOffer, unit: UnitChoice): number[] => {
    const range = yearRange(offeredCurrency(offer, unit.currency));

    return range
        ? Array.from({ length: range.max - range.min + 1 }, (_, index) => range.max - index)
        : [];
};

/** Whether any of `texts` holds the typed `query`, ignoring case and the
 *  spaces around it. An empty query matches everything. */
export const matchesQuery = (query: string, ...texts: string[]): boolean => {
    const needle = query.trim().toLowerCase();

    return !needle || texts.some((text) => text.toLowerCase().includes(needle));
};

// The unit `currency` serves at `prices`, keeping `year` (else the offer's
// starting base year, else the newest) inside the currency's range. A
// constant basis with no year to take falls back to current prices. Null
// when the currency serves neither, so a caller keeps the unit it has.
const settle = (
    offer: UnitOffer,
    currency: UnitCurrency,
    prices: UnitPrices,
    year: number | null | undefined,
): UnitChoice | null => {
    if (prices === 'current') {
        return { currency: currency.code, prices };
    }

    const range = yearRange(currency);
    const wanted = year ?? offer.start.base_year ?? range?.max;

    if (wanted == null) {
        return currency.prices.includes('current')
            ? { currency: currency.code, prices: 'current' }
            : null;
    }

    return {
        currency: currency.code,
        prices,
        base_year: range ? clamp(wanted, range) : wanted,
    };
};

/** The unit after picking currency `code`: its basis kept when the new
 *  currency serves it, else the one it does, and a constant base year moved
 *  into its range. */
export const withCurrency = (offer: UnitOffer, unit: UnitChoice, code: string): UnitChoice => {
    const currency = offeredCurrency(offer, code);

    if (!currency) {
        return unit;
    }

    const prices = currency.prices.includes(unit.prices) ? unit.prices : currency.prices[0];

    return (prices && settle(offer, currency, prices, unit.base_year)) || unit;
};

/** The unit after picking a price basis: a constant basis takes the base
 *  year in force, else the offer's starting one, inside the currency's
 *  range. */
export const withPrices = (offer: UnitOffer, unit: UnitChoice, prices: UnitPrices): UnitChoice => {
    const currency = offeredCurrency(offer, unit.currency);

    return (
        (currency?.prices.includes(prices) && settle(offer, currency, prices, unit.base_year)) ||
        unit
    );
};

/** The unit after picking a base year. */
export const withBaseYear = (unit: UnitChoice, year: number): UnitChoice =>
    unit.prices === 'constant' ? { ...unit, base_year: year } : unit;

/** Whether the offer serves `unit`: an offered currency at a basis it
 *  serves, with a base year inside its range on constant prices and none on
 *  current prices. */
export const servesUnit = (offer: UnitOffer, unit: UnitChoice): boolean => {
    const currency = offeredCurrency(offer, unit.currency);

    if (!currency?.prices.includes(unit.prices)) {
        return false;
    }

    if (unit.prices === 'current') {
        return unit.base_year == null;
    }

    const year = unit.base_year;
    const range = yearRange(currency);

    return (
        year != null &&
        Number.isInteger(year) &&
        (range === null || (year >= range.min && year <= range.max))
    );
};

/** Whether `unit` differs from `start`. The base year counts only on
 *  constant prices. */
export const unitChanged = (start: UnitChoice, unit: UnitChoice): boolean =>
    start.currency !== unit.currency ||
    start.prices !== unit.prices ||
    (unit.prices === 'constant' && start.base_year !== unit.base_year);

/** The unit in words: "Constant 2023 US dollars", "Current US dollars". */
export const unitText = (offer: UnitOffer, unit: UnitChoice): string => {
    const name = offeredCurrency(offer, unit.currency)?.name ?? unit.currency;

    return unit.prices === 'constant'
        ? `Constant ${unit.base_year ?? ''} ${name}`.replace(/\s+/g, ' ')
        : `Current ${name}`;
};

/** The answer a unit question sends for `unit`; a current unit carries no
 *  base year. */
export const unitAnswer = (unit: UnitChoice): UnitAnswer =>
    unit.prices === 'constant'
        ? { kind: 'unit', currency: unit.currency, prices: unit.prices, base_year: unit.base_year }
        : { kind: 'unit', currency: unit.currency, prices: unit.prices };
