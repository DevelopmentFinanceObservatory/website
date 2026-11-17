// Pure functions over _data/counts.json and _data/definitions.json, so the controls,
// the headline sentence, the bars, the bridge and the tests read the same numbers.
// Only type imports, which keeps the module loadable by `node --test`.
import type { CountKey, CountsData, Definition, Donor, Prices, SeriesKey } from '../_data/types.ts';

/** The counts in the order the page shows them. */
export const COUNTS: readonly CountKey[] = [
    'gross',
    'grantEquivalent',
    'net',
    'commitments',
    'headline',
];

export const COUNT_LABELS: Record<CountKey, string> = {
    gross: 'Gross disbursements',
    grantEquivalent: 'Grant equivalents',
    net: 'Net disbursements',
    commitments: 'Commitments',
    headline: 'OECD headline',
};

export const DEFAULT_DONOR = 'country/FRA';
/** The DAC's preliminary year; 2024 is the latest year with every count. */
export const DEFAULT_YEAR = 2025;
/** The first year the OECD headline counts grant equivalents rather than net flows. */
export const GRANT_EQUIVALENT_FROM = 2018;
/** The year whose figures the DAC publishes as preliminary. */
export const PRELIMINARY_YEAR = 2025;
/** The DFO's page for the OECD DAC1 table every count comes from. */
export const DAC1_SOURCE_URL = 'https://developmentfinance.org/data/sources/provenance/OECDDAC1';

/** The donor with this id, or undefined. */
export const findDonor = (data: CountsData, id: string): Donor | undefined =>
    data.donors.find((donor) => donor.id === id);

/** A series' value in millions of US dollars, or null where none is published. */
export const valueAt = (
    data: CountsData,
    donor: Donor,
    key: SeriesKey,
    year: number,
    prices: Prices,
): number | null => {
    const index = data.years.indexOf(year);

    return index === -1 ? null : (donor.series[key][prices][index] ?? null);
};

/** The count the OECD headline follows in a year. */
export const headlineBasis = (year: number): 'net' | 'grantEquivalent' =>
    year < GRANT_EQUIVALENT_FROM ? 'net' : 'grantEquivalent';

export type CountValue = { key: CountKey; value: number | null };

/** Every count for a donor and year, in `COUNTS` order; null where none is published. */
export const countsFor = (
    data: CountsData,
    donor: Donor,
    year: number,
    prices: Prices,
): CountValue[] => COUNTS.map((key) => ({ key, value: valueAt(data, donor, key, year, prices) }));

export type Range = { low: CountValue & { value: number }; high: CountValue & { value: number } };

/** The smallest and largest published count, or null when none is published. */
export const countRange = (counts: CountValue[]): Range | null => {
    const published = counts.filter(
        (count): count is CountValue & { value: number } => count.value !== null,
    );

    if (published.length === 0) {
        return null;
    }

    const low = published.reduce((min, count) => (count.value < min.value ? count : min));
    const high = published.reduce((max, count) => (count.value > max.value ? count : max));

    return { low, high };
};

/** An amount in millions of US dollars as "$17.5bn", "$350m" or "$4.2m". */
export const formatUsd = (millions: number): string => {
    const sign = millions < 0 ? '-' : '';
    const size = Math.abs(millions);

    if (size >= 1000) {
        return `${sign}$${(size / 1000).toFixed(1)}bn`;
    }

    return `${sign}$${size >= 10 ? size.toFixed(0) : size.toFixed(1)}m`;
};

/** An amount in millions of US dollars as a chart label: "17.5B", "350.0M", "1.2T". */
export const formatCompact = (millions: number): string => {
    const sign = millions < 0 ? '-' : '';
    const size = Math.abs(millions);
    const [scaled, unit] =
        size >= 1_000_000
            ? [size / 1_000_000, 'T']
            : size >= 1000
              ? [size / 1000, 'B']
              : size >= 1
                ? [size, 'M']
                : [size * 1000, 'K'];

    return `${sign}${scaled.toFixed(1)}${unit}`;
};

