import assert from 'node:assert/strict';
import test from 'node:test';

import { flowLayers, pillarLayers, readingAt, stackExtent, valueTicks } from './chart.ts';
import { context, flow, SAMPLE } from './fixture.mts';
import { formatMoney } from './format.ts';
import {
    BALANCED_PANEL_MAX_LOSS,
    climateBars,
    climateTotals,
    debtContexts,
    scopeDebt,
    scopeDonors,
    scopeFlows,
    scopePillars,
    totalPopulation,
} from './groups.ts';
import { flowAt } from './profile.ts';

const ALL = { kind: 'group', key: 'all' } as const;

test("a group's flows sum each series in 2024, remittances over a balanced panel", () => {
    const flows = scopeFlows(SAMPLE, ALL);

    assert.deepEqual(
        Object.values(flows).map((series) => formatMoney(series.values.at(-1) ?? 0)),
        ['$7.5bn', '$38m', '$5.3bn', '$4.4bn', '$4.9bn'],
    );
    assert.deepEqual(totalPopulation(SAMPLE, 2024), { value: 108.7e6, count: 5 });
});

test('OOF is summed for each group, with every year held and zero where none is recorded', () => {
    const oof = (key: 'all' | 'extreme' | 'high') => scopeFlows(SAMPLE, { kind: 'group', key }).oof;
    const [all, extreme, high] = [oof('all'), oof('extreme'), oof('high')];

    assert.equal(all.coverage, 'balanced');
    assert.deepEqual(all.counts, Array(10).fill(5));
    assert.deepEqual(
        [all, extreme, high].map((series) => formatMoney(series.values.at(-1) ?? 0)),
        ['$38m', '$23m', '$15m'],
    );
    assert.equal((extreme.values.at(-1) ?? 0) + (high.values.at(-1) ?? 0), all.values.at(-1));
});

test('the coverage of each group series is chosen from the data', () => {
    for (const series of [...Object.values(scopeFlows(SAMPLE, ALL)), scopePillars(SAMPLE, ALL)]) {
        assert.equal(
            series.coverage,
            series.balancedLoss < BALANCED_PANEL_MAX_LOSS ? 'balanced' : 'held',
        );
    }

    const flows = scopeFlows(SAMPLE, ALL);

    // Remittances: three contexts hold all ten years and carry 99.6% of the 2024 total.
    assert.equal(flows.remittances.coverage, 'balanced');
    assert.ok(Math.abs(flows.remittances.balancedLoss - 0.0038) < 0.0001);
    assert.ok(flows.remittances.counts.every((count) => count === 3));
    assert.equal(flows.oda.balancedLoss, 0);
    // Debt service: Equatorial Guinea, from 2018, carries 8% of 2024, so every figure counts.
    assert.equal(flows.debtService.coverage, 'held');
    assert.deepEqual(flows.debtService.counts, [3, 3, 3, 4, 4, 4, 4, 4, 4, 4]);
});

