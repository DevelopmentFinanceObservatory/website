import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CountsData, Definition, Donor } from '../_data/types.ts';

import {
    bridge,
    bridgeRows,
    countDefinition,
    countsFor,
    definitionParts,
    findDonor,
    formatCompact,
    formatShare,
    formatTick,
    formatUsd,
    headlineSegments,
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
        rangeSentence('France', 2025, countsFor(counts, france(), 2025, 'current')),
        "France's ODA in 2025 was $13.9bn to $17.5bn, depending on the count.",
    );
});

test('rangeSentence leaves out commitments, which fall below every disbursed count for the UK in 2024', () => {
    const uk = countsFor(counts, donorById('country/GBR'), 2024, 'current');

    assert.equal(formatUsd(uk.find(({ key }) => key === 'commitments')?.value ?? 0), '$16.2bn');
    assert.equal(
        rangeSentence('the United Kingdom', 2024, uk),
        "the United Kingdom's ODA in 2024 was $16.3bn to $18.0bn, depending on the count.",
    );
});

test('rangeSentence handles one count, no counts and a plural name', () => {
    const one = [
        { key: 'gross' as const, value: 1200 },
        { key: 'net' as const, value: null },
    ];

    assert.equal(
        rangeSentence('DAC countries', 2020, one),
        "DAC countries' ODA in 2020 was $1.2bn.",
    );
    assert.equal(rangeSentence('France', 2020, [{ key: 'net', value: null }]), null);
});

test('bridge steps France 2024 from gross to grant equivalents and to net', () => {
    const steps = bridge(counts, france(), 2024, 'current');

    assert.ok(steps.toGrantEquivalent && steps.toNet);
    assert.equal(formatUsd(steps.toGrantEquivalent.gross), '$18.1bn');
    assert.equal(formatUsd(steps.toGrantEquivalent.grantEquivalent), '$15.4bn');
    assert.equal(
        nonGrantSentence(steps.toGrantEquivalent),
        'Of $18.1bn gross, $4.7bn was loans and other non-grant instruments; counting only their concessional part removes $2.6bn.',
    );
    assert.ok(
        Math.abs(steps.toNet.gross - steps.toNet.received - steps.toNet.net) < 1e-9,
        'gross minus amounts received is net',
    );
});

test('bridgeRows labels a step above gross as a rise and adds a note, for UK 2024 and Finland 2020', () => {
    const uk = bridge(counts, donorById('country/GBR'), 2024, 'current');
    const ukStep = bridgeRows(uk).toGrantEquivalent?.[1];

    assert.equal(ukStep?.label, STEP_LABELS.toGrantEquivalent.rise);
    assert.equal(ukStep && formatCompact(ukStep.value), '1.4B');
    assert.equal(nonGrantSentence(uk.toGrantEquivalent), null);
    assert.equal(riseNote('toGrantEquivalent', uk), RISE_NOTES.toGrantEquivalent);
    assert.equal(riseNote('toNet', uk), null);
    assert.equal(bridgeRows(uk).toNet?.[1]?.label, STEP_LABELS.toNet.fall);

    const finland = bridge(counts, donorById('country/FIN'), 2020, 'current');
    const finlandStep = bridgeRows(finland).toNet?.[1];

    assert.equal(finlandStep?.label, STEP_LABELS.toNet.rise);
    assert.ok(finlandStep && finlandStep.value > 0);
    assert.equal(riseNote('toNet', finland), RISE_NOTES.toNet);

    const franceSteps = bridge(counts, france(), 2024, 'current');
    assert.equal(
        bridgeRows(franceSteps).toGrantEquivalent?.[1]?.label,
        STEP_LABELS.toGrantEquivalent.fall,
    );
    assert.equal(riseNote('toGrantEquivalent', franceSteps), null);
});

test('nonGrantSentence is null when the gap exceeds non-grants, as for Spain in 2018', () => {
    const spain = bridge(counts, donorById('country/ESP'), 2018, 'current').toGrantEquivalent;

    assert.ok(spain && spain.nonGrants !== null && spain.notCounted > spain.nonGrants);
    assert.equal(nonGrantSentence(spain), null);
});

test('bridge has no grant-equivalent step before 2018, and 2025 has no non-grant figure', () => {
    const early = bridge(counts, france(), 2017, 'current');
    const preliminary = bridge(counts, france(), 2025, 'current');

    assert.equal(early.toGrantEquivalent, null);
    assert.ok(early.toNet);
    assert.ok(preliminary.toGrantEquivalent);
    assert.equal(preliminary.toGrantEquivalent.nonGrants, null);
    assert.equal(nonGrantSentence(preliminary.toGrantEquivalent), null);
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

test('formatUsd writes billions with one decimal and small amounts in millions', () => {
    assert.deepEqual([17508.38, 350.4, 4.21, -2633.6].map(formatUsd), [
        '$17.5bn',
        '$350m',
        '$4.2m',
        '-$2.6bn',
    ]);
});

test('formatUsd and formatCompact pick the unit after rounding', () => {
    assert.deepEqual([999.96, 9.96, -999.7].map(formatUsd), ['$1.0bn', '$10m', '-$1.0bn']);
    assert.deepEqual([999.96, 999_960, 0.99996].map(formatCompact), ['1.0B', '1.0T', '1.0M']);
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
    assert.deepEqual([17508.38, 350.4, 0.42, 1_234_567, -2633.6].map(formatCompact), [
        '17.5B',
        '350.4M',
        '420.0K',
        '1.2T',
        '-2.6B',
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

test('bridgeRows steps France 2024 down to net and grant equivalents', () => {
    const rows = bridgeRows(bridge(counts, france(), 2024, 'current'));

    assert.ok(rows.toNet && rows.toGrantEquivalent);
    assert.deepEqual(
        rows.toGrantEquivalent.map(({ kind, value }) => [kind, formatCompact(value)]),
        [
            ['total', '18.1B'],
            ['step', '-2.6B'],
            ['total', '15.4B'],
        ],
    );
    const [gross, step, net] = rows.toNet;
    assert.ok(gross && step && net);
    assert.equal(step.start, net.end);
    assert.equal(step.end, gross.end);
    assert.equal(bridgeRows(bridge(counts, france(), 2017, 'current')).toGrantEquivalent, null);
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
    assert.deepEqual([0, 500, 2500, 20000].map(formatTick), ['0', '500M', '2.5B', '20B']);
    assert.equal(formatShare(0.62664), '62.7%');
});

test('odaGniSentence measures the gap to the 0.7% target', () => {
    assert.equal(odaGniSentence(0.478), '0.22 percentage points short of the 0.7% target.');
    assert.equal(odaGniSentence(1.02), '0.32 percentage points above the 0.7% target.');
    assert.equal(odaGniSentence(0.7), 'At the 0.7% target.');
});
