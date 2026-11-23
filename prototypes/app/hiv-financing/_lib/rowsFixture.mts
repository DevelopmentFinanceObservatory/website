// Rows shared by the aid and figures tests, in the columns DFO's answers carry: two recipient
// countries over YEARS, Kenya and Côte d'Ivoire (whose label NAME_OVERRIDES replaces), with
// United States, Global Fund and United Kingdom aid, one ODA lender, and money for a region.
// They pass every AidCheck, and AID_DATA is what `aidFromRows` gives for them. Money is in
// constant 2024 US dollars.
import type { HivData, ProviderSeries } from '../_data/types.ts';

import { type AidKey, type AidRow, PRICE_BASE, YEARS } from './aid.ts';

const UNIT = JSON.stringify({
    base_year: PRICE_BASE,
    currency: 'USD',
    deflation_basis: 'donor',
    prices: 'constant',
});
const GF_UNIT = { currency: 'USD', price_basis: 'constant', base_year: PRICE_BASE };
const US = 'country/USA';
const GF = 'GlobalFund';
const GBR = 'country/GBR';
const IDA = 'InternationalDevelopmentAssociation';
const KEN = 'country/KEN';
const CIV = 'country/CIV';
const REGION = 'DACAfricaUnallocated';
/** The Global Fund recorded its multi-disease grants under 12250 before this year. */
const SWITCH = 2020;

const every = (value: number) => YEARS.map(() => value);
const split = (before: number, from: number) =>
    YEARS.map((year) => (year < SWITCH ? before : from));

/** A recipe's rows: one per member and year, or per year for a total (`member` null). */
const recipeRows = (column: string | null, values: Record<string, readonly number[]>): AidRow[] =>
    Object.entries(values).flatMap(([member, series]) =>
        YEARS.map((year, index) => ({
            ...(column === null ? {} : { [column]: member }),
            time_period: String(year),
            value: series[index],
            unit: UNIT,
        })),
    );

/** A Global Fund read's rows, one per recipient and year. */
const gfRows = (values: Record<string, readonly number[]>): AidRow[] =>
    Object.entries(values).flatMap(([recipient, series]) =>
        YEARS.map((year, index) => ({
            financingRecipient: recipient,
            financingProvider: GF,
            time_period: year,
            value: series[index],
            ...GF_UNIT,
        })),
    );

const provider = 'financingProvider';
const recipient = 'financingRecipient';

/** The aid read's rows, one per provider and recipient, with their labels. */
export const AID_READ_ROWS: AidRow[] = [
    [US, 'United States', KEN, 'Kenya'],
    [GF, 'Global Fund', KEN, 'Kenya'],
    [GBR, 'United Kingdom', KEN, 'Kenya'],
    [IDA, 'International Development Association', KEN, 'Kenya'],
    [US, 'United States', CIV, "Cote d'Ivoire"],
    [GF, 'Global Fund', CIV, "Cote d'Ivoire"],
    [US, 'United States', REGION, 'Africa, regional'],
].map(([code, label, place, placeLabel]) => ({
    [provider]: code,
    [`${provider}_label`]: label,
    [recipient]: place,
    [`${recipient}_label`]: placeLabel,
    time_period: 2024,
    value: 1,
}));

/** The rows of each aid recipe and Global Fund read. */
export const aidRows = (): Record<AidKey, AidRow[]> => ({
    allocatedByProvider: recipeRows(provider, {
        [US]: every(80e6),
        [GF]: every(55e6),
        [GBR]: every(3e6),
    }),
    unallocatedByProvider: recipeRows(provider, { [US]: every(5e6), [GBR]: every(1e6) }),
    allocatedByRecipient: recipeRows(recipient, { [KEN]: every(93e6), [CIV]: every(45e6) }),
    usByRecipient: recipeRows(recipient, { [KEN]: every(60e6), [CIV]: every(20e6) }),
    globalFundByRecipient: recipeRows(recipient, { [KEN]: every(30e6), [CIV]: every(25e6) }),
    loans: [{ [provider]: IDA, time_period: '2015/2024', value: 4e6, unit: UNIT }],
    gf12250Total: recipeRows(null, { '': split(40e6, 1e6) }),
    gf12110Total: recipeRows(null, { '': split(2e6, 30e6) }),
    'gf-12250': gfRows({ [KEN]: split(40e6, 1e6), [REGION]: every(5e6) }),
    'gf-12110': gfRows({ [KEN]: split(2e6, 30e6) }),
});

const series = (us: number[], globalFund: number[], other: number[]): ProviderSeries => ({
    us,
    globalFund,
    other,
});

/** What `aidFromRows` gives for `aidRows()` with the names `aidNames` gives for
 *  AID_READ_ROWS. */
export const AID_DATA: HivData = {
    years: [...YEARS],
    priceBase: PRICE_BASE,
    allocated: series(every(80e6), every(55e6), every(3e6)),
    unallocated: series(every(5e6), every(0), every(1e6)),
    globalFundMulti: split(42e6, 31e6),
    otherProviders: [{ name: 'United Kingdom', first: 3e6, last: 3e6 }],
    loans: { total: 4e6, lenders: [{ name: 'International Development Association', value: 4e6 }] },
    recipients: 2,
    countries: [
        {
            iso3: 'KEN',
            name: 'Kenya',
            aid: series(every(60e6), every(30e6), every(3e6)),
            globalFundMulti: split(42e6, 31e6),
        },
        {
            iso3: 'CIV',
            name: "Côte d'Ivoire",
            aid: series(every(20e6), every(25e6), every(0)),
            globalFundMulti: every(0),
        },
    ],
};
