import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CountsData, Definition, Donor } from '../_data/types.ts';

import {
    bridge,
    bridgeBars,
    countDefinition,
    countsFor,
    currencyPrefix,
    definitionParts,
    dotLabelBoxes,
    DOT_PLOT_COUNTS,
    donorTicks,
    dotTicks,
    findDonor,
    formatAmount,
    formatCompact,
    formatShare,
    formatTick,
    headlineSegments,
    layoutLabels,
    type LabelBox,
    matchDonors,
    missingText,
    priceDefinition,
    headlineBasis,
    nonGrantSentence,
    odaGniSentence,
    rangeSentence,
    riseNote,
    RISE_NOTES,
    scope,
    STEP_LABELS,
    trendLines,
    valueTicks,
} from './counts.ts';

const read = <T,>(name: string): T =>
    JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')).data as T;

const counts = read<CountsData>('counts.json');
const definitions = read<Definition[]>('definitions.json');

const donorById = (id: string): Donor => {
    const donor = findDonor(counts, id);
    assert.ok(donor, id);
    return donor;
};

const france = (): Donor => donorById('country/FRA');

test('rangeSentence gives France 2025 from net to gross disbursements', () => {
    assert.equal(
        rangeSentence('France', 2025, countsFor(counts, france(), 2025, 'current'), 'USD'),
        "France's ODA in 2025 was $13.9bn to $17.5bn, depending on the definition.",
    );
});

test('rangeSentence leaves out commitments, which fall below every disbursed count for the UK in 2024', () => {
    const uk = countsFor(counts, donorById('country/GBR'), 2024, 'current');

    assert.equal(
        formatAmount(uk.find(({ key }) => key === 'commitments')?.value ?? 0, 'USD'),
        '$16.2bn',
    );
    assert.equal(
        rangeSentence('the United Kingdom', 2024, uk, 'USD'),
        "the United Kingdom's ODA in 2024 was $16.3bn to $18.0bn, depending on the definition.",
    );
});

test('rangeSentence handles one count, no counts and a plural name', () => {
    const one = [
        { key: 'gross' as const, value: 1200 },
        { key: 'net' as const, value: null },
    ];

    assert.equal(
        rangeSentence('DAC countries', 2020, one, 'USD'),
        "DAC countries' ODA in 2020 was $1.2bn.",
    );
    assert.equal(rangeSentence('France', 2020, [{ key: 'net', value: null }], 'USD'), null);
});

test('bridge steps France 2024 from gross to grant equivalents and to net', () => {
    const steps = bridge(counts, france(), 2024, 'current');

    assert.ok(steps.toGrantEquivalent && steps.toNet);
    assert.equal(formatAmount(steps.toGrantEquivalent.gross, 'USD'), '$18.1bn');
    assert.equal(formatAmount(steps.toGrantEquivalent.grantEquivalent, 'USD'), '$15.4bn');
    assert.equal(
        nonGrantSentence(steps.toGrantEquivalent, 'USD'),
        'Of $18.1bn gross, $4.7bn was loans and other non-grant instruments, which grant equivalents count only for their concessional part.',
    );
    assert.ok(
        Math.abs(steps.toNet.gross - steps.toNet.received - steps.toNet.net) < 1e-9,
        'gross minus amounts received is net',
    );
});

test('bridgeBars labels a step above gross as a rise and adds a note, for UK 2024 and Finland 2020', () => {
    const uk = bridge(counts, donorById('country/GBR'), 2024, 'current');
    const ukStep = bridgeBars(uk).toGrantEquivalent?.step;

    assert.equal(ukStep?.label, STEP_LABELS.toGrantEquivalent.rise);
    assert.equal(ukStep && formatCompact(ukStep.value, 'USD'), '$1.4B');
    assert.equal(nonGrantSentence(uk.toGrantEquivalent, 'USD'), null);
    assert.equal(riseNote('toGrantEquivalent', uk), RISE_NOTES.toGrantEquivalent);
    assert.equal(riseNote('toNet', uk), null);
    assert.equal(bridgeBars(uk).toNet?.step.label, STEP_LABELS.toNet.fall);

    const finland = bridge(counts, donorById('country/FIN'), 2020, 'current');
    const finlandStep = bridgeBars(finland).toNet?.step;

    assert.equal(finlandStep?.label, STEP_LABELS.toNet.rise);
    assert.ok(finlandStep && finlandStep.value > 0);
    assert.equal(riseNote('toNet', finland), RISE_NOTES.toNet);

    const franceSteps = bridge(counts, france(), 2024, 'current');
    assert.equal(
        bridgeBars(franceSteps).toGrantEquivalent?.step.label,
        STEP_LABELS.toGrantEquivalent.fall,
    );
    assert.equal(riseNote('toGrantEquivalent', franceSteps), null);
});