/**
 * What a bar says in place of a value: "no constant-price figure" where only the
 * current-price value exists, otherwise "not published".
 */
export const missingText = (
    data: CountsData,
    donor: Donor,
    key: SeriesKey,
    year: number,
    prices: Prices,
): string =>
    prices === 'constant' && valueAt(data, donor, key, year, 'current') !== null
        ? 'no constant-price figure'
        : 'not published';

/** Lower case without accents, so "turk" finds Türkiye. */
const fold = (text: string): string =>
    text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

/**
 * Donors matching `query`, countries before group totals; within each, names that
 * start with it, then names with a word that starts with it, then names that contain
 * it, each by name. An empty query matches every donor.
 */
export const matchDonors = (donors: Donor[], query: string): Donor[] => {
    const q = fold(query.trim());
    const rank = (name: string): number => {
        const folded = fold(name);

        if (folded.startsWith(q)) {
            return 0;
        }

        if (folded.split(/[\s()-]+/).some((word) => word.startsWith(q))) {
            return 1;
        }

        return folded.includes(q) ? 2 : 3;
    };

    return donors
        .map((donor) => ({ donor, score: rank(donor.name) }))
        .filter(({ score }) => score < 3)
        .toSorted(
            (a, b) =>
                Number(a.donor.isGroup) - Number(b.donor.isGroup) ||
                a.score - b.score ||
                a.donor.name.localeCompare(b.donor.name),
        )
        .map(({ donor }) => donor);
};

/** "France's", or "DAC countries'" for a name ending in s. */
export const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/** "<Donor>'s ODA in <year> was $X to $Y, depending on the count.", or null with no counts. */
export const rangeSentence = (name: string, year: number, counts: CountValue[]): string | null => {
    const range = countRange(counts);

    if (range === null) {
        return null;
    }

    const low = formatUsd(range.low.value);
    const high = formatUsd(range.high.value);
    const lead = `${possessive(name)} ODA in ${year} was`;

    return low === high ? `${lead} ${low}.` : `${lead} ${low} to ${high}, depending on the count.`;
};

export type Bridge = {
    /** gross minus net: loan repayments and other amounts received */
    toNet: { gross: number; net: number; received: number } | null;
    /**
     * gross minus grant equivalents: the part of non-grant instruments not counted
     * as concessional; null before 2018. `nonGrants` is gross non-grant disbursements
     * where published.
     */
    toGrantEquivalent: {
        gross: number;
        grantEquivalent: number;
        notCounted: number;
        nonGrants: number | null;
    } | null;
};

/** The steps from gross disbursements to net disbursements and to grant equivalents. */
export const bridge = (data: CountsData, donor: Donor, year: number, prices: Prices): Bridge => {
    const at = (key: SeriesKey) => valueAt(data, donor, key, year, prices);
    const gross = at('gross');
    const net = at('net');
    const grantEquivalent = at('grantEquivalent');

    return {
        toNet: gross === null || net === null ? null : { gross, net, received: gross - net },
        toGrantEquivalent:
            gross === null || grantEquivalent === null || year < GRANT_EQUIVALENT_FROM
                ? null
                : {
                      gross,
                      grantEquivalent,
                      notCounted: gross - grantEquivalent,
                      nonGrants: at('grossNonGrants'),
                  },
    };
};

/** The label of each bridge's one step. */
export const STEP_LABELS = {
    toNet: 'Repayments and other amounts received',
    toGrantEquivalent: 'Not counted as grant equivalent',
} as const;

/**
 * One row of a one-step waterfall, in millions: a total runs from 0 to its value; the
 * step spans the gap between the two totals, and `value` is the change, negative for
 * a fall.
 */
export type StepRow = {
    kind: 'total' | 'step';
    label: string;
    value: number;
    start: number;
    end: number;
};

