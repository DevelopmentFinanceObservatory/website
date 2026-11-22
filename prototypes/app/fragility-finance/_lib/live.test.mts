import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import type { Groups } from '../_data/types.ts';

import { context, flow, PROFILES } from './fixture.mts';
import {
    deriveFigures,
    figuresFromRows,
    FiguresCheckError,
    money,
    sources,
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
const byPlace = (place: string, year: number, value: number): Row => ({
    financingRecipient: `country/${place}`,
    time_period: String(year),
    value,
});
const byProvider = (provider: string, value: number, place: string, year = 2024): Row => ({
    financingProvider: provider,
    financingRecipient: `country/${place}`,
    time_period: String(year),
    value,
});
const byPurpose = (place: string, code: number | string, value: number): Row => ({
    financingRecipient: `country/${place}`,
    stat_var_crsPurpose: `CRSPurposeCode${code}`,
    time_period: '2024',
    value,
});
/** DAC1 rows of `provider`'s total ODA in 2024 and 2025. */
const dac1 = (provider: string, first: number, last: number): Row[] => [
    { financingProvider: provider, time_period: 2024, value: first },
    { financingProvider: provider, time_period: 2025, value: last },
];

/** The rows of every source: AAA's 2024 aid of 1,000.5 is 300 humanitarian, from two codes,
 *  100 peace, and the rest development. */
const ROWS: Record<string, Row[]> = {
    'aid-1/purposes': [
        byPurpose('AAA', 72010, 200),
        byPurpose('AAA', 72040, 100),
        byPurpose('AAA', 15210, 100),
        byPurpose('AAA', 11110, 600.5),
        byPurpose('BBB', 11110, 50),
    ],
    'aid-1/providers': [
        byProvider('IDA', 400, 'AAA'),
        byProvider('country/DEU', 600, 'AAA'),
        byProvider('IDA', 50, 'BBB'),
        byProvider('IDA', 9, 'BBB', 2023),
    ],
    'oof-1': [byPlace('AAA', 2024, 15), byPlace('AAA', 2024, 5)],
    donors2025: dac1('country/DEU', 100_000, 88_586),
    'donors2025-eu': [],
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

test('the sources are two recipes per CRS aid read, the climate recipes, and the OOF and DAC1 rows', () => {
    const found = sources(REFS, LIVE);
    const recipes = [
        'aid-1/purposes',
        'aid-1/providers',
        'climate-total/total',
        'climate-adaptation/total',
        'climate-mitigation/total',
    ];

    assert.deepEqual(Object.keys(found), [...recipes, 'oof-1', 'donors2025', 'donors2025-eu']);
    assert.deepEqual(
        Object.entries(found)
            .filter(([, source]) => 'recipe' in source)
            .map(([key]) => key),
        recipes,
    );

    const tree = (key: string) => {
        const source = found[key];

        assert.ok(source !== undefined && 'recipe' in source);

        return JSON.stringify(source.recipe.tree());
    };

    // No filter by purpose, which DFO sums on a slower path.
    assert.doesNotMatch(tree('aid-1/purposes'), /filter|emergency food assistance/);
    assert.match(tree('aid-1/purposes'), /crsPurpose/);
    assert.match(tree('aid-1/providers'), /"2024"/);
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
        () =>
            deriveFigures(
                {
                    ...ROWS,
                    'aid-1/purposes': ROWS['aid-1/purposes']!.filter(
                        (row) => !/7201|7204/.test(String(row.stat_var_crsPurpose)),
                    ),
                },
                COMMITTED,
                LIVE,
            ),
        /AAA 2024: no humanitarian aid/,
    );
});

test('a row without a purpose code is refused', () => {
    assert.throws(
        () =>
            deriveFigures(
                {
                    ...ROWS,
                    'aid-1/purposes': [
                        ...ROWS['aid-1/purposes']!,
                        {
                            ...byPurpose('AAA', 0, 5),
                            stat_var_crsPurpose: 'emergency food assistance',
                        },
                    ],
                },
                COMMITTED,
                LIVE,
            ),
        /emergency food assistance is not a CRS purpose code/,
    );
});

test('a provider live.json does not name is refused', () => {
    assert.throws(
        () =>
            deriveFigures(
                { ...ROWS, 'aid-1/providers': [byProvider('country/FRA', 1, 'AAA')] },
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
    const changes = (rows: Row[]) =>
        deriveFigures({ ...ROWS, donors2025: rows }, COMMITTED, LIVE).contexts[0]!.donors.map(
            (donor) => donor.change2025,
        );

    // 32 to 33 is 0.03125. Python: round(0.03125, 4) is 0.0312, where toFixed gives 0.0313.
    assert.deepEqual(changes(dac1('country/DEU', 32, 33)), [0.0312, null]);
    assert.deepEqual(changes(dac1('country/DEU', 0, 5)), [null, null]);
    assert.deepEqual(changes(dac1('country/DEU', 100, 90).slice(0, 1)), [null, null]);
});

const data = <T,>(name: string): T =>
    (JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')) as { data: T })
        .data;

// The trees of the step's recipes and the rows DFO computed for them, as fetch.py wrote them,
// and the figures it derived from those rows.
const STEP = data<{ recipes: Record<string, unknown> }>('live-fixture.json');
// The rows the page's sources gave at the same pinned versions, as live-sources.mts wrote them,
// each text cell an index into its column's values.
const FIXTURE = (
    JSON.parse(
        gunzipSync(
            readFileSync(new URL('../_data/live-sources-fixture.json.gz', import.meta.url)),
        ).toString('utf8'),
    ) as {
        data: Record<
            string,
            {
                tree?: unknown;
                columns: string[];
                values: Record<string, string[]>;
                rows: (number | null)[][];
            }
        >;
    }
).data;
const PINNED = {
    contexts: PROFILES,
    groups: data<Groups>('groups.json'),
};
const PINNED_LIVE = data<LiveInputs>('live.json');
const PINNED_SOURCES = sources(data<Record<string, { ref: unknown }>>('refs.json'), PINNED_LIVE);

/** Each source's rows, as `Dataset.toRows()` gives them. */
const pinnedRows = (): Record<string, Row[]> =>
    Object.fromEntries(
        Object.entries(FIXTURE).map(([key, { columns, values, rows }]) => [
            key,
            rows.map((row) =>
                Object.fromEntries(
                    columns.map((column, at) => {
                        const cell = row[at] ?? null;
                        const named = values[column];

                        return [column, named === undefined || cell === null ? cell : named[cell]];
                    }),
                ),
            ),
        ]),
    );

test("the sources' recipes are the trees recorded, and the climate recipes are the step's", () => {
    assert.deepEqual(Object.keys(FIXTURE), Object.keys(PINNED_SOURCES));

    for (const [key, source] of Object.entries(PINNED_SOURCES)) {
        assert.deepStrictEqual(
            'recipe' in source ? source.recipe.tree() : undefined,
            FIXTURE[key]!.tree,
            key,
        );

        if (key.startsWith('climate-')) {
            assert.deepStrictEqual(FIXTURE[key]!.tree, STEP.recipes[key], key);
        }
    }
});

test("the sources' rows at the pinned versions give profiles.json and groups.json exactly, as the step's recipes did", () => {
    assert.deepStrictEqual(figuresFromRows(pinnedRows(), PINNED, PINNED_LIVE), PINNED);
});

/** The checks `figuresFromRows` names for the pinned rows that `change` mutates. */
const broken = (
    change: (rows: Record<string, Row[]>) => void,
    committed: typeof PINNED = PINNED,
): readonly FiguresCheck[] => {
    const rows = pinnedRows();

    change(rows);

    try {
        figuresFromRows(rows, committed, PINNED_LIVE);
    } catch (error) {
        if (error instanceof FiguresCheckError) {
            return error.checks;
        }

        throw error;
    }

    return [];
};

const eachRead = (pattern: RegExp) => Object.keys(FIXTURE).filter((key) => pattern.test(key));
const HIGH = new Set(
    PROFILES.filter(({ tier }) => tier === 'high').map(({ iso3 }) => `country/${iso3}`),
);

test("figures that break the step's checks are refused, each check by its code", () => {
    // Three contexts with no aid recorded, which leaves 59. The committed figures hold no
    // pillars for them, so the pillar guard lets them through.
    const gone = new Set(PROFILES.slice(-3).map(({ iso3 }) => iso3));

    assert.deepEqual(
        broken(
            (rows) => {
                for (const key of eachRead(/\/purposes$/)) {
                    rows[key] = rows[key]!.filter(
                        (row) => !gone.has(String(row.financingRecipient).replace('country/', '')),
                    );
                }
            },
            {
                ...PINNED,
                contexts: PROFILES.map((each) =>
                    gone.has(each.iso3) ? { ...each, pillars: [] } : each,
                ),
            },
        ),
        ['contexts_without_aid'],
    );
    // No provider to the high-fragility contexts, so that group has no donors.
    assert.deepEqual(
        broken((rows) => {
            for (const key of eachRead(/\/providers$/)) {
                rows[key] = rows[key]!.filter((row) => !HIGH.has(String(row.financingRecipient)));
            }
        }),
        ['group_short_of_donors'],
    );
    // Sums by provider ten times the ODA they are drawn from.
    assert.deepEqual(
        broken((rows) => {
            for (const key of eachRead(/\/providers$/)) {
                rows[key] = rows[key]!.map((row) => ({ ...row, value: Number(row.value) * 10 }));
            }
        }),
        ['donors_above_oda'],
    );
    // No OOF recorded.
    assert.deepEqual(
        broken((rows) => {
            for (const key of eachRead(/^oof-/)) {
                rows[key] = [];
            }
        }),
        ['oof_out_of_range'],
    );
});
