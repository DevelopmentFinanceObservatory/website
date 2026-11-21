// counts.json's `data` from the rows of the step's 19 reads, as _data/fetch.py's `build` writes
// it, so the page derives the same figures in the browser from DFO's newest stored versions.
// _lib/derive.test.mts checks that the pinned reads' rows give counts.json exactly.
// Only type imports, which keeps the module loadable by `node --test`.
import type { Row } from '@developmentfinance/client/types';

import type { ByYear, CountsData, Donor, Prices, SeriesKey } from '../_data/types.ts';

/** The monetary series, in the order fetch.py's `SERIES` lists them. */
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

/** A read's values, and each provider's name and group flag from its last row, as fetch.py's
 *  `values_of` reads them. Rows without a value are skipped. */
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

/** Every rule the rows break that the page's figures rest on; empty when all hold. */
const problems = (
    gross: Values,
    providers: ReadonlyMap<string, About>,
    years: readonly number[],
) => [
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
];

/**
 * counts.json's `data` from each read's rows: per provider, every monetary series in millions
 * of US dollars at both price bases and ODA/GNI as a percentage, by year of `years`. Providers
 * and their names come from gross disbursements at current prices, less the duplicate group;
 * countries come first by name, then group totals by name, which are null in a year they sum
 * only some members (`partialYears`).
 *
 * @throws Rows that break a rule the figures rest on: a second row for a provider and year, a
 *   price basis other than the read's, a group flag or renamed group that differs from the
 *   step's, or a duplicate group that no longer repeats its provider.
 */
export const countsFromRows = (
    rows: Readonly<Record<ReadKey, readonly Row[]>>,
    { years, baseYear }: Pick<CountsData, 'years' | 'baseYear'>,
): CountsData => {
    const read = Object.fromEntries(
        READ_KEYS.map((key) => [key, valuesOf(key, rows[key])]),
    ) as Record<ReadKey, ReturnType<typeof valuesOf>>;
    const gross = read['gross/current'];
    const providers = new Map(
        [...gross.providers].filter(([provider]) => !(provider in DUPLICATES)),
    );
    const broken = problems(gross.values, providers, years);

    if (broken.length > 0) {
        throw new Error(`The rows break the page's rules:\n  ${broken.join('\n  ')}`);
    }

    const countries = new Set(
        [...providers].filter(([, about]) => !about.isGroup).map(([provider]) => provider),
    );
    const partial = new Map(
        MONETARY.map((key) => [
            key,
            partialYears(read[`${key}/current`].values, countries, years, key),
        ]),
    );
    // Array.prototype.sort is stable, as Python's sorted is, so equal names keep the rows' order.
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
        const series = Object.fromEntries(
            MONETARY.map((key) => {
                const bases = Object.fromEntries(
                    (['current', 'constant'] as const).map((prices) => {
                        const values = byYear(
                            read[`${key}/${prices}`].values,
                            provider,
                            years,
                            1e6,
                            2,
                        );

                        return [
                            prices,
                            about.isGroup
                                ? values.map((value, index) =>
                                      partial.get(key)?.has(years[index]!) ? null : value,
                                  )
                                : values,
                        ];
                    }),
                ) as Record<Prices, ByYear>;

                return [key, bases];
            }),
        ) as Donor['series'];

        return {
            ...about,
            id: provider,
            series,
            odaGni: byYear(read['odaGni/ratio'].values, provider, years, 1, 3),
        };
    });

    return { years: [...years], baseYear, donors };
};