test('nonGrantSentence is null when the gap exceeds non-grants, as for Spain in 2018', () => {
    const spain = bridge(counts, donorById('country/ESP'), 2018, 'current').toGrantEquivalent;

    assert.ok(spain && spain.nonGrants !== null && spain.notCounted > spain.nonGrants);
    assert.equal(nonGrantSentence(spain, 'USD'), null);
});

test('bridge has no grant-equivalent step before 2018, and 2025 has no non-grant figure', () => {
    const early = bridge(counts, france(), 2017, 'current');
    const preliminary = bridge(counts, france(), 2025, 'current');

    assert.equal(early.toGrantEquivalent, null);
    assert.ok(early.toNet);
    assert.ok(preliminary.toGrantEquivalent);
    assert.equal(preliminary.toGrantEquivalent.nonGrants, null);
    assert.equal(nonGrantSentence(preliminary.toGrantEquivalent, 'USD'), null);
});

test('the headline follows net flows to 2017 and grant equivalents from 2018', () => {
    assert.equal(headlineBasis(2017), 'net');
    assert.equal(headlineBasis(2018), 'grantEquivalent');

    const donor = france();
    for (const year of [2017, 2018, 2024]) {
        const values = Object.fromEntries(
            countsFor(counts, donor, year, 'constant').map(({ key, value }) => [key, value]),
        );
        assert.equal(values.headline, values[headlineBasis(year)], `France ${year}`);
    }
});

test('constant prices equal current prices in the base year', () => {
    const at = (prices: 'current' | 'constant') =>
        countsFor(counts, france(), counts.baseYear, prices).map(({ value }) => value);

    assert.deepEqual(at('constant'), at('current'));
});

test('definitionParts composes a count from graph nodes and the price basis', () => {
    const ids = (parts: Definition[]) => parts.map(({ id }) => id);

    assert.deepEqual(ids(definitionParts('net', 'current', definitions)), [
        'Net',
        'Disbursement',
        'Nominal',
    ]);
    assert.deepEqual(ids(definitionParts('headline', 'constant', definitions)), [
        'oecdHeadline',
        'constantPrices',
    ]);
    assert.throws(() => definitionParts('gross', 'current', []), /no entry for "Gross"/);
});

const usd = (millions: number): string => formatAmount(millions, 'USD');
const compact = (millions: number): string => formatCompact(millions, 'USD');

test('formatAmount writes billions with one decimal and small amounts in millions', () => {
    assert.deepEqual([17508.38, 350.4, 4.21, -2633.6].map(usd), [
        '$17.5bn',
        '$350m',
        '$4.2m',
        '-$2.6bn',
    ]);
});

test('formatAmount and formatCompact pick the unit after rounding', () => {
    assert.deepEqual([999.96, 9.96, -999.7, 999_960, 2_625_000].map(usd), [
        '$1.0bn',
        '$10m',
        '-$1.0bn',
        '$1.0tn',
        '$2.6tn',
    ]);
    assert.deepEqual([999.96, 999_960, 0.99996].map(compact), ['$1.0B', '$1.0T', '$1.0M']);
});

test('currencyPrefix marks each currency by a symbol that names it, spaced after letters', () => {
    assert.deepEqual(['USD', 'EUR', 'AUD', 'JPY', 'SEK', 'ZZZ'].map(currencyPrefix), [
        '$',
        '€',
        'A$',
        'JP¥',
        'SEK ',
        'ZZZ ',
    ]);
    assert.equal(formatAmount(-2633.6, 'EUR'), '-€2.6bn');
    assert.equal(formatCompact(350.4, 'SEK'), 'SEK 350.4M');
});

