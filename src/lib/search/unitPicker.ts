/**
 * The pure half of the unit token's picker (UnitPicker.tsx): which currency
 * and price basis the answer is in, the preset currencies to offer, the
 * search over every convertible currency, and the unit request a pick
 * posts as `identity.facets.unit`, on one part or, from a unit token the
 * parts share, on every part that converts. A shared token offers only what
 * every part's offer serves (`sharedOffer`), and a request goes out only
 * when every part it touches serves it (`servesRequest`).
 */

import type { DatasetEntriesOverride } from './datasetEntries.ts';
import { capitalise } from '../capitalise.ts';
import { withFacetEdit } from './promote.ts';
import { currencyName } from './tokenAbout.ts';
import { priceBasis, unitRequest } from './unitLabel.ts';
import type {
    ConversionCurrency,
    EntityRoleKey,
    HydratedPart,
    IdentityUnitRequest,
    SpecReading,
    UnitConversion,
} from './types.ts';

/** The answer's unit: a currency code and a price basis, with the base
 *  year of a constant-price unit. */
export type CurrentUnit = {
    currency: string | null;
    prices: 'current' | 'constant';
    baseYear: number | null;
};

/** One preset row: the label it shows and the currency a pick requests. */
export type UnitPreset = {
    code: string;
    label: string;
    currency: IdentityUnitRequest['currency'];
};

/** One currency the search offers: its name and code. */
export type CurrencyOption = { code: string; name: string };

/** The price bases a currency converts the answer at: current prices, and
 *  the run of base years constant prices take (null when none). */
export type PriceBases = {
    current: boolean;
    baseYears: { min: number; max: number } | null;
};

const LOCALE = 'en-GB';

const ROLE_NAMES: Record<EntityRoleKey, string> = {
    origin: 'Provider',
    destination: 'Recipient',
    observationAbout: 'Place',
};

/** The roles the request form accepts as a currency. */
const REQUEST_ROLES = new Set<EntityRoleKey>(['origin', 'destination']);

/** The answer's conversion offer, null when it cannot be converted. */
export const unitConversion = (spec: SpecReading | null | undefined): UnitConversion | null => {
    const conversion = spec?.unit_conversion;

    return conversion && conversion.currencies.length > 0 ? conversion : null;
};

/** The price bases `code` converts the answer at: current prices when
 *  some year converts at them, constant prices when some year converts
 *  and a base year exists. A currency the offer does not hold converts at
 *  neither. */
export const priceBases = (conversion: UnitConversion, code: string | null): PriceBases => {
    const currency = conversion.currencies.find((entry) => entry.code === code);
    const min = currency?.base_year_min ?? null;
    const max = currency?.base_year_max ?? null;

    return {
        current: currency?.current_years != null,
        baseYears:
            currency?.constant_years != null && min != null && max != null ? { min, max } : null,
    };
};

/** The offer's entry for `code` with what every other offer serves of it:
 *  current prices when all convert at them, constant prices when all do,
 *  over the base years all take. The years shown stay the first offer's,
 *  since each part converts its own window. Null when the parts share
 *  neither basis. */
const sharedCurrency = (
    first: ConversionCurrency,
    others: UnitConversion[],
): ConversionCurrency | null => {
    const entries = others.map((offer) =>
        offer.currencies.find((currency) => currency.code === first.code),
    );

    if (entries.some((entry) => !entry)) return null;

    const all = [first, ...(entries as ConversionCurrency[])];
    const current = all.every((entry) => entry.current_years != null);
    const mins = all.map((entry) => entry.base_year_min);
    const maxes = all.map((entry) => entry.base_year_max);
    const min = mins.includes(null) ? null : Math.max(...(mins as number[]));
    const max = maxes.includes(null) ? null : Math.min(...(maxes as number[]));
    const constant =
        all.every((entry) => entry.constant_years != null) &&
        min != null &&
        max != null &&
        min <= max;

    if (!current && !constant) return null;

    return {
        ...first,
        current_years: current ? first.current_years : null,
        constant_years: constant ? first.constant_years : null,
        base_year_min: constant ? min : null,
        base_year_max: constant ? max : null,
    };
};

