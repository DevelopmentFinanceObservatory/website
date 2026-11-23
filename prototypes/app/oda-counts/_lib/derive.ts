// The page's figures from the rows of its 19 reads of DAC1, which the build takes at DFO's newest
// stored versions (_lib/build.ts). It refuses rows that break a rule the figures rest on, which
// fails the build.
import type { Row } from '@developmentfinance/client/types';

import type { ByYear, CountsData, Donor, Prices, SeriesKey } from '../_data/types.ts';

import { recordOf } from '#lib/record.ts';

/** The monetary series, in the order the page lists them. */
export const MONETARY: readonly SeriesKey[] = [
    'gross',
    'net',
    'grantEquivalent',
    'commitments',
    'headline',
    'bilateral',
    'multilateral',
    'refugeeCosts',
    'grossNonGrants',
];

/** A key of refs.json and live-refs.json: a series in one price basis, or the ODA/GNI ratio. */
export type ReadKey = `${SeriesKey}/${Prices}` | 'odaGni/ratio';

export const READ_KEYS: readonly ReadKey[] = [
    ...MONETARY.flatMap((key) => [`${key}/current`, `${key}/constant`] as const),
    'odaGni/ratio',
];

/** The years the page shows, which the refs' requested window covers. */
export const YEARS: readonly number[] = Array.from({ length: 11 }, (_, index) => 2015 + index);

/** The year the constant-price refs express prices in. */
export const BASE_YEAR = 2024;

/** The first year the OECD counts grant equivalents. Group totals before it sum only the
 *  members that reported them early. */
const GRANT_EQUIVALENT_FROM = 2018;

/** Group totals that repeat a provider's own figures, and the provider they repeat. The EU
 *  institutions are the only multilateral that reports to DAC1. */
const DUPLICATES: Readonly<Record<string, string>> = {
    DACMultilaterals: 'EuropeanUnionInstitutions',
};

/** Plain names for group totals whose DFO label reads badly on the page. */
const GROUP_NAMES: Readonly<Record<string, string>> = {
    DACNonDACCountries: 'Non-DAC countries reporting to the DAC',
};

/** Providers whose group flag the rows must reproduce: a group total and a country. */
const KNOWN_KINDS: Readonly<Record<string, boolean>> = {
    DACCountriesTotal: true,
    'country/FRA': false,
};

/** Values in current US dollars the rows must reproduce within `KNOWN_TOLERANCE`. Each is in a
 *  closed year, which the OECD no longer revises, so a routine release cannot fail the build. */
const KNOWN: readonly { provider: string; key: SeriesKey; year: number; value: number }[] = [
    { provider: 'country/FRA', key: 'grantEquivalent', year: 2024, value: 15.448e9 },
];

const KNOWN_TOLERANCE = 0.005;

/** A read's values by provider, then year. */
type Values = Map<string, Map<number, number>>;

type About = { name: string; isGroup: boolean };

/** A string of decimal digits plus one, which can gain a digit, as `999` gives `1000`. */
const increment = (digits: string): string => {
    const last = digits.length - 1;

    if (last < 0) {
        return '1';
    }

    return digits[last] === '9'
        ? `${increment(digits.slice(0, last))}0`
        : `${digits.slice(0, last)}${Number(digits[last]) + 1}`;
};

/**
 * `x` rounded to `digits` decimals as Python's `round` does: the decimal nearest the double's
 * exact value, an exact tie going to the even digit. `toFixed(100)` prints that exact value for
 * any figure the page holds, and its own rounding breaks ties away from zero.
 */
export const roundHalfEven = (x: number, digits: number): number => {
    const [whole = '0', fraction = ''] = Math.abs(x).toFixed(100).split('.');
    const kept = `${whole}${fraction.slice(0, digits)}`;
    const next = fraction[digits] ?? '0';
    const rest = fraction.slice(digits + 1);
    const tie = next === '5' && /^0*$/.test(rest);
    const up = next > '5' || (next === '5' && !tie) || (tie && Number(kept.at(-1)) % 2 === 1);
    const scaled = up ? increment(kept) : kept;
    const padded = scaled.padStart(digits + 1, '0');
    const text = `${padded.slice(0, padded.length - digits)}.${padded.slice(padded.length - digits)}`;

    return Number(`${x < 0 || Object.is(x, -0) ? '-' : ''}${text}`);
};

