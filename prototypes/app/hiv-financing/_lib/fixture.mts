// Fixtures shared by the _lib tests: a small HivData over two years, built so each country
// exercises one rule. Money is in US dollars.
import type { Country, HivData, ProviderSeries } from '../_data/types.ts';

export const YEARS = [2015, 2024];

const series = (us: number[], globalFund: number[], other: number[]): ProviderSeries => ({
    us,
    globalFund,
    other,
});

export const country = (overrides: Partial<Country> = {}): Country => ({
    iso3: 'AAA',
    name: 'Alpha',
    aid: series([0, 0], [0, 0], [0, 0]),
    plhiv: null,
    art: null,
    deaths: [null, null],
    ...overrides,
});

/** $304m in 2024: 66% US, 33% Global Fund, 1% others; $217 per person; deaths fell. */
export const KENYA = country({
    iso3: 'KEN',
    name: 'Kenya',
    aid: series([300e6, 200e6], [50e6, 100e6], [10e6, 4e6]),
    plhiv: 1_400_000,
    art: 87.3,
    deaths: [36_420, 20_810],
});

/** $90m, a Global Fund majority; an accented name; no ART figure; no 2015 deaths. */
export const IVORY_COAST = country({
    iso3: 'CIV',
    name: "Côte d'Ivoire",
    aid: series([100e6, 40e6], [20e6, 50e6], [5e6, 0]),
    plhiv: 200_000,
    deaths: [null, 9_000],
    art: null,
});

/** $9m, a majority from all other providers (56%), so no single US or Global Fund
 *  majority; deaths that round to the same hundred. */
export const DR_CONGO = country({
    iso3: 'COD',
    name: 'DR Congo',
    aid: series([10e6, 2e6], [30e6, 2e6], [1e6, 5e6]),
    plhiv: 500_000,
    art: 60.4,
    deaths: [15_000, 15_040],
});

/** $900k, under the lede's $1m, and under the strip's 50,000 people. */
export const CONGO = country({
    iso3: 'COG',
    name: 'Republic of the Congo',
    aid: series([0, 600e3], [0, 300e3], [0, 0]),
    plhiv: 40_000,
    art: 41,
    deaths: [1_000, 1_200],
});

/** No aid in 2024, so off the strip, and a sentence with no money mix. */
export const MEXICO = country({
    iso3: 'MEX',
    name: 'Mexico',
    aid: series([2e6, 0], [0, 0], [1e6, 0]),
    plhiv: 300_000,
    art: 70,
    deaths: [4_000, 4_000],
});

/** $52m, a US majority, with no UNAIDS figures at all. */
export const UKRAINE = country({
    iso3: 'UKR',
    name: 'Ukraine',
    aid: series([5e6, 30e6], [10e6, 20e6], [1e6, 2e6]),
});

export const COUNTRIES = [KENYA, IVORY_COAST, UKRAINE, DR_CONGO, CONGO, MEXICO];

export const DATA: HivData = {
    years: YEARS,
    // $6.447bn in 2024, of which the US and the Global Fund gave $6.4bn (99%).
    allocated: series([1e9, 4e9], [1e9, 2.4e9], [342e6, 47e6]),
    // $4.24bn in 2024.
    unallocated: series([500e6, 4.1e9], [0, 100e6], [40e6, 40e6]),
    recipients: 96,
    countries: COUNTRIES,
};
