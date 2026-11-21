// The aid figures from DFO's analysis: the recipes the page runs on the aid reads, and the
// derivation of hiv.json's data from their rows. A port of `aid_recipes` and `aid_from_rows` in
// _data/fetch.py; aid.test.mts checks both against the trees and rows the step writes to
// _data/aid-fixture.json and the figures it writes to _data/hiv.json.
import { DatasetRef, recipe } from '@developmentfinance/client';

import type {
    HivData,
    Lender,
    OtherProvider,
    ProviderKey,
    ProviderSeries,
} from '../_data/types.ts';

import { pythonRound } from './unaids.ts';

import type { Recipe } from '#lib/liveRead.ts';
import { recordOf } from '#lib/record.ts';

const COUNTRY = 'country/';
const US = 'country/USA';
const GLOBAL_FUND = 'GlobalFund';
const PROVIDER = 'financingProvider';
const RECIPIENT = 'financingRecipient';
const PROVIDER_KEYS: readonly ProviderKey[] = ['us', 'globalFund', 'other'];
const MIN_AID = 1_000_000;

/** DFO's analysis frames mark a recipient country as a party and a region or no country as
 *  residual; the step checks that the parties are the `country/` recipients. */
const ALLOCATED = { financingRecipient_party_kind: 'party' };
const UNALLOCATED = { financingRecipient_party_kind: 'residual' };
/** The analysis frame holds the type of finance as its label, so the filter names the label. */
const LOANS = { crsTypeOfFinance: 'standard loan' };

/** The column each recipe's or read's rows hold their members in; a total holds none. */
const COLUMNS = {
    allocatedByProvider: PROVIDER,
    unallocatedByProvider: PROVIDER,
    allocatedByRecipient: RECIPIENT,
    usByRecipient: RECIPIENT,
    globalFundByRecipient: RECIPIENT,
    loans: PROVIDER,
    gf12250Total: null,
    gf12110Total: null,
    'gf-12250': RECIPIENT,
    'gf-12110': RECIPIENT,
} as const;

export type AidKey = keyof typeof COLUMNS;

/** The keys read as rows of a Global Fund ref; the rest are recipes on the aid reads. */
export const GF_KEYS = ['gf-12250', 'gf-12110'] as const;

export type RecipeKey = Exclude<AidKey, (typeof GF_KEYS)[number]>;

// Object.keys widens to string; these are the keys of COLUMNS.
export const AID_KEYS = Object.keys(COLUMNS) as AidKey[];

export const RECIPE_KEYS = AID_KEYS.filter(
    (key): key is RecipeKey => !(GF_KEYS as readonly string[]).includes(key),
);

/** One row of a recipe or read, as `Dataset.toRows()` gives it. */
export type AidRow = Readonly<Record<string, unknown>>;

/** The names the page prints, by code: each provider's, and each recipient country's. */
export type AidNames = {
    providers: Readonly<Record<string, string>>;
    recipients: Readonly<Record<string, string>>;
};

/** The aid reads the recipes start from, keyed as in live-refs.json. */
export type AidRefs = Record<'aid' | (typeof GF_KEYS)[number], DatasetRef>;

/** Why the rows gave no figures. */
export type AidRowsErrorCode =
    | 'aid_unreadable_row'
    | 'aid_repeated_row'
    | 'aid_wrong_unit'
    | 'aid_not_a_country'
    | 'aid_unnamed';

/** The rows break what `aidFromRows` assumes, so the page keeps its committed figures. */
export class AidRowsError extends Error {
    readonly code: AidRowsErrorCode;

    constructor(code: AidRowsErrorCode, message: string) {
        super(message);
        this.name = 'AidRowsError';
        this.code = code;
    }
}

/**
 * The recipes behind the aid figures, on the versions `refs` name, over `window`: totals by
 * provider for countries and for regions or no country, totals by recipient country for all
 * providers, the United States and the Global Fund, the ODA lenders ranked over the window,
 * and the Global Fund's 12250 and 12110 totals to countries.
 */
export const aidRecipes = (
    refs: AidRefs,
    window: readonly [number, number],
): Record<RecipeKey, Recipe> => {
    const aid = () => recipe(refs.aid);

    return {
        allocatedByProvider: aid().filter({ keep: ALLOCATED }).aggregate({ by: 'origin' }),
        unallocatedByProvider: aid().filter({ keep: UNALLOCATED }).aggregate({ by: 'origin' }),
        allocatedByRecipient: aid().filter({ keep: ALLOCATED }).aggregate({ by: 'destination' }),
        usByRecipient: aid()
            .filter({ keep: { origin: US, ...ALLOCATED } })
            .aggregate({ by: 'destination' }),
        globalFundByRecipient: aid()
            .filter({ keep: { origin: GLOBAL_FUND, ...ALLOCATED } })
            .aggregate({ by: 'destination' }),
        loans: aid()
            .filter({ keep: { ...LOANS, ...ALLOCATED } })
            .rank({ by: 'origin', window, how: 'sum', limit: 1000 }),
        gf12250Total: recipe(refs['gf-12250']).filter({ keep: ALLOCATED }).aggregate(),
        gf12110Total: recipe(refs['gf-12110']).filter({ keep: ALLOCATED }).aggregate(),
    };
};

