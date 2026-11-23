// The aid figures from DFO's analysis: the recipes the page runs on the aid reads, the names it
// prints from the aid read's labels, and the derivation of the figures from the recipes' rows.
// The build runs them (./figures.ts), and fails when the rows break what they assume.
import { DatasetRef, recipe } from '@developmentfinance/client';

import type {
    HivData,
    Lender,
    OtherProvider,
    ProviderKey,
    ProviderSeries,
} from '../_data/types.ts';

import type { Recipe } from '#lib/liveRead.ts';
import { recordOf } from '#lib/record.ts';
import { pythonRound } from '#lib/round.ts';

const COUNTRY = 'country/';
const US = 'country/USA';
const GLOBAL_FUND = 'GlobalFund';
const PROVIDER = 'financingProvider';
const RECIPIENT = 'financingRecipient';
const PROVIDER_KEYS: readonly ProviderKey[] = ['us', 'globalFund', 'other'];
const MIN_AID = 1_000_000;

/** The years every series covers. */
export const YEARS: readonly number[] = Array.from({ length: 10 }, (_, index) => 2015 + index);

/** The base year of the constant US dollars the aid reads are in. */
export const PRICE_BASE = 2024;

/** The names the page prints for these recipient countries, by ISO code, where the aid read's
 *  label is dated or clumsy. */
export const NAME_OVERRIDES: Readonly<Record<string, string>> = {
    CHN: 'China',
    CIV: "Côte d'Ivoire",
    COD: 'DR Congo',
    MMR: 'Myanmar',
    SWZ: 'Eswatini',
    TUR: 'Türkiye',
};
/** The lede says the United States and the Global Fund disbursed almost all HIV aid recorded
 *  for countries in the last year. */
const ALMOST_ALL = 0.95;
/** How to interpret says the Global Fund recorded its multi-disease grants mostly under 12250
 *  to 2019 and mostly under 12110 from this year. */
const GF_SWITCH_YEAR = 2020;

/** DFO's analysis frames mark a recipient country as a party and a region or no country as
 *  residual. The step checks that the parties are the `country/` recipients. */
const ALLOCATED = { financingRecipient_party_kind: 'party' };
const UNALLOCATED = { financingRecipient_party_kind: 'residual' };
/** The analysis frame holds the type of finance as its label, so the filter names the label. */
const LOANS = { crsTypeOfFinance: 'standard loan' };

/** The column each recipe's or read's rows hold their members in. A total holds none. */
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

// Object.keys widens to string. These are the keys of COLUMNS.
export const AID_KEYS = Object.keys(COLUMNS) as AidKey[];

export const RECIPE_KEYS = AID_KEYS.filter(
    (key): key is RecipeKey => !(GF_KEYS as readonly string[]).includes(key),
);

/** One row of a recipe or read, as `Dataset.toRows()` gives it. */
export type AidRow = Readonly<Record<string, unknown>>;

/** The names the page prints, by code: each provider's, and each recipient country's
 *  (`aidNames`). */
export type AidNames = {
    providers: Readonly<Record<string, string>>;
    recipients: Readonly<Record<string, string>>;
};

/** The aid reads the recipes start from, keyed as in _data/live-refs.json. */
export type AidRefs = Record<'aid' | (typeof GF_KEYS)[number], DatasetRef>;

/** Why the rows gave no figures. */
export type AidRowsErrorCode =
    | 'aid_unreadable_row'
    | 'aid_repeated_row'
    | 'aid_wrong_unit'
    | 'aid_not_a_country'
    | 'aid_unnamed'
    | 'aid_unlabelled'
    | 'aid_two_labels'
    | 'aid_checks_failed';

/**
 * A rule the figures break:
 *
 * - `aid_countries_off_allocated`: in the last year, the countries of a provider key sum to
 *   more than a dollar per country away from its allocated total;
 * - `aid_year_without_money`: a provider key gives countries nothing in some year;
 * - `aid_share_below_lede`: the United States and the Global Fund give less than
 *   `ALMOST_ALL` of the last year's money to countries, which the lede says they give;
 * - `aid_gf_switch_moved`: 12110 leads before `GF_SWITCH_YEAR`, or 12250 from it, against
 *   How to interpret;
 * - `aid_no_other_providers`: no other provider gives $1m in the first or last year;
 * - `aid_countries_not_recipients`: the countries kept differ in number from the recipients;
 * - `aid_parties_not_countries`: DFO's recipient parties are not the aid read's recipient
 *   countries, as when a country recipient is marked residual and its money counted as
 *   unallocated.
 */
export type AidCheck =
    | 'aid_countries_off_allocated'
    | 'aid_year_without_money'
    | 'aid_share_below_lede'
    | 'aid_gf_switch_moved'
    | 'aid_no_other_providers'
    | 'aid_countries_not_recipients'
    | 'aid_parties_not_countries';

/** The rows break what `aidNames` or `aidFromRows` assumes, so the build stops. With the code
 *  `aid_checks_failed`, `checks` names each rule the figures break. */
export class AidRowsError extends Error {
    readonly code: AidRowsErrorCode;
    readonly checks: readonly AidCheck[];