/** The three rows of a bridge from one total to another: from, the step, to. */
export const stepRows = (
    from: { label: string; value: number },
    step: string,
    to: { label: string; value: number },
): StepRow[] => [
    { kind: 'total', label: from.label, value: from.value, start: 0, end: from.value },
    {
        kind: 'step',
        label: step,
        value: to.value - from.value,
        start: Math.min(from.value, to.value),
        end: Math.max(from.value, to.value),
    },
    { kind: 'total', label: to.label, value: to.value, start: 0, end: to.value },
];

/** Each bridge as waterfall rows, or null where the bridge has no figure. */
export const bridgeRows = (
    steps: Bridge,
): { toNet: StepRow[] | null; toGrantEquivalent: StepRow[] | null } => ({
    toNet:
        steps.toNet &&
        stepRows({ label: COUNT_LABELS.gross, value: steps.toNet.gross }, STEP_LABELS.toNet, {
            label: COUNT_LABELS.net,
            value: steps.toNet.net,
        }),
    toGrantEquivalent:
        steps.toGrantEquivalent &&
        stepRows(
            { label: COUNT_LABELS.gross, value: steps.toGrantEquivalent.gross },
            STEP_LABELS.toGrantEquivalent,
            { label: COUNT_LABELS.grantEquivalent, value: steps.toGrantEquivalent.grantEquivalent },
        ),
});

/**
 * "Of $18.1bn gross, $4.7bn was loans and other non-grant instruments; counting only
 * their concessional part removes $2.6bn.", or null without a non-grant figure.
 */
export const nonGrantSentence = (step: Bridge['toGrantEquivalent']): string | null => {
    if (step === null || step.nonGrants === null) {
        return null;
    }

    return (
        `Of ${formatUsd(step.gross)} gross, ${formatUsd(step.nonGrants)} was loans and other ` +
        `non-grant instruments; counting only their concessional part removes ` +
        `${formatUsd(step.notCounted)}.`
    );
};

/** The definitions a count's own definition is composed from, keyed by id. */
const PARTS: Record<CountKey, string[]> = {
    gross: ['Gross', 'Disbursement'],
    net: ['Net', 'Disbursement'],
    grantEquivalent: ['grantEquivalent', 'grantElement', 'Disbursement'],
    commitments: ['Commitment'],
    headline: ['oecdHeadline'],
};

/** The price basis' definition: the graph's for current prices, the page's for constant. */
const PRICE_PART: Record<Prices, string> = { current: 'Nominal', constant: 'constantPrices' };

const definitionOf = (id: string, definitions: Definition[]): Definition => {
    const found = definitions.find((definition) => definition.id === id);

    if (!found) {
        throw new Error(`definitions.json has no entry for "${id}"`);
    }

    return found;
};

/** What a count counts, as its parts, each a graph node or a written entry. */
export const countDefinition = (key: CountKey, definitions: Definition[]): Definition[] =>
    PARTS[key].map((id) => definitionOf(id, definitions));

/** What the price basis means, shared by every count. */
export const priceDefinition = (prices: Prices, definitions: Definition[]): Definition =>
    definitionOf(PRICE_PART[prices], definitions);

/** A count's definition as its parts, each a graph node or a written entry, prices last. */
export const definitionParts = (
    key: CountKey,
    prices: Prices,
    definitions: Definition[],
): Definition[] => [...countDefinition(key, definitions), priceDefinition(prices, definitions)];

export type Scope = {
    /** shares of gross bilateral plus multilateral disbursements, from 0 to 1 */
    bilateralShare: number | null;
    multilateralShare: number | null;
    /** in-donor refugee costs in millions, and their share of the headline count */
    refugeeCosts: number | null;
    refugeeShare: number | null;
    /** OECD headline ODA as a percentage of GNI */
    odaGni: number | null;
};

