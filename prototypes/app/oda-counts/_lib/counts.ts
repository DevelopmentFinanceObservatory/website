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
/** The DAC's preliminary year. 2024 is the latest year with every count. */
export const DEFAULT_YEAR = 2025;
/** The first year the OECD headline counts grant equivalents. Earlier years count net flows. */
export const GRANT_EQUIVALENT_FROM = 2018;
/** The year whose figures the DAC publishes as preliminary. */
export const PRELIMINARY_YEAR = 2025;
/** The DFO's page for the OECD DAC1 table every count comes from. */
export const DAC1_SOURCE_URL = 'https://developmentfinance.org/data/sources/provenance/OECDDAC1';

/** The donor with this id, or undefined. */
export const findDonor = (data: CountsData, id: string): Donor | undefined =>
    data.donors.find((donor) => donor.id === id);

/** A series' value in millions of the unit's currency, or null where none is published. */
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

/** `value` rounded to `digits` decimals, as a label prints it. */
const rounded = (value: number, digits: number): number => Number(value.toFixed(digits));

/**
 * The prefix an amount in `currency` takes: "$" for US dollars, otherwise the British
 * English symbol, which names a currency that shares a sign by its country ("A$", "JP¥").
 * A symbol ending in a letter takes a space ("CHF 17.5bn"). An unknown code prints as itself.
 */
export const currencyPrefix = (currency: string): string => {
    if (currency === 'USD') {
        return '$';
    }

    let symbol = currency;

    try {
        symbol =
            new Intl.NumberFormat('en-GB', { style: 'currency', currency })
                .formatToParts(1)
                .find((part) => part.type === 'currency')?.value ?? currency;
    } catch (error) {
        if (!(error instanceof RangeError)) {
            throw error;
        }
    }

    return /\p{L}$/u.test(symbol) ? `${symbol} ` : symbol;
};

/**
 * An amount in millions of `currency` as "$17.5bn", "€350m", "CHF 4.2m" or "JP¥2.6tn".
 * The unit follows the rounded amount, so 999.96 prints as "$1.0bn".
 */
export const formatAmount = (millions: number, currency: string): string => {
    const sign = millions < 0 ? '-' : '';
    const size = Math.abs(millions);
    const prefix = currencyPrefix(currency);

    if (rounded(size / 1000, 1) >= 1000) {
        return `${sign}${prefix}${(size / 1_000_000).toFixed(1)}tn`;
    }

    if (rounded(size, 0) >= 1000) {
        return `${sign}${prefix}${(size / 1000).toFixed(1)}bn`;
    }

    return `${sign}${prefix}${rounded(size, 1) >= 10 ? size.toFixed(0) : size.toFixed(1)}m`;
};

/** Chart label units, largest first, each with its size in millions. */
const COMPACT_UNITS = [
    [1_000_000, 'T'],
    [1000, 'B'],
    [1, 'M'],
] as const;

/**
 * An amount in millions of `currency` as a chart label: "$17.5B", "€350.0M", "SEK 1.2T".
 * The unit follows the rounded amount, so 999.96 prints as "$1.0B".
 */