test('scope splits gross ODA into bilateral and multilateral shares', () => {
    const inside = scope(counts, france(), 2024, 'current');

    assert.ok(inside.bilateralShare !== null && inside.multilateralShare !== null);
    assert.ok(Math.abs(inside.bilateralShare + inside.multilateralShare - 1) < 1e-9);
    assert.ok(inside.refugeeShare !== null && inside.refugeeShare > 0 && inside.refugeeShare < 1);
    assert.ok(inside.odaGni !== null && inside.odaGni > 0);
    assert.equal(scope(counts, france(), 2025, 'current').bilateralShare, null);
});

test('formatCompact labels bars with one decimal and a K, M, B or T suffix', () => {
    assert.deepEqual([17508.38, 350.4, 0.42, 1_234_567, -2633.6].map(compact), [
        '$17.5B',
        '$350.4M',
        '$420.0K',
        '$1.2T',
        '-$2.6B',
    ]);
});

test('missingText says "not published" unless only the constant-price figure is missing', () => {
    const donor = france();
    const year = 2022;
    const index = counts.years.indexOf(year);
    const gap = counts.donors.find(
        ({ series }) =>
            series.grantEquivalent.current[index] !== null &&
            series.grantEquivalent.constant[index] === null,
    );

    assert.equal(missingText(counts, donor, 'commitments', 2025, 'current'), 'not published');
    assert.equal(missingText(counts, donor, 'commitments', 2025, 'constant'), 'not published');
    assert.ok(gap, 'some donor has a current but no constant grant-equivalent figure in 2022');
    assert.equal(
        missingText(counts, gap, 'grantEquivalent', year, 'constant'),
        'no constant-price figure',
    );
});

test('matchDonors lists countries before group totals, prefix matches first', () => {
    const all = matchDonors(counts.donors, '');
    const firstGroup = all.findIndex((donor) => donor.isGroup);

    assert.equal(all.length, counts.donors.length);
    assert.ok(firstGroup > 0 && all.slice(firstGroup).every((donor) => donor.isGroup));
    assert.equal(matchDonors(counts.donors, 'fra')[0]?.name, 'France');

    const dac = matchDonors(counts.donors, 'dac').map((donor) => donor.name);
    assert.ok(dac.length > 0 && dac.every((name) => name.toLowerCase().includes('dac')));
    assert.deepEqual(matchDonors(counts.donors, 'zzz'), []);
});

test('bridgeBars steps France 2024 down from gross to net and grant equivalents', () => {
    const bars = bridgeBars(bridge(counts, france(), 2024, 'current'));

    assert.ok(bars.toNet && bars.toGrantEquivalent);
    assert.deepEqual(
        [
            bars.toGrantEquivalent.gross,
            bars.toGrantEquivalent.step.value,
            bars.toGrantEquivalent.value,
        ].map(compact),
        ['$18.1B', '-$2.6B', '$15.4B'],
    );
    assert.equal(bars.toNet.target, 'net');
    assert.equal(bars.toNet.gross + bars.toNet.step.value, bars.toNet.value);
    assert.equal(bridgeBars(bridge(counts, france(), 2017, 'current')).toGrantEquivalent, null);
});

/** Overlaps, escapes and crossed or missing leaders in a layout; empty when clean. */
const layoutFaults = (boxes: LabelBox[], width: number): string[] => {
    const placed = layoutLabels({ labels: boxes, width });
    const faults: string[] = [];

    assert.deepEqual(
        placed.map(({ id }) => id),
        boxes.map(({ id }) => id),
    );

    for (const label of placed) {
        const right = label.left + label.width;

        if (label.left < 0 || right > width) {
            faults.push(`${label.id} leaves the plot`);
        }

        if (label.leaderX === null || label.leaderX < label.left || label.leaderX > right) {
            faults.push(`${label.id} has no leader into its box`);
        }

        if (label.tier > 0 && label.leaderX !== label.x) {
            faults.push(`${label.id} is out a tier but its leader is not straight`);
        }

        for (const other of placed.filter(({ side }) => side === label.side)) {
            const otherRight = other.left + other.width;

            if (
                other.tier === label.tier &&
                other.id > label.id &&
                other.left < right &&
                label.left < otherRight
            ) {
                faults.push(`${label.id} overlaps ${other.id}`);
            }

            if (other.tier < label.tier && label.x >= other.left && label.x <= otherRight) {
                faults.push(`${label.id}'s leader crosses ${other.id}`);
            }
        }
    }

    return faults;
};