/** What is inside a donor's ODA in a year. */
export const scope = (data: CountsData, donor: Donor, year: number, prices: Prices): Scope => {
    const at = (key: SeriesKey) => valueAt(data, donor, key, year, prices);
    const bilateral = at('bilateral');
    const multilateral = at('multilateral');
    const refugeeCosts = at('refugeeCosts');
    const headline = at('headline');
    const split =
        bilateral === null || multilateral === null || bilateral + multilateral === 0
            ? null
            : { bilateral, multilateral, total: bilateral + multilateral };
    const index = data.years.indexOf(year);

    return {
        bilateralShare: split && split.bilateral / split.total,
        multilateralShare: split && split.multilateral / split.total,
        refugeeCosts,
        refugeeShare: refugeeCosts !== null && headline ? refugeeCosts / headline : null,
        odaGni: index === -1 ? null : (donor.odaGni[index] ?? null),
    };
};

/** The counts drawn as lines over time; the OECD headline follows two of them. */
export const TREND_COUNTS: readonly CountKey[] = ['gross', 'grantEquivalent', 'net', 'commitments'];

export type TrendLine = { key: CountKey; values: (number | null)[] };

/** One line per count in `TREND_COUNTS`, aligned to `data.years`, nulls left as gaps. */
export const trendLines = (data: CountsData, donor: Donor, prices: Prices): TrendLine[] =>
    TREND_COUNTS.map((key) => ({
        key,
        values: data.years.map((year) => valueAt(data, donor, key, year, prices)),
    }));

export type HeadlineSegment = { basis: 'net' | 'grantEquivalent'; values: (number | null)[] };

/**
 * The OECD headline as two segments aligned to `data.years`: net disbursements before
 * 2018 and grant equivalents from 2018, each null outside its own years, so a chart
 * never joins the two across the switch. A segment with no value is left out.
 */
export const headlineSegments = (
    data: CountsData,
    donor: Donor,
    prices: Prices,
): HeadlineSegment[] =>
    (['net', 'grantEquivalent'] as const)
        .map((basis) => ({
            basis,
            values: data.years.map((year) =>
                headlineBasis(year) === basis
                    ? valueAt(data, donor, 'headline', year, prices)
                    : null,
            ),
        }))
        .filter(({ values }) => values.some((value) => value !== null));

/**
 * Axis ticks from the lower of 0 and `low` to at least `high`, on a step of 1, 2, 2.5
 * or 5 times a power of ten that gives about `count` intervals.
 */
export const valueTicks = (low: number, high: number, count = 4): number[] => {
    const from = Math.min(0, low);
    // With nothing above the floor, the axis still spans one unit, so it never divides by zero.
    const to = Math.max(0, high) > from ? Math.max(0, high) : from + 1;
    const span = to - from;
    const raw = span / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / magnitude;
    const step =
        (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
    const ticks: number[] = [];

    for (let index = Math.floor(from / step); index * step < to + step * 0.999; index += 1) {
        ticks.push(index * step);
    }

    return ticks;
};

/** An axis tick in millions of US dollars: "0", "500M", "2.5B", "20B". */
export const formatTick = (millions: number): string => {
    if (millions === 0) {
        return '0';
    }

    return formatCompact(millions).replace(/\.0(?=[KMBT]$)/, '');
};

/** A fraction from 0 to 1 as a percentage with one decimal: "62.7%". */
export const formatShare = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

/** The UN target for ODA, as a percentage of gross national income. */
export const ODA_GNI_TARGET = 0.7;

/**
 * How far ODA/GNI, in percent, sits from the 0.7% target: "0.22 percentage points
 * short of the 0.7% target.", "0.32 percentage points above the 0.7% target." or
 * "At the 0.7% target."
 */
export const odaGniSentence = (percent: number): string => {
    const gap = Math.round((percent - ODA_GNI_TARGET) * 100) / 100;
    const target = `the ${ODA_GNI_TARGET}% target`;

    if (gap === 0) {
        return `At ${target}.`;
    }

    const points = `${Math.abs(gap).toFixed(2)} percentage points`;

    return gap < 0 ? `${points} short of ${target}.` : `${points} above ${target}.`;
};
