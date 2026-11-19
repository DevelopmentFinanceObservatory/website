// The figures behind the lede and the scope: totals, a scope's series, the lede's counts.
import type { Country, HivData, ProviderKey, ProviderSeries } from '../_data/types.ts';

import { PROVIDER_KEYS } from './providers.ts';

/** The year the page's last-year figures are for: the last of `HivData.years`. */
export const lastYear = (data: { readonly years: readonly number[] }): number => {
    const year = data.years.at(-1);

    if (year === undefined) {
        throw new Error('HivData.years is empty');
    }

    return year;
};

/** The lede counts countries that received more than this in the last year, in US dollars. */
export const LEDE_THRESHOLD = 1_000_000;

/** The sum over providers, one value per year. */
export const seriesTotals = (series: ProviderSeries): number[] =>
    series.us.map((_, index) =>
        PROVIDER_KEYS.reduce((sum, key) => sum + (series[key][index] ?? 0), 0),
    );

/** A series' total in its last year. */
export const lastTotal = (series: ProviderSeries): number => seriesTotals(series).at(-1) ?? 0;

/** A country's HIV aid in the last year, all providers. */
export const lastAid = (country: Country): number => lastTotal(country.aid);

/** Each provider's share of a series' last-year total; all 0 where the total is 0. */
export const lastShares = (series: ProviderSeries): Record<ProviderKey, number> => {
    const total = lastTotal(series);
    const share = (key: ProviderKey): number => (total > 0 ? (series[key].at(-1) ?? 0) / total : 0);

    return { us: share('us'), globalFund: share('globalFund'), other: share('other') };
};

/** The names of the countries with no estimate of people living with HIV, in data order. */
export const withoutPlhiv = (data: HivData): string[] =>
    data.countries.filter((country) => country.plhiv === null).map((country) => country.name);

export const findCountry = (data: HivData, iso3: string): Country | undefined =>
    data.countries.find((country) => country.iso3 === iso3);

/**
 * The series the bars show: the money allocated to all countries for null, else the
 * country's own. An iso3 not in the data shows the all-countries series.
 */
export const scopeSeries = (data: HivData, iso3: string | null): ProviderSeries =>
    (iso3 === null ? undefined : findCountry(data, iso3))?.aid ?? data.allocated;

/** The Global Fund multi-disease grants the hatched layer shows: the sum over every recipient
 *  country for null, else the country's own. An iso3 not in the data shows the sum. */
export const scopeMulti = (data: HivData, iso3: string | null): readonly number[] =>
    (iso3 === null ? undefined : findCountry(data, iso3))?.globalFundMulti ?? data.globalFundMulti;

/** The Global Fund gave the country multi-disease grants in the last year, which code 13040
 *  leaves out, so its row understates the Global Fund. */
export const gfMultiFlag = (country: Country): boolean => (country.globalFundMulti.at(-1) ?? 0) > 0;

/** Aid per person is left blank below this many people living with HIV, where a small count
 *  makes the ratio swing (681 people in Mongolia give $8,736 each). */
export const PER_PERSON_MIN_PLHIV = 5_000;

/** Last-year HIV aid over people living with HIV, in US dollars; null with no estimate of
 *  people living with HIV or fewer than `PER_PERSON_MIN_PLHIV`. */
export const aidPerPerson = (country: Country): number | null =>
    country.plhiv === null || country.plhiv < PER_PERSON_MIN_PLHIV
        ? null
        : lastAid(country) / country.plhiv;

export type LedeFigures = {
    /** the US and Global Fund share of allocated money in the last year */
    usGfShare: number;
    /** countries that received more than $1m in the last year */
    over1m: number;
    /** of those, the countries where the Global Fund gave more than half */
    gfMajority: number;
    /** of those, the countries where the United States gave more than half */
    usMajority: number;
    /** of the US-majority countries, those with Global Fund multi-disease grants (`gfMultiFlag`) */
    usMajorityGfMulti: number;
    /** of the countries over $1m, those where the United States gave nothing */
    usNothing: number;
};

export const ledeFigures = (data: HivData): LedeFigures => {
    const allocated = lastShares(data.allocated);
    const funded = data.countries
        .filter((country) => lastAid(country) > LEDE_THRESHOLD)
        .map((country) => ({ country, shares: lastShares(country.aid) }));
    const usMajority = funded.filter(({ shares }) => shares.us > 0.5);

    return {
        usGfShare: allocated.us + allocated.globalFund,
        over1m: funded.length,
        gfMajority: funded.filter(({ shares }) => shares.globalFund > 0.5).length,
        usMajority: usMajority.length,
        usMajorityGfMulti: usMajority.filter(({ country }) => gfMultiFlag(country)).length,
        usNothing: funded.filter(({ shares }) => shares.us === 0).length,
    };
};