test('layoutLabels keeps close dots legible for crowded donor-years at desktop and phone widths', () => {
    const cases = [
        ['country/FRA', 2025],
        ['country/AUS', 2025],
        ['country/GBR', 2024],
        ['DACCountriesTotal', 2024],
    ] as const;

    for (const [id, year] of cases) {
        const yearCounts = countsFor(counts, donorById(id), year, 'current');
        const ticks = dotTicks(counts, donorById(id), year);
        const low = ticks[0] ?? 0;
        const high = ticks.at(-1) ?? 1;

        for (const width of [560, 330, 300]) {
            // As CountDots draws it: the axis inset by 12px at each end, so an end dot is whole.
            const xOf = (value: number) => 12 + ((value - low) / (high - low)) * (width - 24);
            const boxes = dotLabelBoxes(yearCounts, year, xOf, 'USD');

            assert.ok(boxes.length >= 4, `${id} ${year} has a label per count and the headline`);
            assert.deepEqual(layoutFaults(boxes, width), [], `${id} ${year} at ${width}px`);
        }
    }
});

test('layoutLabels clamps a label at the edge inside the plot and drops the leader of a label no tier holds', () => {
    const [edge] = layoutLabels({ labels: [{ id: 'gross', x: 398, width: 120 }], width: 400 });

    assert.equal(edge?.left, 280);
    assert.equal(edge?.leaderX, 396);
    assert.deepEqual(layoutLabels({ labels: [], width: 400 }), []);

    const pile = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, x: 100, width: 150 }));
    const placed = layoutLabels({ labels: pile, width: 200 });

    assert.equal(placed.length, pile.length);
    assert.ok(placed.some(({ leaderX }) => leaderX === null));
    assert.ok(placed.every(({ left, width }) => left >= 0 && left + width <= 200));
});

test('donorTicks keeps France on one scale from zero across years and price bases', () => {
    const ticks = donorTicks(counts, france(), DOT_PLOT_COUNTS);
    const top = ticks.at(-1) ?? 0;
    const views = [
        [2015, 'current'],
        [2025, 'current'],
        [2025, 'constant'],
    ] as const;

    for (const [year, prices] of views) {
        const values = countsFor(counts, france(), year, prices).flatMap(({ value }) =>
            value === null ? [] : [value],
        );

        assert.ok(Math.max(...values) <= top, `${year} ${prices} fits the scale`);
    }

    // 2025 alone would stop at 20B; the scale stays wide enough for France's largest year.
    assert.equal(valueTicks(0, 17508.38).at(-1), 20000);
    assert.equal(top, 30000);
});

test('dotTicks starts France 2024 near half the headline, above zero, and ends at 20B', () => {
    for (const prices of ['current', 'constant'] as const) {
        const values = countsFor(counts, france(), 2024, prices).flatMap(({ value }) =>
            value === null ? [] : [value],
        );
        assert.ok(Math.min(...values) > 15000 && Math.max(...values) < 18600, prices);
    }

    assert.deepEqual(dotTicks(counts, france(), 2024), [7500, 10000, 12500, 15000, 17500, 20000]);
});

test('dotTicks covers both price bases, never goes below zero, and falls back to gross', () => {
    for (const donor of counts.donors) {
        for (const year of counts.years) {
            const ticks = dotTicks(counts, donor, year);
            const values = (['current', 'constant'] as const).flatMap((prices) =>
                countsFor(counts, donor, year, prices).flatMap(({ value }) =>
                    value === null ? [] : [value],
                ),
            );
            const where = `${donor.id} ${year}`;

            assert.ok((ticks[0] ?? -1) >= 0, `${where} starts at or above zero`);
            assert.ok(Math.min(...values) >= (ticks[0] ?? 0), `${where} covers the smallest`);
            assert.ok(Math.max(...values) <= (ticks.at(-1) ?? 0), `${where} covers the largest`);
        }
    }

    // With no headline, half of gross disbursements sets the floor: 10000 / 2 = 5000.
    const empty = counts.years.map(() => null);
    const only = (value: number) => counts.years.map((year) => (year === 2020 ? value : null));
    const bare: Donor = {
        ...france(),
        series: {
            ...france().series,
            gross: { current: only(10000), constant: only(10000) },
            net: { current: only(9000), constant: only(9000) },
            grantEquivalent: { current: empty, constant: empty },
            commitments: { current: empty, constant: empty },
            headline: { current: empty, constant: empty },
        },
    };

    assert.deepEqual(dotTicks(counts, bare, 2020), [5000, 6000, 7000, 8000, 9000, 10000]);
});

