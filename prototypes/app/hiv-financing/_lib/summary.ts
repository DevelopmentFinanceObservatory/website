// The figures behind the lede and the scope: totals, a scope's series, the lede's counts.
import type { Country, HivData, ProviderKey, ProviderSeries } from '../_data/types.ts';

import { PROVIDER_KEYS } from './providers.ts';

/** The year the page's last-year figures are for, the last of `HivData.years`. */
export const LAST_YEAR = 2024;

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

export const findCountry = (data: HivData, iso3: string): Country | undefined =>
    data.countries.find((country) => country.iso3 === iso3);

/**
 * The series the bars show: the money allocated to all countries for null, else the
 * country's own. An iso3 not in the data shows the all-countries series.
 */
export const scopeSeries = (data: HivData, iso3: string | null): ProviderSeries =>
    (iso3 === null ? undefined : findCountry(data, iso3))?.aid ?? data.allocated;

export type LedeFigures = {
    /** the US and Global Fund share of allocated money in the last year */
    usGfShare: number;
    /** countries that received more than $1m in the last year */
    over1m: number;
    /** of those, the countries where the US alone or the Global Fund alone gave more than half */
    oneProviderMajority: number;
};

export const ledeFigures = (data: HivData): LedeFigures => {
    const allocated = lastShares(data.allocated);
    const funded = data.countries.filter((country) => lastAid(country) > LEDE_THRESHOLD);
    const majority = funded.filter((country) => {
        const shares = lastShares(country.aid);

        return shares.us > 0.5 || shares.globalFund > 0.5;
    });

    return {
        usGfShare: allocated.us + allocated.globalFund,
        over1m: funded.length,
        oneProviderMajority: majority.length,
    };
};
