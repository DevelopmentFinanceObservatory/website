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
    /** Global Fund disbursements to the country under codes 12110 and 12250, one per year of
     *  `HivData.years`, 0 where none is recorded. These multi-disease grants carry HIV money
     *  together with TB, malaria and health-system money, so only part of each is for HIV. */
    globalFundMulti: number[];
};

/** A provider inside "all other providers", with its money to countries in the first and
 *  last years. */
export type OtherProvider = { name: string; first: number; last: number };

/** A lender of ODA loans under code 13040 to countries, with its total over the years. */
export type Lender = { name: string; value: number };

export type HivData = {
    /** the years every series covers, ascending, 2015 to 2024 */
    years: number[];
    /** money the CRS assigns to a recipient country, summed over every such country,
     *  including those left out of `countries` */
    allocated: ProviderSeries;
    /** money for regions or for no country */
    unallocated: ProviderSeries;
    /** Global Fund disbursements to countries under codes 12110 and 12250, summed over every
     *  recipient country, one per year */
    globalFundMulti: number[];
    /** the providers inside "all other providers" that gave $1m or more to countries in the
     *  first or last year, in descending order of first-year money */
    otherProviders: OtherProvider[];
    /** ODA loans inside the money to countries over all the years: the total, and each lender
     *  in descending order of value */
    loans: { total: number; lenders: Lender[] };
    /** the number of countries that received any HIV aid in the last year */
    recipients: number;
    /** countries the CRS records as HIV aid recipients in any year, that received more than
     *  $1m in the last year or have 50,000 or more people living with HIV, in descending
     *  order of last-year aid */
    countries: Country[];
};
