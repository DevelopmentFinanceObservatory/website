import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CountsData, Definition, Donor } from '../_data/types.ts';

import {
    bridge,
    countsFor,
    definitionParts,
    findDonor,
    formatUsd,
    headlineBasis,
    nonGrantSentence,
    rangeSentence,
    scope,
} from './counts.ts';

const read = <T,>(name: string): T =>
    JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')).data as T;

const counts = read<CountsData>('counts.json');
const definitions = read<Definition[]>('definitions.json');

const france = (): Donor => {
    const donor = findDonor(counts, 'country/FRA');
    assert.ok(donor);
    return donor;
};

test('rangeSentence gives France 2025 from net to gross disbursements', () => {
    assert.equal(
        rangeSentence('France', 2025, countsFor(counts, france(), 2025, 'current')),
        "France's ODA in 2025 was $13.9bn to $17.5bn, depending on the count.",
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

test('scope splits gross ODA into bilateral and multilateral shares', () => {
    const inside = scope(counts, france(), 2024, 'current');

    assert.ok(inside.bilateralShare !== null && inside.multilateralShare !== null);
    assert.ok(Math.abs(inside.bilateralShare + inside.multilateralShare - 1) < 1e-9);
    assert.ok(inside.refugeeShare !== null && inside.refugeeShare > 0 && inside.refugeeShare < 1);
    assert.ok(inside.odaGni !== null && inside.odaGni > 0);
    assert.equal(scope(counts, france(), 2025, 'current').bilateralShare, null);
});