test('a group falls back to every figure held when the balanced panel loses 5% or more', () => {
    const gappy = context({ iso3: 'BBB', flows: [flow(2024, { remittances: 10 })] });
    const steady = context({
        flows: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((year) =>
            flow(year, { remittances: 90 }),
        ),
    });
    const flows = scopeFlows([steady, gappy], ALL);

    assert.equal(flows.remittances.coverage, 'held');
    assert.equal(flows.remittances.balancedLoss, 0.1);
    assert.deepEqual(flows.remittances.counts, [1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
    assert.equal(flows.remittances.values.at(-1), 100);

    // A single context keeps its own figures and its gaps.
    const own = scopeFlows([gappy], { kind: 'context', iso3: 'BBB' });

    assert.equal(own.oda.coverage, 'held');
    assert.deepEqual(own.oda.values, [null, null, null, null, null, null, null, null, null, 100]);
});

test('the group debt view sums a balanced panel of the IDS contexts not in arrears', () => {
    const members = debtContexts(SAMPLE, 'all');

    // Sudan is in arrears and South Sudan outside IDS.
    assert.deepEqual(
        members.map((c) => c.iso3),
        ['MOZ', 'GNQ', 'HTI'],
    );

    const view = scopeDebt(SAMPLE, ALL);
    const at2024 = view.points.find((point) => point.year === 2024);

    // Equatorial Guinea enters IDS after 2015, so the panel leaves it out.
    assert.deepEqual(view.iso3s, ['MOZ', 'HTI']);
    assert.equal(at2024?.oda, 4e9);
    assert.equal(at2024?.debt, 1.517e9);
    assert.equal(view.points.find((point) => point.year === 2030)?.oda, null);
});

test('a context outside IDS keeps its ODA line and has no debt figures', () => {
    const view = scopeDebt(SAMPLE, { kind: 'context', iso3: 'SSD' });

    assert.equal(view.covered, false);
    assert.ok(view.points.every((point) => point.debt === null));
    assert.ok((view.points.find((point) => point.year === 2024)?.oda ?? 0) > 0);

    const own = scopeDebt([context()], { kind: 'context', iso3: 'AAA' });

    assert.equal(own.covered, true);
    assert.equal(own.points[0]?.year, 2015);
    assert.equal(own.points.at(-1)?.year, 2033);
    assert.deepEqual(
        own.points.filter((p) => p.debt !== null).map((p) => [p.year, p.scheduled]),
        [
            [2024, false],
            [2026, true],
        ],
    );
});

test('climate sums 2024 and compares the scope with all 62, or the two tiers', () => {
    const contexts = [context(), context({ iso3: 'BBB', tier: 'high', climate: null })];

    assert.deepEqual(climateTotals(contexts), {
        adaptation: 60,
        mitigation: 30,
        crossCutting: 10,
        total: 100,
        count: 1,
    });
    assert.deepEqual(
        climateBars(contexts, ALL).map((bar) => [bar.label, bar.totals.count]),
        [
            ['Extreme 1', 1],
            ['High 1', 0],
        ],
    );
    assert.deepEqual(
        climateBars(contexts, { kind: 'context', iso3: 'BBB' }).map((bar) => bar.label),
        ['Alpha', 'All 2'],
    );
});

test('flow layers keep nulls and split a net FDI sum by sign', () => {
    const c = context({ flows: [flow(2023, { fdi: -40, remittances: null }), flow(2024)] });
    const layers = flowLayers(scopeFlows([c], { kind: 'context', iso3: 'AAA' }));

    assert.deepEqual(Object.fromEntries(layers.map((l) => [l.key, l.values.slice(-2)])), {
        oda: [100, 100],
        oof: [20, 20],
        remittances: [null, 50],
        fdi: [null, 50],
        debtService: [-30, -30],
        fdiOutflow: [-40, null],
    });
    assert.ok(layers.every((layer) => layer.values[0] === null));
    assert.deepEqual(stackExtent(layers), { low: -70, high: 220 });
    assert.deepEqual(valueTicks(-70, 220), [-100, 0, 100, 200, 300]);

    const [development] = pillarLayers(scopePillars([c], { kind: 'context', iso3: 'AAA' }));

    assert.equal(development?.values.length, 10);
    assert.equal(development?.values[0], null);
    assert.equal(development?.values.at(-1), 600);
});

test('readingAt carries the last figure forward and marks gaps', () => {
    const points = [
        { year: 2020, value: 5 },
        { year: 2021, value: null },
        { year: 2022, value: 7 },
    ];

    assert.deepEqual(readingAt(points, 2020), { kind: 'held', year: 2020, value: 5 });
    assert.deepEqual(readingAt(points, 2021), { kind: 'gap' });
    assert.deepEqual(readingAt(points, 2029), { kind: 'latest', year: 2022, value: 7 });
    assert.deepEqual(readingAt(points, 2019), { kind: 'before' });
    assert.deepEqual(readingAt([], 2020), { kind: 'before' });
});

test("the donor list fills six slots from the group's donors or the context", () => {
    const donor = (name: string) => ({ name, value: 1, change2025: null });
    const groups = {
        all: { donors: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(donor) },
        extreme: { donors: [donor('X')] },
        high: { donors: [] },
    };
    const contexts = [context()];

    assert.deepEqual(
        scopeDonors(contexts, groups, ALL).map((d) => d?.name),
        ['A', 'B', 'C', 'D', 'E', 'F'],
    );
    assert.deepEqual(
        scopeDonors(contexts, groups, { kind: 'group', key: 'extreme' }).map(
            (d) => d?.name ?? null,
        ),
        ['X', null, null, null, null, null],
    );
    assert.deepEqual(
        scopeDonors(contexts, groups, { kind: 'context', iso3: 'AAA' }).map((d) => d?.name ?? null),
        ['IDA', null, null, null, null, null],
    );
});