test('a lead basis holds the axes when the other basis lands inside them, and widens them once', () => {
    /** France with its current-price figures `scale` times its constant ones, or none. */
    const withCurrent = (scale: number | null): Donor => ({
        ...france(),
        series: Object.fromEntries(
            Object.entries(france().series).map(([key, { constant }]) => [
                key,
                {
                    constant,
                    current: constant.map((value) =>
                        value === null || scale === null ? null : value * scale,
                    ),
                },
            ]),
        ) as Donor['series'],
    });
    const charts = [
        (donor: Donor, lead: 'constant' | null) => donorTicks(counts, donor, DOT_PLOT_COUNTS, lead),
        (donor: Donor, lead: 'constant' | null) => dotTicks(counts, donor, 2024, lead),
    ];

    // The dot plot's floor follows its smallest count, so both bases alone would move it.
    assert.notDeepEqual(
        dotTicks(counts, withCurrent(0.95), 2024, null),
        dotTicks(counts, withCurrent(null), 2024, 'constant'),
    );

    for (const ticks of charts) {
        const drawn = ticks(withCurrent(null), 'constant');

        // Before the other basis lands, and after it lands inside the axes, they hold.
        assert.deepEqual(ticks(withCurrent(null), null), drawn);
        assert.deepEqual(ticks(withCurrent(0.95), 'constant'), drawn);

        // A figure that would fall off the axes widens them to both bases.
        const wide = withCurrent(3);

        assert.deepEqual(ticks(wide, 'constant'), ticks(wide, null));
        assert.notDeepEqual(ticks(wide, 'constant'), drawn);
    }
});

test('countDefinition and priceDefinition split definitionParts', () => {
    assert.deepEqual(definitionParts('gross', 'constant', definitions), [
        ...countDefinition('gross', definitions),
        priceDefinition('constant', definitions),
    ]);
});

test('trendLines leaves a gap for a missing year', () => {
    const lines = trendLines(counts, france(), 'current');
    const commitments = lines.find(({ key }) => key === 'commitments');

    assert.deepEqual(
        lines.map(({ key }) => key),
        ['gross', 'grantEquivalent', 'net', 'commitments'],
    );
    assert.equal(commitments?.values.length, counts.years.length);
    assert.equal(commitments?.values.at(-1), null);
});

test('headlineSegments splits the headline at 2018 so the two bases never join', () => {
    const [before, after] = headlineSegments(counts, france(), 'current');
    const at = (values: (number | null)[], year: number) => values[counts.years.indexOf(year)];

    assert.equal(before?.basis, 'net');
    assert.equal(after?.basis, 'grantEquivalent');
    assert.equal(at(before?.values ?? [], 2017), 11330.86);
    assert.equal(at(before?.values ?? [], 2018), null);
    assert.equal(at(after?.values ?? [], 2017), null);
    assert.equal(at(after?.values ?? [], 2018), 12136.17);
});

test('valueTicks starts at zero and covers the highest value', () => {
    assert.deepEqual(valueTicks(9000, 24910), [0, 10000, 20000, 30000]);
    assert.deepEqual(valueTicks(-30, 90), [-50, 0, 50, 100]);
    assert.deepEqual(valueTicks(0, 0), [0, 0.25, 0.5, 0.75, 1]);
});

test('formatTick drops a trailing .0 and formatShare keeps one decimal', () => {
    assert.deepEqual(
        [0, 500, 2500, 20000].map((millions) => formatTick(millions, 'USD')),
        ['0', '$500M', '$2.5B', '$20B'],
    );
    assert.equal(formatTick(2500, 'EUR'), '€2.5B');
    assert.equal(formatShare(0.62664), '62.7%');
});

test('odaGniSentence measures the gap to the 0.7% target', () => {
    assert.equal(odaGniSentence(0.478), '0.22 percentage points short of the 0.7% target.');
    assert.equal(odaGniSentence(1.02), '0.32 percentage points above the 0.7% target.');
    assert.equal(odaGniSentence(0.7), 'At the 0.7% target.');
});