export const formatCompact = (millions: number, currency: string): string => {
    const sign = millions < 0 ? '-' : '';
    const size = Math.abs(millions);
    const [factor, unit] = COMPACT_UNITS.find(([factor]) => rounded(size / factor, 1) >= 1) ?? [
        0.001,
        'K',
    ];

    return `${sign}${currencyPrefix(currency)}${(size / factor).toFixed(1)}${unit}`;
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
 * Donors matching `query`, countries before group totals. Within each, names that
 * start with it come first, then names with a word that starts with it, then names
 * that contain it, each by name. An empty query matches every donor.
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

/** The disbursed counts. The range leaves out commitments, which are obligations to provide aid. */
const DISBURSED: readonly CountKey[] = ['gross', 'net', 'grantEquivalent', 'headline'];

/**
 * "<Donor>'s ODA in <year> was $X to $Y, depending on the definition.", over the counts of
 * money paid out in `currency`, or null with none published.
 */
export const rangeSentence = (
    name: string,
    year: number,
    counts: CountValue[],
    currency: string,
): string | null => {
    const range = countRange(counts.filter(({ key }) => DISBURSED.includes(key)));

    if (range === null) {
        return null;
    }

    const low = formatAmount(range.low.value, currency);
    const high = formatAmount(range.high.value, currency);
    const lead = `${possessive(name)} ODA in ${year} was`;

    return low === high
        ? `${lead} ${low}.`
        : `${lead} ${low} to ${high}, depending on the definition.`;
};

export type Bridge = {
    /**
     * gross minus net, which is loan repayments and other amounts received. Negative in
     * a year net disbursements are above gross.
     */
    toNet: { gross: number; net: number; received: number } | null;
    /**
     * gross minus grant equivalents, null before 2018. Mostly the part of loans not
     * counted as concessional, but grant equivalents count private sector instruments
     * and debt relief on a different basis, so it can exceed the loans or be negative.
     * `nonGrants` is gross non-grant disbursements where published.
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

export type BridgeKey = keyof Bridge;

/** The label of each bridge's one step, for a fall from gross and for a rise. */
export const STEP_LABELS = {
    toNet: { fall: 'Repayments and other amounts received', rise: 'Net above gross disbursements' },
    toGrantEquivalent: {
        fall: 'Not counted as grant equivalent',
        rise: 'Counted above gross disbursements',
    },
} as const satisfies Record<BridgeKey, { fall: string; rise: string }>;

/** A bridge's step label: the rise label when the second total is above gross. */
export const stepLabel = (key: BridgeKey, gross: number, to: number): string =>
    to > gross ? STEP_LABELS[key].rise : STEP_LABELS[key].fall;

/** Why the second total can sit above gross, shown under a bridge whose step is a rise. */
export const RISE_NOTES: Record<BridgeKey, string> = {
    toNet:
        'Net disbursements are above gross this year, so the step adds to gross. ' +
        'Both figures are as the OECD publishes them.',
    toGrantEquivalent:
        'Grant equivalents are above gross disbursements this year. Grant equivalents ' +
        'count private sector instruments and debt relief on a different basis from ' +
        'gross disbursements, so they can exceed them.',
};

/** The note for a bridge whose step is a rise, or null for a fall or no figure. */
export const riseNote = (key: BridgeKey, steps: Bridge): string | null => {
    const to = key === 'toNet' ? steps.toNet?.net : steps.toGrantEquivalent?.grantEquivalent;
    const gross = steps[key]?.gross;

    return to !== undefined && gross !== undefined && to > gross ? RISE_NOTES[key] : null;
};

/**
 * One bridge as a single bar: the count it leads to, gross disbursements, and the step
 * between them, in millions. `step.value` is the change from gross, negative for a fall.
 */
export type BridgeBar = {
    target: 'net' | 'grantEquivalent';
    gross: number;
    value: number;
    step: { label: string; value: number };
};

const bridgeBar = (
    key: BridgeKey,
    target: BridgeBar['target'],
    gross: number,
    value: number,
): BridgeBar => ({
    target,
    gross,
    value,
    step: { label: stepLabel(key, gross, value), value: value - gross },
});

/** Each bridge as one bar, or null where the bridge has no figure. */
export const bridgeBars = (steps: Bridge): Record<BridgeKey, BridgeBar | null> => ({
    toNet: steps.toNet && bridgeBar('toNet', 'net', steps.toNet.gross, steps.toNet.net),
    toGrantEquivalent:
        steps.toGrantEquivalent &&
        bridgeBar(
            'toGrantEquivalent',
            'grantEquivalent',
            steps.toGrantEquivalent.gross,
            steps.toGrantEquivalent.grantEquivalent,
        ),
});

/**
 * "Of $18.1bn gross, $4.7bn was loans and other non-grant instruments; counting only
 * their concessional part removes $2.6bn.", or null without a non-grant figure. Also
 * null unless the gap is a fall no larger than the non-grants, since only then can
 * the loans' non-concessional part account for it.
 */
export const nonGrantSentence = (
    step: Bridge['toGrantEquivalent'],
    currency: string,
): string | null => {
    if (
        step === null ||
        step.nonGrants === null ||
        step.notCounted <= 0 ||
        step.notCounted > step.nonGrants
    ) {
        return null;
    }

    const amount = (millions: number): string => formatAmount(millions, currency);

    return (
        `Of ${amount(step.gross)} gross, ${amount(step.nonGrants)} was loans and other ` +
        `non-grant instruments; counting only their concessional part removes ` +
        `${amount(step.notCounted)}.`
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

/** The price basis' definition, from the graph for current prices and from the page for constant. */
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

/** An axis tick in millions of `currency`: "0", "$500M", "€2.5B", "$20B". */
export const formatTick = (millions: number, currency: string): string => {
    if (millions === 0) {
        return '0';
    }

    return formatCompact(millions, currency).replace(/\.0(?=[KMBT]$)/, '');
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

/** A label to place beside a dot plot's axis: its dot's x and its box width, in pixels. */
export type LabelBox = { id: string; x: number; width: number };

/**
 * A placed label: above or below the axis, in a tier counted outward from the axis,
 * with its box's left edge in pixels. `leaderX` is where its leader from the dot meets
 * the box, or null for a label drawn without one.
 */
export type PlacedLabel = LabelBox & {
    side: 'above' | 'below';
    tier: number;
    left: number;
    leaderX: number | null;
};

const SIDES = ['above', 'below'] as const;

type Side = PlacedLabel['side'];

type Spacing = { width: number; gap: number; inset: number; shift: number };

/** A label's place while the layout runs. A loose label has no leader. */
type Slot = { box: LabelBox; side: Side; tier: number; loose: boolean };

/**
 * The range of left edges a box may take. A box in the first tier may sit up to `shift`
 * from its dot, joined by a slanted leader across the empty strip next to the axis. A
 * box further out spans its dot with `inset` to spare, so its leader runs straight out.
 * Either way the box keeps clear of each leader in `clear`, which runs past it to a tier
 * further out. Null when no left edge does all that.
 */
const boundsOf = (
    { x, width: w }: LabelBox,
    tier: number,
    clear: number[],
    { width, gap, inset, shift }: Spacing,
): { lo: number; hi: number } | null => {
    let lo = tier === 0 ? x - w - shift : x - w + inset;
    let hi = tier === 0 ? x + shift : x - inset;

    lo = Math.max(lo, 0);
    hi = Math.min(hi, width - w);

    for (const leader of clear) {
        // A box on the dot of a leader passing it goes to the side with more room.
        const leftOf = leader > x || (leader === x && x > width / 2);

        if (leftOf) {
            hi = Math.min(hi, leader - gap / 2 - w);
        } else {
            lo = Math.max(lo, leader + gap / 2);
        }
    }

    return lo > hi ? null : { lo, hi };
};

/**
 * Left edges for one row of boxes, sorted by x, so no two overlap and each stays within
 * its bounds. Each sits as near centred on its dot as that allows. Null when the row
 * cannot hold them all.
 */
const packRow = (
    row: { box: LabelBox; lo: number; hi: number }[],
    gap: number,
): number[] | null => {
    // The leftmost each box can sit; past its upper bound, the row cannot fit.
    let least = Number.NEGATIVE_INFINITY;
    let previousWidth = 0;

    for (const { box, lo, hi } of row) {
        least = Math.max(lo, least + previousWidth + gap);
        previousWidth = box.width;

        if (least > hi) {
            return null;
        }
    }

    // Forward from the centred positions, pushing right past each neighbour; then
    // backward, pulling left inside each box's bounds. The pass above proves this fits.
    const forward: number[] = [];
    let reach = Number.NEGATIVE_INFINITY;

    for (const { box, lo, hi } of row) {
        const left = Math.max(Math.min(Math.max(box.x - box.width / 2, lo), hi), reach);

        forward.push(left);
        reach = left + box.width + gap;
    }

    const lefts: number[] = [];
    let next = Number.POSITIVE_INFINITY;

    for (let index = row.length - 1; index >= 0; index -= 1) {
        const { box, hi } = row[index] ?? { box: { width: 0 }, hi: 0 };
        const left = Math.min(forward[index] ?? hi, hi, next - gap - box.width);

        lefts.unshift(left);
        next = left;
    }

    return lefts;
};

/** One side's boxes placed tier by tier, or null when a tier cannot hold its boxes. */
const packSide = (side: Side, slots: Slot[], spacing: Spacing): PlacedLabel[] | null => {
    const tiers = [...new Set(slots.map(({ tier }) => tier))].toSorted((a, b) => a - b);
    const placed: PlacedLabel[] = [];

    for (const tier of tiers) {
        const clear = slots
            .filter((slot) => slot.tier > tier && !slot.loose)
            .map(({ box }) => box.x);
        const row: { box: LabelBox; loose: boolean; lo: number; hi: number }[] = [];

        for (const slot of slots.filter((each) => each.tier === tier)) {
            const bounds = boundsOf(slot.box, slot.loose ? 0 : tier, clear, spacing);

            if (bounds === null) {
                return null;
            }

            row.push({ box: slot.box, loose: slot.loose, ...bounds });
        }

        row.sort((a, b) => a.box.x - b.box.x || a.box.id.localeCompare(b.box.id));

        const lefts = packRow(row, spacing.gap);

        if (lefts === null) {
            return null;
        }

        row.forEach(({ box, loose }, index) => {
            const left = lefts[index] ?? 0;
            const leaderX = Math.min(
                Math.max(box.x, left + spacing.inset),
                left + box.width - spacing.inset,
            );

            placed.push({ ...box, side, tier, left, leaderX: loose ? null : leaderX });
        });
    }

    return placed;
};

/** How far a side's boxes sit from their dots, in pixels. */
const displacement = (placed: PlacedLabel[]): number =>
    placed.reduce((sum, { x, left, width }) => sum + Math.abs(left + width / 2 - x), 0);

/**
 * Places labels above and below a horizontal axis so no two boxes overlap, every box
 * stays inside [0, width], and no leader from a dot to its box crosses another box.
 * Labels go in order of x, each to the nearest tier that holds it, on the side where it
 * moves the boxes least, above on a tie. A label no tier holds, which takes several dots
 * nearly at one x on a narrow plot, goes alone to a new tier above without a leader.
 * The result is in input order.
 */
export const layoutLabels = ({
    labels,
    width,
    gap = 8,
    inset = 4,
    shift = 160,
}: {
    labels: LabelBox[];
    width: number;
    gap?: number;
    inset?: number;
    shift?: number;
}): PlacedLabel[] => {
    const spacing: Spacing = { width, gap, inset, shift };
    const slots = new Map<string, Slot>();
    const pack = (side: Side, extra?: Slot): PlacedLabel[] | null =>
        packSide(
            side,
            [
                ...[...slots.values()].filter((slot) => slot.side === side),
                ...(extra ? [extra] : []),
            ],
            spacing,
        );
    const ordered = labels.toSorted((a, b) => a.x - b.x || a.id.localeCompare(b.id));

    for (const box of ordered) {
        let choice: Slot | undefined;

        for (let tier = 0; tier < labels.length && choice === undefined; tier += 1) {
            let best = Number.POSITIVE_INFINITY;

            for (const side of SIDES) {
                const slot: Slot = { box, side, tier, loose: false };
                const after = pack(side, slot);

                if (after !== null) {
                    const moved = displacement(after) - displacement(pack(side) ?? []);

                    if (moved < best) {
                        best = moved;
                        choice = slot;
                    }
                }
            }
        }

        const outer = Math.max(-1, ...[...slots.values()].map(({ tier }) => tier)) + 1;

        slots.set(box.id, choice ?? { box, side: 'above', tier: outer, loose: true });
    }

    const placed = SIDES.flatMap((side) => pack(side) ?? []);

    return labels.flatMap(({ id }) => placed.filter((label) => label.id === id));
};

/** Estimated widths of a dot label's two lines, in pixels, at the chart's type sizes. */
export const DOT_LABEL_TYPE = { name: 12.5, value: 18 } as const;

/** A generous estimate of a line's width: about 0.56 em per character in Outfit. */
const textWidth = (text: string, size: number): number => Math.ceil(text.length * size * 0.56);

/** The headline's own label in the dot plot. */
export const headlineLabel = (year: number): string => `OECD headline in ${year}`;

/**
 * The labels of a dot plot of `counts`: each published count's name over its value in
 * `currency`, and the OECD headline's one-line label, each at its dot's x from `xOf`.
 */
export const dotLabelBoxes = (
    counts: CountValue[],
    year: number,
    xOf: (value: number) => number,
    currency: string,
): LabelBox[] =>
    counts.flatMap(({ key, value }) => {
        if (value === null) {
            return [];
        }

        const width =
            key === 'headline'
                ? textWidth(headlineLabel(year), DOT_LABEL_TYPE.name)
                : Math.max(
                      textWidth(COUNT_LABELS[key], DOT_LABEL_TYPE.name),
                      textWidth(formatCompact(value, currency), DOT_LABEL_TYPE.value),
                  );

        return [{ id: key, x: xOf(value), width }];
    });

/** The counts the dot plot draws. */
export const DOT_PLOT_COUNTS: readonly CountKey[] = COUNTS;
/** The counts the bridge draws. */
export const BRIDGE_COUNTS: readonly CountKey[] = ['gross', 'net', 'grantEquivalent'];

/**
 * Axis ticks for a donor's chart of `keys`, over every year and both price bases, so
 * changing the year or the prices never rescales the chart. Only another donor or
 * currency does.
 */
export const donorTicks = (
    data: CountsData,
    donor: Donor,
    keys: readonly SeriesKey[],
): number[] => {
    const values = keys.flatMap((key) =>
        (['current', 'constant'] as const).flatMap((prices) =>
            donor.series[key][prices].filter((value) => value !== null),
        ),
    );

    return valueTicks(Math.min(0, ...values), Math.max(0, ...values));
};

/** About how many intervals the dot plot's axis divides into. */
const DOT_INTERVALS = 5;

/**
 * Axis ticks for the dot plot of a donor's counts in a year, over both price bases, so
 * switching prices never rescales it. Dots encode position, so the axis need not start
 * at zero. It starts at a tick at or below the smaller of half the OECD headline (half
 * gross disbursements where the headline is missing) and the smallest count, never
 * below zero unless a count is, and ends at a tick at or above the largest count. With
 * no count published that year, the axis spans the donor's counts over every year.
 */
export const dotTicks = (data: CountsData, donor: Donor, year: number): number[] => {
    const both = (key: CountKey): number[] =>
        (['current', 'constant'] as const).flatMap(
            (prices) => valueAt(data, donor, key, year, prices) ?? [],
        );
    const values = DOT_PLOT_COUNTS.flatMap(both);

    if (values.length === 0) {
        return donorTicks(data, donor, DOT_PLOT_COUNTS);
    }

    const anchor = both('headline').length > 0 ? both('headline') : both('gross');
    const half = anchor.length > 0 ? Math.min(...anchor) / 2 : 0;
    const smallest = Math.min(...values);
    const largest = Math.max(...values);
    const low = Math.min(Math.max(0, half), smallest);
    const span = largest > low ? largest - low : Math.abs(largest) || 1;
    const raw = span / DOT_INTERVALS;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / magnitude;
    const step =
        (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
    const first = Math.floor(low / step);
    const last = Math.max(Math.ceil(largest / step), first + 1);

    return Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step);
};