/** A read's values, and each provider's name and group flag from its last row. Rows without a
 *  value are skipped. */
const valuesOf = (
    key: ReadKey,
    rows: readonly Row[],
): { values: Values; providers: Map<string, About> } => {
    const prices = key.split('/')[1];
    const values: Values = new Map();
    const providers = new Map<string, About>();
    const bases = new Set<unknown>();

    for (const row of rows) {
        if (row.value === null || row.value === undefined || Number.isNaN(Number(row.value))) {
            continue;
        }

        const provider = String(row.financingProvider);
        const year = Number(row.time_period);
        const byYear = values.get(provider) ?? new Map<number, number>();

        if (byYear.has(year)) {
            throw new Error(`${key}: several rows for ${provider} in ${year}.`);
        }

        bases.add(row.price_basis);
        byYear.set(year, Number(row.value));
        values.set(provider, byYear);
        providers.set(provider, {
            name: GROUP_NAMES[provider] ?? String(row.financingProvider_label),
            isGroup: row.financingProvider_kind === 'total',
        });
    }

    if (prices !== 'ratio' && (bases.size !== 1 || !bases.has(prices))) {
        throw new Error(`${key}: price basis ${[...bases].join(', ')}, not ${prices}.`);
    }

    return { values, providers };
};

/**
 * The years in which a group total of the series sums only some members: fewer than half of
 * the countries that report the series in its best-covered year, as with the preliminary 2025
 * release, plus every year before 2018 for grant equivalents.
 */
export const partialYears = (
    values: Values,
    countries: ReadonlySet<string>,
    years: readonly number[],
    key: SeriesKey,
): Set<number> => {
    const reporting = new Map(years.map((year) => [year, 0]));

    for (const [provider, byYear] of values) {
        if (!countries.has(provider)) {
            continue;
        }

        for (const year of byYear.keys()) {
            const count = reporting.get(year);

            if (count !== undefined) {
                reporting.set(year, count + 1);
            }
        }
    }

    const most = Math.max(...reporting.values());
    const partial = new Set(years.filter((year) => (reporting.get(year) ?? 0) < most / 2));

    if (key === 'grantEquivalent') {
        for (const year of years) {
            if (year < GRANT_EQUIVALENT_FROM) {
                partial.add(year);
            }
        }
    }

    return partial;
};

const byYear = (
    values: Values,
    provider: string,
    years: readonly number[],
    scale: number,
    digits: number,
): ByYear =>
    years.map((year) => {
        const value = values.get(provider)?.get(year);

        return value === undefined ? null : roundHalfEven(value / scale, digits);
    });

/** Whether `a` and `b` differ by more than `relative` of `b` and more than `absolute`. */
const differ = (a: number, b: number, relative: number, absolute: number): boolean =>
    Math.abs(a - b) > Math.max(relative * Math.abs(b), absolute);

/**
 * Every rule the reads break that the page's figures rest on; empty when all hold. Each read serves one member; the known values,
 * group flags, renamed groups and duplicate groups hold; the OECD headline equals net
 * disbursements before 2018 and grant equivalents from 2018, within 0.1% or $10,000; and
 * constant prices equal current prices in the base year, within 0.01% or $10,000.
 */
