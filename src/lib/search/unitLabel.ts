/**
 * The unit the way the byline names it, with the price basis ("Constant 2020
 * US dollars", "Current euros"). The Spec's unit facet names the currency
 * alone, so every place that states the answer's unit reads it through here.
 * A leaf module: view.ts and tokenAbout.ts both import it.
 */

import type { IdentityUnitRequest, SpecReading } from './types.ts';

export type PriceBasis = { prices: 'current' | 'constant'; baseYear: number | null };

// The measure axis whose value names a price basis, and the values that
// name one (dfo-apis search/heading/price_basis.py PRICES_BY_QUALIFIER).
const QUALIFIER_AXIS = 'measurementQualifier';
const PRICES_BY_QUALIFIER: Record<string, PriceBasis['prices']> = {
    Nominal: 'current',
    RealValue: 'constant',
};

/** The unit request the spec's identity binds, when it binds one. */
export const unitRequest = (
    spec: Pick<SpecReading, 'identity'> | null | undefined,
): IdentityUnitRequest | undefined => {
    const unit = spec?.identity?.facets?.unit;

    return unit && 'request' in unit ? unit.request : undefined;
};

const isPrices = (prices: string): prices is PriceBasis['prices'] =>
    prices === 'current' || prices === 'constant';

/** The answer's price basis, by the API's own precedence: the identity's
 *  unit request, then a unit in constant prices of a year
 *  ("ChainedUSDollarBaseYr2017"), then the measure's qualifier (Nominal,
 *  RealValue). Null when nothing states one. */
export const priceBasis = (spec: SpecReading | null | undefined): PriceBasis | null => {
    const request = unitRequest(spec);

    if (request && isPrices(request.prices)) {
        return { prices: request.prices, baseYear: request.base_year ?? null };
    }

    const baseYear = /BaseYr(\d{4})/.exec(spec?.facets?.unit?.ref ?? '')?.[1];

    if (baseYear) return { prices: 'constant', baseYear: Number(baseYear) };

    const qualifier = (spec?.measure_axis_values ?? []).find(
        (entry) => entry?.axis === QUALIFIER_AXIS,
    )?.value?.ref;
    const prices = qualifier ? PRICES_BY_QUALIFIER[qualifier] : undefined;

    return prices ? { prices, baseYear: null } : null;
};

/** The unit with its price basis: the byline unit token's own text when the
 *  plan carries one, else the basis and the noun the answer's conversion offer
 *  gives the currency, composed the way the byline composes them. Null for a
 *  unit that is no currency, or a currency with no stated basis or no noun,
 *  which the caller names itself. */
export const unitWithBasis = (spec: SpecReading | null | undefined): string | null => {
    const currency: string | null = spec?.facets?.unit?.currency ?? null;

    if (!currency) return null;

    const token = (spec?.sentence_plan ?? []).find(
        (entry) => entry.axis === 'unit' && entry.segment === 'byline' && entry.text,
    );

    if (token) return token.text;

    const basis = priceBasis(spec);
    const noun = spec?.unit_conversion?.currencies.find((entry) => entry.code === currency)?.noun;

    if (!basis || !noun) return null;

    const prices =
        basis.prices === 'current'
            ? 'Current'
            : basis.baseYear
              ? `Constant ${basis.baseYear}`
              : 'Constant';

    return `${prices} ${noun}`;
};
