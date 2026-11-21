import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import type { Groups } from '../_data/types.ts';

import { context, flow, PROFILES } from './fixture.mts';
import {
    deriveFigures,
    figuresFromRows,
    FiguresCheckError,
    money,
    recipes,
    type FiguresCheck,
    type LiveInputs,
} from './live.ts';

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
        'aid',
        'oof',
        'donors2025',
        'donors2025-eu',
        'climate-total',
        'climate-adaptation',
        'climate-mitigation',
    ].map((key) => [key, { ref }]),
);
const LIVE: LiveInputs = {
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
    'aid/total': [byPlace('AAA', 2024, 1000.5), byPlace('BBB', 2024, 50)],
    'aid/humanitarian': [byPlace('AAA', 2024, 300)],
    'aid/peace': [byPlace('AAA', 2024, 100)],
    'aid/donors': [
        byProvider('IDA', 400, 'AAA'),
        byProvider('country/DEU', 600, 'AAA'),
        byProvider('IDA', 50, 'BBB'),
    ],
    'aid/extreme': [byProvider('IDA', 400), byProvider('country/DEU', 600)],
    'aid/high': [byProvider('IDA', 50), { ...byProvider('IDA', 9), time_period: '2023' }],
    'oof/total': [byPlace('AAA', 2024, 20)],
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

test("recipes are the step's, in its order, each tier's sum filtered to that tier's recipients", () => {
    const chains = recipes(REFS, LIVE, TIERS);

    assert.deepEqual(Object.keys(chains), [
        'aid/total',
        'aid/humanitarian',
        'aid/peace',
        'aid/donors',
        'aid/extreme',
        'aid/high',
        'oof/total',
        'donors2025/change',
        'donors2025-eu/change',
        'climate-total/total',
        'climate-adaptation/total',
        'climate-mitigation/total',
    ]);

    const tree = JSON.stringify(chains['aid/donors']!.tree());

    assert.match(tree, /"partition_by":\["destination"\]/);
    assert.match(JSON.stringify(chains['aid/humanitarian']!.tree()), /emergency food assistance/);
    assert.match(
        JSON.stringify(chains['aid/extreme']!.tree()),
        /"destination","values":\["country\/AAA"\]/,
    );
    assert.match(
        JSON.stringify(chains['aid/high']!.tree()),
        /"destination","values":\["country\/BBB"\]/,
    );
    assert.equal(
        Object.keys(
            recipes(REFS, LIVE, new Map([...TIERS].map(([place]) => [place, 'high']))),
        ).filter((key) => /extreme|high/.test(key)).length,
        1,
    );
});

test('figures from the rows replace the DFO figures and keep the rest', () => {
    const { contexts, groups } = deriveFigures(ROWS, COMMITTED, LIVE);
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
        () => deriveFigures({ ...ROWS, 'aid/humanitarian': [] }, COMMITTED, LIVE),
        /AAA 2024: no humanitarian aid/,
    );
});

test('a provider live.json does not name is refused', () => {
    assert.throws(
        () =>
            deriveFigures(
                { ...ROWS, 'aid/donors': [byProvider('country/FRA', 1, 'AAA')] },
                COMMITTED,
                LIVE,
            ),
        /country\/FRA/,
    );
});

test('money takes a half to the even neighbour and gives no negative zero', () => {
    assert.deepEqual([0.5, 1.5, 2.5, -2.5, 2.4, 2.6].map(money), [0, 2, 2, -2, 2, 3]);
    assert.ok(Object.is(money(-0.3), 0));
});

test("a donor's change rounds a tie to even and leaves out a change that is not finite", () => {
    const changes = (value: number) =>
        deriveFigures(
            {
                ...ROWS,
                'donors2025/change': [
                    { financingProvider: 'country/DEU', time_period: '2024/2025', value },
                ],
            },
            COMMITTED,
            LIVE,
        ).contexts[0]!.donors.map((donor) => donor.change2025);

    // Python: round(0.03125, 4) is 0.0312, where toFixed gives 0.0313.
    assert.deepEqual(changes(0.03125), [0.0312, null]);
    assert.deepEqual(changes(Infinity), [null, null]);
});

const data = <T,>(name: string): T =>
    (JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')) as { data: T })
        .data;

// The trees of the step's recipes and the rows DFO computed for them, as fetch.py wrote them,
// and the figures it derived.
const FIXTURE = data<{
    recipes: Record<string, unknown>;
    rows: Record<string, { columns: string[]; rows: Row[string][][] }>;
}>('live-fixture.json');
const PINNED = {
    contexts: PROFILES,
    groups: data<Groups>('groups.json'),
};
const PINNED_LIVE = data<LiveInputs>('live.json');

/** Each recipe's rows, as `Dataset.toRows()` gives them. */
const pinnedRows = (): Record<string, Row[]> =>
    Object.fromEntries(
        Object.entries(FIXTURE.rows).map(([key, { columns, rows }]) => [
            key,
            rows.map((row) => Object.fromEntries(columns.map((column, at) => [column, row[at]]))),
        ]),
    );

test("the recipes build the trees fetch.py sent, from refs.json's and live.json's inputs", () => {
    const chains = recipes(
        data<Record<string, { ref: unknown }>>('refs.json'),
        PINNED_LIVE,
        new Map(PROFILES.map((each) => [`country/${each.iso3}`, each.tier])),
    );

    assert.deepStrictEqual(
        Object.fromEntries(Object.entries(chains).map(([key, chain]) => [key, chain.tree()])),
        FIXTURE.recipes,
    );
});

test('the pinned rows give profiles.json and groups.json exactly', () => {
    assert.deepStrictEqual(figuresFromRows(pinnedRows(), PINNED, PINNED_LIVE), PINNED);
});

/** The checks `figuresFromRows` names for the pinned rows that `change` mutates. */
const broken = (change: (rows: Record<string, Row[]>) => void): readonly FiguresCheck[] => {
    const rows = pinnedRows();

    change(rows);

    try {
        figuresFromRows(rows, PINNED, PINNED_LIVE);
    } catch (error) {
        if (error instanceof FiguresCheckError) {
            return error.checks;
        }

        throw error;
    }

    return [];
};

const eachRead = (figure: string) =>
    Object.keys(FIXTURE.rows).filter((key) => key.endsWith(figure));

test("figures that break the step's checks are refused, each check by its code", () => {
    // Three contexts with no aid recorded, which leaves 59.
    assert.deepEqual(
        broken((rows) => {
            const gone = new Set(PROFILES.slice(-3).map(({ iso3 }) => `country/${iso3}`));

            for (const key of eachRead('/total').filter((each) => each.startsWith('aid/'))) {
                rows[key] = rows[key]!.filter((row) => !gone.has(String(row.financingRecipient)));
            }
        }),
        ['contexts_without_aid'],
    );
    // No provider to the high-fragility contexts, so that group has no donors.
    assert.deepEqual(
        broken((rows) => {
            for (const key of eachRead('/high')) {
                rows[key] = [];
            }
        }),
        ['group_short_of_donors'],
    );
    // Sums by provider ten times the ODA they are drawn from.
    assert.deepEqual(
        broken((rows) => {
            for (const key of [...eachRead('/extreme'), ...eachRead('/high')]) {
                rows[key] = rows[key]!.map((row) => ({ ...row, value: Number(row.value) * 10 }));
            }
        }),
        ['donors_above_oda'],
    );
    // No OOF recorded.
    assert.deepEqual(
        broken((rows) => {
            for (const key of eachRead('/total').filter((each) => each.startsWith('oof/'))) {
                rows[key] = [];
            }
        }),
        ['oof_out_of_range'],
    );
});
