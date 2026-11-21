import assert from 'node:assert/strict';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import { context, flow } from './fixture.mts';
import { figuresFromRows, money, recipes, type LiveInputs } from './live.ts';

const SPEC_ID = `spec_${'a'.repeat(32)}`;
const ref = {
    format_version: 1,
    members: [
        {
            parts: [],
            sentence: 'Gross ODA',
            spec: {
                spec_id: SPEC_ID,
                definition: { schema_version: 1, spec_id: SPEC_ID, identity: {} },
            },
            content_version: `cv_${'b'.repeat(32)}`,
            artifact: {
                digest: `sha256:${'c'.repeat(64)}`,
                rendering: { format: 'parquet', bundle: false },
            },
        },
    ],
};
const REFS = Object.fromEntries(
    [
        'aid-1',
        'oof-1',
        'donors2025',
        'donors2025-eu',
        'climate-total',
        'climate-adaptation',
        'climate-mitigation',
    ].map((key) => [key, { ref }]),
);
const LIVE: LiveInputs = {
    groups: { 'aid-1': ['country/AAA', 'country/BBB'] },
    purposes: {
        humanitarian: ['emergency food assistance'],
        peace: ['legal and judicial development'],
    },
    providers: { 'country/DEU': 'Germany', IDA: 'International Development Association' },
};
const TIERS = new Map([
    ['country/AAA', 'extreme'],
    ['country/BBB', 'high'],
]);

const byPlace = (place: string, year: number, value: number): Row => ({
    financingRecipient: `country/${place}`,
    time_period: String(year),
    value,
});
const byProvider = (provider: string, value: number, place?: string): Row => ({
    financingProvider: provider,
    time_period: '2024',
    value,
    ...(place === undefined ? {} : { financingRecipient: `country/${place}` }),
});

/** The rows of every recipe: AAA's 2024 aid of 1,000.5 is 300 humanitarian and 100 peace. */
const ROWS: Record<string, Row[]> = {
    'aid-1/total': [byPlace('AAA', 2024, 1000.5), byPlace('BBB', 2024, 50)],
    'aid-1/humanitarian': [byPlace('AAA', 2024, 300)],
    'aid-1/peace': [byPlace('AAA', 2024, 100)],
    'aid-1/donors': [
        byProvider('IDA', 400, 'AAA'),
        byProvider('country/DEU', 600, 'AAA'),
        byProvider('IDA', 50, 'BBB'),
    ],
    'aid-1/extreme': [byProvider('IDA', 400), byProvider('country/DEU', 600)],
    'aid-1/high': [byProvider('IDA', 50), { ...byProvider('IDA', 9), time_period: '2023' }],
    'oof-1/total': [byPlace('AAA', 2024, 20)],
    'donors2025/change': [
        { financingProvider: 'country/DEU', time_period: '2024/2025', value: -0.11414 },
    ],
    'donors2025-eu/change': [],
    'climate-total/total': [byPlace('AAA', 2024, 100)],
    'climate-adaptation/total': [byPlace('AAA', 2024, 60)],
    'climate-mitigation/total': [byPlace('AAA', 2024, 30)],
};
const COMMITTED = {
    contexts: [
        context({ iso3: 'AAA', tier: 'extreme', flows: [flow(2023), flow(2024)] }),
        context({
            iso3: 'BBB',
            tier: 'high',
            pillars: [{ year: 2024, development: 50, humanitarian: 0, peace: 0 }],
            climate: null,
        }),
    ],
    groups: {
        all: { donors: [] },
        extreme: { donors: [] },
        high: { donors: [] },
    },
};

test("recipes are the step's, in its order, with a tier filter only where a read mixes tiers", () => {
    const chains = recipes(REFS, LIVE, TIERS);

    assert.deepEqual(Object.keys(chains), [
        'aid-1/total',
        'aid-1/humanitarian',
        'aid-1/peace',
        'aid-1/donors',
        'aid-1/extreme',
        'aid-1/high',
        'oof-1/total',
        'donors2025/change',
        'donors2025-eu/change',
        'climate-total/total',
        'climate-adaptation/total',
        'climate-mitigation/total',
    ]);

    const tree = JSON.stringify(chains['aid-1/donors']!.tree());

    assert.match(tree, /"partition_by":\["destination"\]/);
    assert.match(JSON.stringify(chains['aid-1/humanitarian']!.tree()), /emergency food assistance/);
    assert.match(JSON.stringify(chains['aid-1/extreme']!.tree()), /country\/AAA/);
    assert.equal(
        Object.keys(
            recipes(REFS, LIVE, new Map([...TIERS].map(([place]) => [place, 'high']))),
        ).filter((key) => /extreme|high/.test(key)).length,
        1,
    );
});

test('figures from the rows replace the DFO figures and keep the rest', () => {
    const { contexts, groups } = figuresFromRows(ROWS, COMMITTED, LIVE);
    const [alpha, beta] = contexts;

    // 1,000.5 - 300 - 100 rounds half to even, as the step's Python does.
    assert.deepEqual(alpha!.pillars, [
        { year: 2024, development: 600, humanitarian: 300, peace: 100 },
    ]);
    assert.deepEqual(
        alpha!.flows.map(({ year, oda, oof, fdi }) => ({ year, oda, oof, fdi })),
        [
            { year: 2023, oda: null, oof: 0, fdi: 50 },
            { year: 2024, oda: 1000, oof: 20, fdi: 50 },
        ],
    );
    assert.deepEqual(alpha!.donors, [
        { name: 'Germany', value: 600, change2025: -0.1141 },
        { name: 'International Development Association', value: 400, change2025: null },
    ]);
    assert.deepEqual(alpha!.climate, { year: 2024, adaptation: 60, mitigation: 30, both: 10 });
    assert.equal(beta!.climate, null);
    assert.deepEqual(alpha!.population, COMMITTED.contexts[0]!.population);
    assert.deepEqual(
        groups.all.donors.map((donor) => [donor.name, donor.value]),
        [
            ['Germany', 600],
            ['International Development Association', 450],
        ],
    );
    assert.deepEqual(
        groups.high.donors.map((donor) => donor.value),
        [50],
    );
});

test('a pillar that comes back empty where the committed figure is above zero is refused', () => {
    assert.throws(
        () => figuresFromRows({ ...ROWS, 'aid-1/humanitarian': [] }, COMMITTED, LIVE),
        /AAA 2024: no humanitarian aid/,
    );
});

test('a provider live.json does not name is refused', () => {
    assert.throws(
        () =>
            figuresFromRows(
                { ...ROWS, 'aid-1/donors': [byProvider('country/FRA', 1, 'AAA')] },
                COMMITTED,
                LIVE,
            ),
        /country\/FRA/,
    );
});

test('money takes a half to the even neighbour', () => {
    assert.deepEqual([0.5, 1.5, 2.5, -2.5, 2.4, 2.6].map(money), [0, 2, 2, -2, 2, 3]);
});