/** What every offer serves: the currencies all hold, each at the price
 *  bases all convert it at, and the role currencies all agree on. The
 *  first offer's default base year. Null when no currency is common. */
export const sharedOffer = (offers: UnitConversion[]): UnitConversion | null => {
    const [first, ...others] = offers;

    if (!first) return null;

    const currencies = first.currencies.flatMap(
        (currency) => sharedCurrency(currency, others) ?? [],
    );
    const roleCurrencies = Object.fromEntries(
        Object.entries(first.role_currencies ?? {}).filter(([role, code]) =>
            others.every((offer) => offer.role_currencies?.[role] === code),
        ),
    );

    return currencies.length > 0 ? { ...first, currencies, role_currencies: roleCurrencies } : null;
};

const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/** The ISO code a unit request's currency names, reading a role through
 *  the answer's role currencies. */
const requestCode = (
    currency: IdentityUnitRequest['currency'] | undefined,
    conversion: UnitConversion | null,
): string | null => {
    if (!currency) return null;
    if (typeof currency === 'string') return currency;

    return conversion?.role_currencies?.[currency.role] ?? null;
};

/** The answer's unit: the identity's unit request when it carries one,
 *  else the served currency and the measure's price basis. */
export const currentUnit = (spec: SpecReading | null | undefined): CurrentUnit => {
    const request = unitRequest(spec);
    const basis = priceBasis(spec);

    return {
        currency:
            requestCode(request?.currency, unitConversion(spec)) ??
            spec?.facets?.unit?.currency ??
            null,
        prices: basis?.prices ?? 'current',
        baseYear: basis?.baseYear ?? null,
    };
};

/**
 * The rows `conversion` offers: US dollars, euros, then the currency of
 * each role's one entity, named by
 * that entity ("Guatemala's currency: Guatemalan quetzals"), then the
 * answer's own currency when it is none of those, so the current unit
 * always has a row. One row per code: a role currency that is also a
 * preset takes the preset's place under the entity's name. An entity with
 * no name is named by its role, and the row requests the role's currency.
 */
export const unitPresets = (
    spec: SpecReading | null | undefined,
    conversion: UnitConversion | null,
): UnitPreset[] => {
    if (!conversion) return [];

    const offered = new Set(conversion.currencies.map((currency) => currency.code));
    const presets: UnitPreset[] = ['USD', 'EUR']
        .filter((code) => offered.has(code))
        .map((code) => ({
            code,
            label: capitalise(currencyName(code, conversion)),
            currency: code,
        }));
    const entities = spec?.entities ?? [];

    for (const [role, code] of Object.entries(conversion.role_currencies ?? {}) as [
        EntityRoleKey,
        string | undefined,
    ][]) {
        if (!code || !offered.has(code)) continue;

        const named = entities.filter((entity) => entity?.role === role);
        const name = named.length === 1 ? named[0]?.label : null;

        if (!name && !REQUEST_ROLES.has(role)) continue;

        const preset: UnitPreset = {
            code,
            label: `${possessive(name ?? ROLE_NAMES[role])} currency: ${currencyName(code, conversion)}`,
            currency: name ? code : { role: role as 'origin' | 'destination' },
        };
        const at = presets.findIndex((entry) => entry.code === code);

        if (at === -1) presets.push(preset);
        else presets[at] = preset;
    }

    const { currency } = currentUnit(spec);

    if (currency && !presets.some((preset) => preset.code === currency)) {
        presets.push({
            code: currency,
            label: capitalise(currencyName(currency, conversion)),
            currency,
        });
    }

    return presets;
};

/** Every currency `conversion` offers whose name or code holds `query`, by
 *  name. */
export const currencyMatches = (
    conversion: UnitConversion | null,
    query: string,
): CurrencyOption[] => {
    const needle = query.trim().toLowerCase();

    if (!needle) return [];

    return (conversion?.currencies ?? [])
        .map(({ code }) => ({ code, name: capitalise(currencyName(code, conversion)) }))
        .filter(
            ({ code, name }) =>
                code.toLowerCase().includes(needle) || name.toLowerCase().includes(needle),
        )
        .toSorted((a, b) => a.name.localeCompare(b.name, LOCALE));
};