const providerKey = (code: string): ProviderKey => {
    if (code === US) {
        return 'us';
    }

    return code === GLOBAL_FUND ? 'globalFund' : 'other';
};

/** Rounds to the dollar as Python's `round` does, with no negative zero. */
const dollars = (value: number) => pythonRound(value) + 0;

/** Orders strings by code point, as Python's `sorted` does. */
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const yearOf = (key: AidKey, period: unknown): number => {
    const year = Number(period);

    if (!Number.isInteger(year)) {
        throw new AidRowsError('aid_unreadable_row', `${key}: a row for ${String(period)}`);
    }

    return year;
};

const valueOf = (key: AidKey, row: AidRow): number => {
    const { value } = row;

    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new AidRowsError('aid_unreadable_row', `${key}: a row with value ${String(value)}`);
    }

    return value;
};

/** A recipe's or read's values by member and year; a total's member is "". */
const byCode = (key: AidKey, rows: readonly AidRow[]): Map<string, Map<number, number>> => {
    const column = COLUMNS[key];
    const found = new Map<string, Map<number, number>>();

    for (const row of rows) {
        const code = column === null ? '' : String(row[column]);
        const year = yearOf(key, row.time_period);
        const values = found.get(code) ?? new Map<number, number>();

        if (values.has(year)) {
            throw new AidRowsError(
                'aid_repeated_row',
                `${key}: more than one row for ${code} ${year}`,
            );
        }

        values.set(year, valueOf(key, row));
        found.set(code, values);
    }

    return found;
};

const checkUnits = (rows: Record<AidKey, readonly AidRow[]>, priceBase: number) => {
    for (const key of AID_KEYS) {
        for (const row of rows[key]) {
            let read: unknown[];

            if ((GF_KEYS as readonly string[]).includes(key)) {
                read = [row.currency, row.price_basis, Number(row.base_year)];
            } else {
                const unit = JSON.parse(String(row.unit)) as Record<string, unknown>;

                read = [unit.currency, unit.prices, unit.base_year];
            }

            if (read[0] !== 'USD' || read[1] !== 'constant' || read[2] !== priceBase) {
                throw new AidRowsError(
                    'aid_wrong_unit',
                    `${key}: expected constant ${priceBase} US dollars, read ${read.join(' ')}`,
                );
            }
        }
    }
};

const nameOf = (names: Readonly<Record<string, string>>, code: string): string => {
    const name = names[code];

    if (name === undefined) {
        throw new AidRowsError('aid_unnamed', `names.json has no name for ${code}`);
    }

    return name;
};

const at = (by: Map<string, Map<number, number>>, code: string, year: number) =>
    by.get(code)?.get(year) ?? 0;

const sortedCodes = (by: Map<string, unknown>) => [...by.keys()].sort(byCodePoint);

/** Money by provider key and year, summed over each key's providers in code order. */
const keyed = (by: Map<string, Map<number, number>>, years: readonly number[]): ProviderSeries => {
    const codes = sortedCodes(by);
    const series = (key: ProviderKey) =>
        years.map((year) =>
            dollars(
                codes
                    .filter((code) => providerKey(code) === key)
                    .reduce((sum, code) => sum + at(by, code, year), 0),
            ),
        );

    return { us: series('us'), globalFund: series('globalFund'), other: series('other') };
};

const otherProviders = (
    allocated: Map<string, Map<number, number>>,
    names: Readonly<Record<string, string>>,
    years: readonly number[],
): OtherProvider[] => {
    const [firstYear, lastYear] = [years[0]!, years.at(-1)!];
    const found: OtherProvider[] = [];

    for (const code of allocated.keys()) {
        const first = dollars(at(allocated, code, firstYear));
        const last = dollars(at(allocated, code, lastYear));

        if (providerKey(code) === 'other' && Math.max(first, last) >= MIN_AID) {
            found.push({ name: nameOf(names, code), first, last });
        }
    }

    return found.sort((a, b) => byCodePoint(a.name, b.name)).sort((a, b) => b.first - a.first);
};

