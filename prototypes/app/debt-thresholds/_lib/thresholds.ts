// FDL's solvency and liquidity test over `_data/types.ts`. Pure functions, so the
// page, the country card and the CSV read the same numbers. Only type imports from
// the data file, which keeps the module loadable by Next and by `node --test`.
import type { BaseYear, Capacity, Country, Creditor, FdlGroup } from '../_data/types.ts';

/** IMF–World Bank thresholds by debt-carrying capacity: debt in % of GDP, service in % of revenue. */
export const THRESHOLDS = {
    debt: { weak: 30, medium: 40, strong: 55 },
    service: { weak: 14, medium: 18, strong: 23 },
} as const satisfies Record<'debt' | 'service', Record<Capacity, number>>;

/** The base year of FDL's March 2026 note, and of the page's FDL view. */
export const FDL_YEAR = 2024;

export type Group = 'debt' | 'service' | 'below' | 'nodata';
export type CapacityOverride = Capacity | 'assessed';
export type ServiceRatio = {
    year: number;
    ratio: number | null;
    projected: boolean;
    byCreditor: Record<Creditor, number> | null;
};

export const GROUP_LABELS: Record<Group, string> = {
    debt: 'Above the debt threshold',
    service: 'Above the debt-service threshold',
    below: 'Below both thresholds',
    nodata: 'No data',
};

/** FDL's published groups on the page's groups. */
export const FDL_GROUPS: Record<FdlGroup, Group> = {
    insolvent: 'debt',
    illiquid: 'service',
    'lower risk': 'below',
};

const CREDITORS = ['multilateral', 'imf', 'bilateral', 'china', 'private'] as const;

const toBase = (country: Country, year: number): BaseYear | undefined =>
    country.bases[String(year)];

const isPositive = (value: number | null): value is number => value !== null && value > 0;

/** The capacity that sets the thresholds: the base year's rating, or the user's what-if. */
export const effectiveCapacity = (
    country: Country,
    year: number,
    override: CapacityOverride,
): Capacity | null =>
    override === 'assessed' ? (toBase(country, year)?.capacity ?? null) : override;

/** External public debt at face value in % of GDP. */
export const debtRatio = (base: BaseYear): number | null => {
    const { debtFace, gdp } = base;

    return debtFace === null || !isPositive(gdp) ? null : (debtFace * 100) / gdp;
};

/** External debt service in % of revenue for every year in the base year's series. */
export const serviceRatios = (base: BaseYear): ServiceRatio[] =>
    base.years.map(({ year, projected, service, revenue }) => {
        if (service === null || !isPositive(revenue)) {
            return { year, ratio: null, projected, byCreditor: null };
        }

        const byCreditor = Object.fromEntries(
            CREDITORS.map((creditor) => [creditor, (service[creditor] * 100) / revenue]),
        ) as Record<Creditor, number>;
        const total = CREDITORS.reduce((sum, creditor) => sum + service[creditor], 0);
        const ratio = (total * 100) / revenue;

        return { year, ratio, projected, byCreditor };
    });

/**
 * The highest service ratio from the base year to the last year in the data. Years with
 * missing inputs are skipped; null when none has data.
 */
export const peakService = (
    base: BaseYear,
): { year: number; ratio: number; projected: boolean } | null => {
    let peak: { year: number; ratio: number; projected: boolean } | null = null;

    for (const { year, ratio, projected } of serviceRatios(base)) {
        if (year >= base.year && ratio !== null && (peak === null || ratio > peak.ratio)) {
            peak = { year, ratio, projected };
        }
    }

    return peak;
};

/** The last year of the base year's series, the end of the service test. */
export const endYear = (base: BaseYear): number => base.years.at(-1)?.year ?? base.year;

/** The base-year ratio, or null when the base year is missing from the series. */
const baseYearService = (base: BaseYear): number | null =>
    serviceRatios(base).find(({ year }) => year === base.year)?.ratio ?? null;

/**
 * Debt test first, on the base year only; then the service test on the base year and
 * every projected year in the data. A missing debt ratio, a missing base-year service
 * ratio or a missing capacity gives `nodata`; a missing projected year is skipped. A
 * country over the debt threshold is `debt` even when its service data is missing.
 */