const problems = (
    read: (key: ReadKey) => Values,
    members: Readonly<Record<ReadKey, number>>,
    providers: ReadonlyMap<string, About>,
    { years, baseYear }: Pick<CountsData, 'years' | 'baseYear'>,
): string[] => {
    const gross = read('gross/current');
    const net = read('net/current');
    const grantEquivalent = read('grantEquivalent/current');

    return [
        ...READ_KEYS.filter((key) => members[key] !== 1).map(
            (key) => `${key}: ${members[key]} members, not one`,
        ),
        ...KNOWN.filter(({ provider, key, year, value }) => {
            const found = read(`${key}/current`).get(provider)?.get(year);

            return found === undefined || Math.abs(found / value - 1) > KNOWN_TOLERANCE;
        }).map(({ provider, key, year, value }) => `${provider} ${key} ${year}: not ${value}`),
        ...Object.entries(KNOWN_KINDS)
            .filter(([provider, isGroup]) => providers.get(provider)?.isGroup !== isGroup)
            .map(([provider]) => `${provider}: the group flag differs from the known one`),
        ...Object.keys(GROUP_NAMES)
            .filter((group) => !providers.has(group))
            .map((group) => `${group}: no figures, so its name is unused`),
        ...Object.entries(DUPLICATES).flatMap(([group, provider]) =>
            years
                .filter((year) => {
                    const repeated = gross.get(group)?.get(year);

                    return repeated === undefined || repeated !== gross.get(provider)?.get(year);
                })
                .map((year) => `gross ${year}: ${group} differs from ${provider}`),
        ),
        ...[...read('headline/current')].flatMap(([provider, byYear]) =>
            [...byYear]
                .filter(([year, headline]) => {
                    const basis = year < GRANT_EQUIVALENT_FROM ? net : grantEquivalent;
                    const value = basis.get(provider)?.get(year);

                    return value === undefined || differ(headline, value, 1e-3, 1e4);
                })
                .map(([year]) => `headline ${provider} ${year}: differs from its basis`),
        ),
        ...MONETARY.flatMap((key) => {
            const current = read(`${key}/current`);

            return [...read(`${key}/constant`)]
                .filter(([provider, byYear]) => {
                    const constant = byYear.get(baseYear);
                    const base = current.get(provider)?.get(baseYear);

                    return (
                        constant !== undefined &&
                        base !== undefined &&
                        differ(constant, base, 1e-4, 1e4)
                    );
                })
                .map(
                    ([provider]) => `${key} ${provider} ${baseYear}: constant differs from current`,
                );
        }),
    ];
};

/**
 * The page's figures from each read's rows: per provider, every monetary series in millions
 * of US dollars at both price bases and ODA/GNI as a percentage, by year of `years`. Providers
 * and their names come from gross disbursements at current prices, less the duplicate group;
 * countries come first by name, then group totals by name, which are null in a year they sum
 * only some members (`partialYears`). `members` is each read's count of members.
 *
 * @throws Rows that break a rule the figures rest on: a second row for a provider and year, a
 *   price basis other than the read's, or any rule `problems` tests.
 */
export const countsFromRows = (
    rows: Readonly<Record<ReadKey, readonly Row[]>>,
    {
        years,
        baseYear,
        members,
    }: Pick<CountsData, 'years' | 'baseYear'> & { members: Readonly<Record<ReadKey, number>> },
): CountsData => {
    const reads = recordOf(READ_KEYS, (key) => valuesOf(key, rows[key]));
    const read = (key: ReadKey): Values => reads[key].values;
    const providers = new Map(
        [...reads['gross/current'].providers].filter(([provider]) => !(provider in DUPLICATES)),
    );
    const broken = problems(read, members, providers, { years, baseYear });

    if (broken.length > 0) {
        throw new Error(`The rows break the page's rules:\n  ${broken.join('\n  ')}`);
    }

    const countries = new Set(
        [...providers].filter(([, about]) => !about.isGroup).map(([provider]) => provider),
    );
    const partial = recordOf(MONETARY, (key) =>
        partialYears(read(`${key}/current`), countries, years, key),
    );
    // Array.prototype.sort is stable, so equal names keep the rows' order.
    const order = [...providers].sort(([, a], [, b]) =>
        a.isGroup !== b.isGroup
            ? a.isGroup
                ? 1
                : -1
            : a.name < b.name
              ? -1
              : a.name > b.name
                ? 1
                : 0,
    );
    const donors = order.map(([provider, about]): Donor => {
        const basis = (key: SeriesKey, prices: Prices): ByYear => {
            const values = byYear(read(`${key}/${prices}`), provider, years, 1e6, 2);

            return about.isGroup
                ? values.map((value, index) => (partial[key].has(years[index]!) ? null : value))
                : values;
        };

        return {
            ...about,
            id: provider,
            series: recordOf(MONETARY, (key) => ({
                current: basis(key, 'current'),
                constant: basis(key, 'constant'),
            })),
            odaGni: byYear(read('odaGni/ratio'), provider, years, 1, 3),
        };
    });

    return { years: [...years], baseYear, donors };
};