const loans = (
    rows: readonly AidRow[],
    names: Readonly<Record<string, string>>,
): { total: number; lenders: Lender[] } => {
    const lenders = rows
        .map((row) => ({
            name: nameOf(names, String(row[PROVIDER])),
            value: valueOf('loans', row),
        }))
        .sort((a, b) => b.value - a.value || byCodePoint(a.name, b.name));

    if (new Set(lenders.map(({ name }) => name)).size !== lenders.length) {
        throw new AidRowsError('aid_repeated_row', 'loans: more than one row for a lender');
    }

    return {
        total: dollars(lenders.reduce((sum, { value }) => sum + value, 0)),
        lenders: lenders.map(({ name, value }) => ({ name, value: dollars(value) })),
    };
};

/**
 * hiv.json's data from the rows of the aid recipes and the Global Fund reads, as `aid_from_rows`
 * in fetch.py gives it. Each provider counts as the United States, the Global Fund or other by
 * its code. A country is kept when its last-year aid rounds above zero; countries come in
 * descending order of last-year aid, a tie in code order.
 *
 * @throws {AidRowsError} A row in another unit, a second row for a member and year, a row it
 *   cannot read, a recipient that is not a country, or a printed name `names` lacks.
 */
export const aidFromRows = (
    rows: Record<AidKey, readonly AidRow[]>,
    { years, priceBase, names }: { years: readonly number[]; priceBase: number; names: AidNames },
): HivData => {
    const lastYear = years.at(-1);

    if (lastYear === undefined) {
        throw new Error('no years');
    }

    checkUnits(rows, priceBase);

    const allocated = byCode('allocatedByProvider', rows.allocatedByProvider);
    const totals = byCode('allocatedByRecipient', rows.allocatedByRecipient);
    const us = byCode('usByRecipient', rows.usByRecipient);
    const globalFund = byCode('globalFundByRecipient', rows.globalFundByRecipient);
    const multi = new Map<string, Map<number, number>>();

    for (const key of GF_KEYS) {
        for (const [code, values] of byCode(key, rows[key])) {
            if (!code.startsWith(COUNTRY)) {
                continue;
            }

            const summed = multi.get(code) ?? new Map<number, number>();

            for (const [year, value] of values) {
                summed.set(year, (summed.get(year) ?? 0) + value);
            }

            multi.set(code, summed);
        }
    }

    const countries = sortedCodes(totals).flatMap((code) => {
        if (!code.startsWith(COUNTRY)) {
            throw new AidRowsError(
                'aid_not_a_country',
                `allocatedByRecipient holds ${code}, which is not a country`,
            );
        }

        const aid: ProviderSeries = {
            us: years.map((year) => dollars(at(us, code, year))),
            globalFund: years.map((year) => dollars(at(globalFund, code, year))),
            other: years.map((year) =>
                dollars(at(totals, code, year) - at(us, code, year) - at(globalFund, code, year)),
            ),
        };

        if (PROVIDER_KEYS.reduce((sum, key) => sum + aid[key].at(-1)!, 0) <= 0) {
            return [];
        }

        return [
            {
                iso3: code.slice(COUNTRY.length),
                name: nameOf(names.recipients, code),
                aid,
                globalFundMulti: years.map((year) => dollars(at(multi, code, year))),
            },
        ];
    });
    const lastAid = (country: (typeof countries)[number]) =>
        PROVIDER_KEYS.reduce((sum, key) => sum + country.aid[key].at(-1)!, 0);
    const [early, late] = [
        byCode('gf12250Total', rows.gf12250Total),
        byCode('gf12110Total', rows.gf12110Total),
    ];

    return {
        years: [...years],
        priceBase,
        allocated: keyed(allocated, years),
        unallocated: keyed(byCode('unallocatedByProvider', rows.unallocatedByProvider), years),
        globalFundMulti: years.map((year) => dollars(at(early, '', year) + at(late, '', year))),
        otherProviders: otherProviders(allocated, names.providers, years),
        loans: loans(rows.loans, names.providers),
        recipients: [...totals.values()].filter((values) => dollars(values.get(lastYear) ?? 0) > 0)
            .length,
        countries: countries.sort((a, b) => lastAid(b) - lastAid(a)),
    };
};

/** The recipes and the Global Fund refs the page reads, from live-refs.json's parsed refs. */
export const aidSources = (
    refs: Record<'aid' | (typeof GF_KEYS)[number], unknown>,
    window: readonly [number, number],
) => {
    const recipes = aidRecipes(
        {
            aid: DatasetRef.fromJSON(refs.aid),
            'gf-12250': DatasetRef.fromJSON(refs['gf-12250']),
            'gf-12110': DatasetRef.fromJSON(refs['gf-12110']),
        },
        window,
    );

    return {
        ...recordOf(RECIPE_KEYS, (key) => ({ recipe: recipes[key] })),
        'gf-12250': { ref: refs['gf-12250'] },
        'gf-12110': { ref: refs['gf-12110'] },
    };
};