export const classify = (country: Country, year: number, capacity: Capacity | null): Group => {
    const base = toBase(country, year);

    if (capacity === null || base === undefined) {
        return 'nodata';
    }

    const debt = debtRatio(base);

    if (debt === null) {
        return 'nodata';
    }

    if (debt > THRESHOLDS.debt[capacity]) {
        return 'debt';
    }

    if (baseYearService(base) === null) {
        return 'nodata';
    }

    const peak = peakService(base);

    return peak !== null && peak.ratio > THRESHOLDS.service[capacity] ? 'service' : 'below';
};

/**
 * FDL's view: base year 2024 with assessed capacities, for a country FDL grouped. Only
 * here does the page show FDL's published group and use FDL's terms.
 */
export const isFdlView = (country: Country, year: number, override: CapacityOverride): boolean =>
    year === FDL_YEAR && override === 'assessed' && country.fdl2024 !== null;

/** The group the page shows: FDL's published group in FDL's view, the DFO's test elsewhere. */
export const shownGroup = (country: Country, year: number, override: CapacityOverride): Group =>
    isFdlView(country, year, override) && country.fdl2024 !== null
        ? FDL_GROUPS[country.fdl2024]
        : classify(country, year, effectiveCapacity(country, year, override));

/**
 * Countries whose group under the override differs from the group under their own
 * capacity. Countries with no capacity of their own are left out: they have no group to
 * move from.
 */
export const movers = (countries: Country[], year: number, override: CapacityOverride): Country[] =>
    countries.filter((country) => {
        const own = effectiveCapacity(country, year, 'assessed');

        return (
            own !== null &&
            classify(country, year, effectiveCapacity(country, year, override)) !==
                classify(country, year, own)
        );
    });

/** Countries in each group for a view and capacity, as the page shows them. */
export const groupCounts = (
    countries: Country[],
    year: number,
    override: CapacityOverride,
): Record<Group, number> => {
    const counts: Record<Group, number> = { debt: 0, service: 0, below: 0, nodata: 0 };

    for (const country of countries) {
        counts[shownGroup(country, year, override)] += 1;
    }

    return counts;
};

/** FDL's published 2024 groups, counted on the page's groups. */
export const fdlCounts = (countries: Country[]): Record<Group, number> => {
    const counts: Record<Group, number> = { debt: 0, service: 0, below: 0, nodata: 0 };

    for (const country of countries) {
        if (country.fdl2024 !== null) {
            counts[FDL_GROUPS[country.fdl2024]] += 1;
        }
    }

    return counts;
};

/**
 * The DFO's rebuild of FDL's year against FDL's published groups: how many of the
 * countries FDL grouped land in the same group under their assessed capacity, and the
 * ones that do not, with both groups.
 */
export const fdlMatch = (
    countries: Country[],
): {
    matched: number;
    total: number;
    mismatches: { country: Country; fdl: Group; rebuilt: Group }[];
} => {
    let matched = 0;
    let total = 0;
    const mismatches: { country: Country; fdl: Group; rebuilt: Group }[] = [];

    for (const country of countries) {
        if (country.fdl2024 === null) {
            continue;
        }

        const fdl = FDL_GROUPS[country.fdl2024];
        const rebuilt = classify(
            country,
            FDL_YEAR,
            effectiveCapacity(country, FDL_YEAR, 'assessed'),
        );

        total += 1;
        if (rebuilt === fdl) {
            matched += 1;
        } else {
            mismatches.push({ country, fdl, rebuilt });
        }
    }

    return { matched, total, mismatches };
};

/** A group as the end of a sentence: "FDL places Haiti below both thresholds." */
export const GROUP_PHRASES: Record<Group, string> = {
    debt: 'above the debt threshold',
    service: 'above the debt-service threshold',
    below: 'below both thresholds',
    nodata: 'among countries without enough data',
};

/** "a, b, and c", with the Oxford comma; "a and b" for two. */
export const listOf = (items: string[]): string =>
    items.length <= 2
        ? items.join(' and ')
        : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;

/** True when the DSA is more than two years older than the date capacities are taken at. */
export const isStaleRating = (dsaDate: string | null, asOf: string): boolean => {
    if (dsaDate === null) {
        return false;
    }

    const limit = new Date(dsaDate);
    limit.setUTCFullYear(limit.getUTCFullYear() + 2);

    return limit.getTime() < new Date(asOf).getTime();
};

const percent = (value: number, digits: number): string => `${value.toFixed(digits)}%`;