    constructor(code: AidRowsErrorCode, message: string, checks: readonly AidCheck[] = []) {
        super(message);
        this.name = 'AidRowsError';
        this.code = code;
        this.checks = checks;
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

/** A recipe's or read's values by member and year. A total's member is "". */
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
        throw new AidRowsError('aid_unnamed', `the aid read names no ${code}`);
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

const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    a.size === b.size && [...a].every((code) => b.has(code));

/** Each rule of `AidCheck` that `data` breaks; empty when all hold. */
const aidProblems = (
    data: HivData,
    {
        parties,
        countries,
        early,
        late,
    }: {
        parties: ReadonlySet<string>;
        countries: ReadonlySet<string>;
        early: Map<number, number>;
        late: Map<number, number>;
    },
): AidCheck[] => {
    const { allocated } = data;
    const last = (key: ProviderKey) => allocated[key].at(-1)!;
    const total = PROVIDER_KEYS.reduce((sum, key) => sum + last(key), 0);
    const share = (last('us') + last('globalFund')) / total;
    const problems: [AidCheck, boolean][] = [
        [
            'aid_countries_off_allocated',
            PROVIDER_KEYS.some(
                (key) =>
                    Math.abs(
                        data.countries.reduce((sum, country) => sum + country.aid[key].at(-1)!, 0) -
                            last(key),
                    ) > data.countries.length,
            ),
        ],
        [
            'aid_year_without_money',
            PROVIDER_KEYS.some((key) => allocated[key].some((value) => value <= 0)),
        ],
        // A total of zero gives no share, which fails too.
        ['aid_share_below_lede', !(share >= ALMOST_ALL)],
        [
            'aid_gf_switch_moved',
            data.years.some((year) => {
                const [twelve250, twelve110] = [early.get(year) ?? 0, late.get(year) ?? 0];

                return year < GF_SWITCH_YEAR ? twelve250 < twelve110 : twelve110 < twelve250;
            }),
        ],
        ['aid_no_other_providers', data.otherProviders.length === 0],
        ['aid_countries_not_recipients', data.countries.length !== data.recipients],
        ['aid_parties_not_countries', !same(parties, countries)],
    ];

    return problems.filter(([, broken]) => broken).map(([check]) => check);
};

/** Each code of `column` in the aid read's rows with its label, refusing a code whose label
 *  is missing, where `labelled` says it needs one, or that has two labels. */
const labelsOf = (
    rows: readonly AidRow[],
    column: typeof PROVIDER | typeof RECIPIENT,
    labelled: (code: string) => boolean,
): Map<string, string> => {
    const found = new Map<string, string>();

    for (const row of rows) {
        const code = row[column];

        if (code === null || code === undefined) {
            continue;
        }

        const label = row[`${column}_label`];

        if (typeof label !== 'string' || label === '') {
            if (labelled(String(code))) {
                throw new AidRowsError('aid_unlabelled', `${column} ${String(code)} has no label`);
            }

            continue;
        }

        const held = found.get(String(code));

        if (held !== undefined && held !== label) {
            throw new AidRowsError(
                'aid_two_labels',
                `${column} ${String(code)} has two labels, ${held} and ${label}`,
            );
        }

        found.set(String(code), label);
    }

    return found;
};

/**
 * The names the page prints, from the rows of the aid read: each provider's label, and each
 * recipient country's label or its name in `NAME_OVERRIDES`. Regions and other recipients that
 * are not countries are left out. Codes come in code-point order.
 *
 * @throws {AidRowsError} A provider or recipient country without a label (`aid_unlabelled`),
 *   or a code with two labels (`aid_two_labels`).
 */
export const aidNames = (rows: readonly AidRow[]): AidNames => {
    const isCountry = (code: string) => code.startsWith(COUNTRY);
    const sorted = (labels: Map<string, string>) =>
        [...labels].sort(([a], [b]) => byCodePoint(a, b));

    return {
        providers: Object.fromEntries(sorted(labelsOf(rows, PROVIDER, () => true))),
        recipients: Object.fromEntries(
            sorted(labelsOf(rows, RECIPIENT, isCountry))
                .filter(([code]) => isCountry(code))
                .map(([code, label]) => [
                    code,
                    NAME_OVERRIDES[code.slice(COUNTRY.length)] ?? label,
                ]),
        ),
    };
};

/**
 * The aid figures from the rows of the aid recipes and the Global Fund reads. Each provider counts as the United States, the Global Fund or other by
 * its code. A country is kept when its last-year aid rounds above zero. Countries come in
 * descending order of last-year aid, a tie in code order. The figures must pass every
 * `AidCheck`.
 *
 * @throws {AidRowsError} A row in another unit, a second row for a member and year, a row it
 *   cannot read, a recipient that is not a country, a printed name `names` lacks, or figures
 *   that break a check (`aid_checks_failed`, naming each in `checks`).
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

    const data: HivData = {
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
    const broken = aidProblems(data, {
        parties: new Set(totals.keys()),
        countries: new Set(Object.keys(names.recipients)),
        early: early.get('') ?? new Map(),
        late: late.get('') ?? new Map(),
    });

    if (broken.length > 0) {
        throw new AidRowsError(
            'aid_checks_failed',
            `The figures break the page's checks: ${broken.join(', ')}`,
            broken,
        );
    }

    return data;
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
