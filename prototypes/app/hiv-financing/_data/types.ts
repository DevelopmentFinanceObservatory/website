// The shape of _data/hiv.json's `data`, written by fetch.py and read by the page's
// components with `import type`. Money is gross ODA disbursements from the OECD CRS
// under purpose code 13040, in current US dollars rounded to the dollar.

/** The three providers the page separates. The Global Fund counts as a provider, so
 *  donors' contributions to it are counted under the Global Fund. */
export type ProviderKey = 'us' | 'globalFund' | 'other';

/** Money by provider, one value per year of `HivData.years`, 0 where none is recorded. */
export type ProviderSeries = Record<ProviderKey, number[]>;

/** One recipient country. */
export type Country = {
    iso3: string;
    /** the name the page prints, such as "Côte d'Ivoire" or "DR Congo" */
    name: string;
    aid: ProviderSeries;
    /** UNAIDS estimate of people living with HIV in the last year; null where none is held */
    plhiv: number | null;
    /** UNAIDS antiretroviral therapy coverage in the last year, as a percentage; null where none is held */
    art: number | null;
    /** UNAIDS estimate of AIDS-related deaths, one per year of `HivData.years`; null where none is held */
    deaths: (number | null)[];
};

export type HivData = {
    /** the years every series covers, ascending, 2015 to 2024 */
    years: number[];
    /** money the CRS assigns to a recipient country, summed over every such country,
     *  including those left out of `countries` */
    allocated: ProviderSeries;
    /** money for regions or for no country */
    unallocated: ProviderSeries;
    /** the number of countries that received any HIV aid in the last year */
    recipients: number;
    /** countries the CRS records as HIV aid recipients in any year, that received $1m or
     *  more in the last year or have 50,000 or more people living with HIV, in descending
     *  order of last-year aid */
    countries: Country[];
};