const FDL_SENTENCES: Record<FdlGroup, (name: string) => string> = {
    insolvent: (name) => `FDL puts ${name} at risk of insolvency.`,
    illiquid: (name) => `FDL finds ${name} illiquid.`,
    'lower risk': (name) => `FDL puts ${name} at lower risk.`,
};

const TEST_NAMES = { debt: 'risk of insolvency', service: 'illiquidity' } as const;

/**
 * The evidence for the DFO's group, as conditional statements on the DFO's projection.
 * `tail` adds which of FDL's tests the country meets.
 */
const evidence = (
    country: Country,
    year: number,
    capacity: Capacity | null,
    tail: boolean,
): string => {
    const base = toBase(country, year);
    const group = classify(country, year, capacity);

    if (capacity === null || base === undefined || group === 'nodata') {
        return `${country.name} has too little data to test against the thresholds in ${year}.`;
    }

    const debt = debtRatio(base) ?? 0;
    const peak = peakService(base);
    const meets = (test: 'debt' | 'service') =>
        tail ? ` That meets FDL's test for ${TEST_NAMES[test]}.` : '';

    if (group === 'debt') {
        return `${country.name}'s external public debt was ${percent(debt, 0)} of GDP in ${year}, above the ${THRESHOLDS.debt[capacity]}% threshold for ${capacity} debt-carrying capacity.${meets('debt')}`;
    }

    const limit = `the ${THRESHOLDS.service[capacity]}% threshold for ${capacity} capacity`;

    if (group === 'service' && peak !== null) {
        return peak.projected
            ? `${country.name}'s external debt service would reach ${percent(peak.ratio, 1)} of government revenue in ${peak.year} on the DFO's projection, above ${limit}.${meets('service')}`
            : `${country.name} spent ${percent(peak.ratio, 1)} of government revenue on external debt service in ${peak.year}, above ${limit}.${meets('service')}`;
    }

    return `${country.name} would stay below both thresholds for ${capacity} capacity in every year to ${endYear(base)} on the DFO's projection, with debt at ${percent(debt, 0)} of GDP and debt service peaking at ${percent(peak?.ratio ?? 0, 1)} of revenue.`;
};

/**
 * The country card's sentence. In FDL's view it leads with FDL's published call, and
 * says so when the DFO's rebuild differs; elsewhere it says which of FDL's tests the
 * country meets, in neutral terms.
 */
export const sentence = (country: Country, year: number, override: CapacityOverride): string => {
    const capacity = effectiveCapacity(country, year, override);

    if (!isFdlView(country, year, override) || country.fdl2024 === null) {
        return evidence(country, year, capacity, true);
    }

    const call = FDL_SENTENCES[country.fdl2024](country.name);
    const rebuilt = classify(country, year, capacity);
    const detail = evidence(country, year, capacity, false);

    return rebuilt === FDL_GROUPS[country.fdl2024]
        ? `${call} ${detail}`
        : `${call} The DFO's rebuild differs. ${detail}`;
};

const CSV_HEADER = [
    'iso3',
    'name',
    'capacity',
    'capacity source',
    'external public debt at face value % of GDP',
    'debt service % of revenue (base year)',
    'peak debt service % of revenue',
    'peak year',
    'group',
    'FDL group, 2024',
] as const;

const csvCell = (value: string | number | null): string => {
    const text = value === null ? '' : String(value);

    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * One row per country for the base year and capacity override on screen. The group
 * column is the DFO's test; FDL's published 2024 group sits in its own column.
 */
export const toCsv = (countries: Country[], year: number, override: CapacityOverride): string => {
    const rows = countries.map((country) => {
        const base = toBase(country, year);
        const capacity = effectiveCapacity(country, year, override);
        const peak = base === undefined ? null : peakService(base);
        const group = classify(country, year, capacity);
        const digits = (value: number | null | undefined): number | null =>
            value === null || value === undefined ? null : Number(value.toFixed(1));

        return [
            country.iso3,
            country.name,
            capacity,
            override === 'assessed' ? (base?.capacitySource ?? null) : 'override',
            digits(base && debtRatio(base)),
            digits(base && baseYearService(base)),
            digits(peak?.ratio),
            peak?.year ?? null,
            GROUP_LABELS[group],
            country.fdl2024 ?? null,
        ].map(csvCell);
    });

    return [CSV_HEADER.map(csvCell), ...rows].map((row) => row.join(',')).join('\n') + '\n';
};