/** A base year the currency's constant prices take, or null. */
export const validBaseYear = (text: string, bases: PriceBases): number | null => {
    if (!bases.baseYears || !/^\d{4}$/.test(text.trim())) return null;

    const year = Number(text);

    return year >= bases.baseYears.min && year <= bases.baseYears.max ? year : null;
};

/** The unit a currency pick keeps the basis of: the answer's, or constant
 *  prices of `baseYear` once the reader has staged them in the switch
 *  ("Constant", 2024) without applying them. A staged constant basis with
 *  no valid year keeps the answer's. */
export const stagedUnit = (
    current: CurrentUnit,
    prices: 'current' | 'constant',
    baseYear: number | null,
): CurrentUnit =>
    prices === 'constant' && baseYear != null ? { ...current, prices, baseYear } : current;

const clamp = (year: number, { min, max }: { min: number; max: number }): number =>
    Math.min(Math.max(year, min), max);

/** The request a currency pick posts: the new currency at `staged`'s price
 *  basis when the currency converts at it, else at the basis it does. A
 *  base year outside the currency's run moves to the nearer end (1970 in
 *  quetzales, whose base years start in 1980, becomes 1980), and a constant
 *  unit with no known base year takes the conversion's default. Null when
 *  the currency converts at neither basis. */
export const currencyRequest = (
    staged: CurrentUnit,
    currency: IdentityUnitRequest['currency'],
    conversion: UnitConversion,
): IdentityUnitRequest | null => {
    const bases = priceBases(conversion, requestCode(currency, conversion));
    const years = bases.baseYears;

    if (years && (staged.prices === 'constant' || !bases.current)) {
        return {
            currency,
            prices: 'constant',
            base_year: clamp(staged.baseYear ?? conversion.default_base_year, years),
        };
    }

    return bases.current ? { currency, prices: 'current' } : null;
};

/** Whether `conversion` serves `request`: its currency at its price basis,
 *  and a constant request's base year inside the currency's run. */
export const servesRequest = (
    conversion: UnitConversion,
    request: IdentityUnitRequest,
): boolean => {
    const bases = priceBases(conversion, requestCode(request.currency, conversion));

    const year = request.base_year;

    if (request.prices === 'current') return bases.current;

    return bases.baseYears != null && year != null && clamp(year, bases.baseYears) === year;
};

/** The request a price-basis pick posts: the answer's currency at current
 *  prices, or at constant prices of `baseYear`. */
export const pricesRequest = (
    current: CurrentUnit,
    prices: 'current' | 'constant',
    baseYear: number,
): IdentityUnitRequest | null => {
    if (!current.currency) return null;

    return prices === 'constant'
        ? { currency: current.currency, prices, base_year: baseYear }
        : { currency: current.currency, prices };
};

/** A pick on the unit token a multi-part answer's parts share: the same
 *  unit request on every definite part whose answer offers a conversion,
 *  each resolving a role currency against its own entities. A part with no
 *  offer keeps its unit. Null when no part converts, or when some part that
 *  converts cannot serve the request. */
export const sharedUnitEdit = (
    parts: HydratedPart[],
    request: IdentityUnitRequest,
): { touched: number[]; override: DatasetEntriesOverride } | null => {
    const offers = parts.flatMap((part) => {
        const conversion =
            part.part?.status === 'definite' ? unitConversion(part.hydratedSpec) : null;

        return conversion ? [{ index: part.index, conversion }] : [];
    });

    if (offers.length === 0) return null;
    if (!offers.every(({ conversion }) => servesRequest(conversion, request))) return null;

    const touched = offers.map(({ index }) => index);

    return {
        touched,
        override: {
            rewriteIdentity: (identity, part) =>
                touched.includes(part.index)
                    ? withFacetEdit(identity, 'unit', { state: 'value', request })
                    : identity,
        },
    };
};
