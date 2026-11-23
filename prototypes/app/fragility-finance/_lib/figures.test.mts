import assert from 'node:assert/strict';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import type { Profile } from './classification.ts';
import {
    deriveFigures,
    type FiguresCheck,
    FiguresCheckError,
    figuresFromRows,
    KNOWN,
    money,
    recipientGroups,
    type Refs,
    sources,
} from './figures.ts';
import { LAST_PAID_YEAR } from './profile.ts';

const profile = (iso3: string, tier: Profile['tier'] = 'extreme', rank = 1): Profile => ({
    iso3,
    name: iso3,
    tier,
    score: -3,
    rank,
    dimensions: {
        eco: { score: -1, category: 3 },
        env: { score: -2, category: 2 },
        hum: { score: -4, category: 1 },
        pol: { score: -1.5, category: 2 },
        sec: { score: -1.2, category: 3 },
        soc: { score: -2.5, category: 1 },
    },
});

/** A ref of one member whose definition binds `destination` to `places`. */
const refOf = (places: readonly string[] = []) => {
    const specId = `spec_${'a'.repeat(32)}`;
    const entities = places.length === 0 ? {} : { destination: places };

    return {
        format_version: 1,
        members: [
            {
                parts: [],
                sentence: 'Gross ODA',
                spec: {
                    spec_id: specId,
                    definition: { schema_version: 1, spec_id: specId, identity: { entities } },
                },
                content_version: `cv_${'b'.repeat(32)}`,
                artifact: {
                    digest: `sha256:${'c'.repeat(64)}`,
                    rendering: { format: 'parquet', bundle: false },
                },
            },
        ],
    };
};

const ROW_READS = [
    'donors2025',
    'donors2025-eu',
    'climate-total',
    'climate-adaptation',
    'climate-mitigation',
    'remittances',
    'fdi',
    'debtService',
    'population',
    'stunting',
    'water',
    'dtp3',
];

/** refs.json with one CRS aid read and its OOF read, both of `places`. */
const refsOf = (places: readonly string[], oof: readonly string[] = places): Refs => ({
    'aid-1': { ref: refOf(places) },
    'oof-1': { ref: refOf(oof) },
    ...Object.fromEntries(ROW_READS.map((key) => [key, { ref: refOf() }])),
});

const byRecipient = (place: string, year: number, value: number): Row => ({
    financingRecipient: `country/${place}`,
    time_period: String(year),
    value,
});
const byPlace = (place: string, year: number, value: number): Row => ({
    observationAbout: `country/${place}`,
    time_period: year,
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
const labelled = (provider: string, label: string): Row => ({
    financingProvider: provider,
    financingProvider_label: label,
    value: 1,
});
/** DAC1 rows of `provider`'s total ODA in 2024 and 2025. */
const dac1 = (provider: string, first: number, last: number): Row[] => [
    { financingProvider: provider, time_period: 2024, value: first },
    { financingProvider: provider, time_period: 2025, value: last },
];

const PROFILES = [profile('AAA'), profile('BBB', 'high', 2)];
const GROUPS = { 'aid-1': ['country/AAA', 'country/BBB'] };
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
    'aid-1': [
        labelled('IDA', 'International Development Association'),
        labelled('country/DEU', 'Germany'),
        labelled('country/DEU', 'Germany'),
    ],
    'oof-1': [byRecipient('AAA', 2024, 15), byRecipient('AAA', 2024, 5)],
    donors2025: dac1('country/DEU', 100_000, 88_586),
    'donors2025-eu': [],
    'climate-total/total': [byRecipient('AAA', 2024, 100)],
    'climate-adaptation/total': [byRecipient('AAA', 2024, 60)],
    'climate-mitigation/total': [byRecipient('AAA', 2024, 30)],
    remittances: [byPlace('AAA', 2023, 40), byPlace('AAA', 2024, 50.4)],
    fdi: [byPlace('AAA', 2024, -10), { ...byPlace('BBB', 2024, 0), value: Number.NaN }],
    debtService: [
        byRecipient('AAA', 2024, 30),
        byRecipient('AAA', 2025, 31),
        byRecipient('AAA', 2026, 40),
    ],
    population: [byPlace('AAA', 2024, 20.5)],
    stunting: [byPlace('AAA', 2020, 30), byPlace('AAA', 2023, 37.456)],
    water: [],
    dtp3: [byPlace('BBB', 2024, 0.125)],
};

test('the sources are two recipes and the rows per CRS aid read, the climate recipes, and the other reads as rows', () => {
    const found = sources(refsOf(GROUPS['aid-1']), GROUPS);
    const recipes = [
        'aid-1/purposes',
        'aid-1/providers',
        'climate-total/total',
        'climate-adaptation/total',
        'climate-mitigation/total',
    ];
    const rows = [
        'aid-1',
        'oof-1',
        'donors2025',
        'donors2025-eu',
        'remittances',
        'fdi',
        'debtService',
        'population',
        'stunting',
        'water',
        'dtp3',
    ];

    assert.deepEqual(Object.keys(found), [...recipes, ...rows]);
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
    assert.doesNotMatch(tree('aid-1/purposes'), /filter/);
    assert.match(tree('aid-1/purposes'), /crsPurpose/);
    assert.match(tree('aid-1/providers'), /"2024"/);
    assert.throws(() => sources({}, GROUPS), /refs.json holds no aid-1/);
});

test("the recipients of each CRS read come from its ref's definition", () => {
    const places = ['country/BBB', 'country/AAA'];

    assert.deepEqual(recipientGroups(refsOf(places), PROFILES), { 'aid-1': places });
    assert.throws(
        () => recipientGroups(refsOf(['country/AAA']), PROFILES),
        /do not hold each fragile context exactly once/,
    );
    assert.throws(
        () => recipientGroups(refsOf(['country/AAA', 'country/AAA']), PROFILES),
        /exactly once/,
    );
    assert.throws(
        () => recipientGroups(refsOf(places, ['country/AAA']), PROFILES),
        /oof-1 holds other recipients than aid-1/,
    );
    assert.throws(
        () => recipientGroups({ ...refsOf(places), 'aid-1': { ref: refOf() } }, PROFILES),
        /aid-1 binds no destination/,
    );
});

test('figures from the rows give every series of each context and each group', () => {
    const { contexts, groups } = deriveFigures(ROWS, PROFILES, GROUPS);
    const [alpha, beta] = contexts;
    const at = (year: number) => alpha!.flows.find((flow) => flow.year === year);

    assert.deepEqual(
        { ...alpha, pillars: [], flows: [], debtService: [], donors: [] },
        {
            ...PROFILES[0],
            pillars: [],
            flows: [],
            debtService: [],
            donors: [],
            climate: { year: 2024, adaptation: 60, mitigation: 30, both: 10 },
            population: { '2024': 20 },
            indicators: { stunting: { year: 2023, value: 37.46 }, water: null, dtp3: null },
        },
    );
    // 1,000.5 - 300 - 100 rounds half to even, as Python's round does.
    assert.deepEqual(alpha!.pillars, [
        { year: 2024, development: 600, humanitarian: 300, peace: 100 },
    ]);
    assert.deepEqual(
        alpha!.flows.map(({ year }) => year),
        [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    );
    assert.deepEqual(at(2023), {
        year: 2023,
        oda: null,
        oof: 0,
        remittances: 40,
        fdi: null,
        debtService: null,
    });
    assert.deepEqual(at(2024), {
        year: 2024,
        oda: 1000,
        oof: 20,
        remittances: 50,
        fdi: -10,
        debtService: 30,
    });
    assert.deepEqual(alpha!.debtService, [
        { year: 2024, value: 30, projected: false },
        { year: 2025, value: 31, projected: false },
        { year: 2026, value: 40, projected: true },
    ]);
    assert.deepEqual(alpha!.donors, [
        { name: 'Germany', value: 600, change2025: -0.1141 },
        { name: 'International Development Association', value: 400, change2025: null },
    ]);
    assert.equal(beta!.climate, null);
    assert.deepEqual(beta!.population, {});
    assert.deepEqual(beta!.debtService, []);
    assert.equal(beta!.flows.at(-1)?.fdi, null);
    // 0.125 is a half in binary, so it goes to the even neighbour.
    assert.deepEqual(beta!.indicators.dtp3, { year: 2024, value: 0.12 });
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
                PROFILES,
                GROUPS,
            ),
        /emergency food assistance is not a CRS purpose code/,
    );
});

test('a provider the aid reads give no label, or two, is refused', () => {
    assert.throws(
        () =>
            deriveFigures(
                { ...ROWS, 'aid-1/providers': [byProvider('country/FRA', 1, 'AAA')] },
                PROFILES,
                GROUPS,
            ),
        /no label for the provider country\/FRA/,
    );
    assert.throws(
        () =>
            deriveFigures(
                { ...ROWS, 'aid-1': [...ROWS['aid-1']!, labelled('IDA', 'IDA')] },
                PROFILES,
                GROUPS,
            ),
        /provider IDA has the labels/,
    );
});

test('money takes a half to the even neighbour and gives no negative zero', () => {
    assert.deepEqual([0.5, 1.5, 2.5, -2.5, 2.4, 2.6].map(money), [0, 2, 2, -2, 2, 3]);
    assert.ok(Object.is(money(-0.3), 0));
});

test("a donor's change rounds a tie to even and leaves out a change that is not finite", () => {
    const changes = (rows: Row[]) =>
        deriveFigures({ ...ROWS, donors2025: rows }, PROFILES, GROUPS).contexts[0]!.donors.map(
            (donor) => donor.change2025,
        );

    // 32 to 33 is 0.03125. Python: round(0.03125, 4) is 0.0312, where toFixed gives 0.0313.
    assert.deepEqual(changes(dac1('country/DEU', 32, 33)), [0.0312, null]);
    assert.deepEqual(changes(dac1('country/DEU', 0, 5)), [null, null]);
    assert.deepEqual(changes(dac1('country/DEU', 100, 90).slice(0, 1)), [null, null]);
});

test('every known value is for a year of debt service paid', () => {
    assert.ok(KNOWN.length > 0 && KNOWN.every(({ year }) => year <= LAST_PAID_YEAR));
});

// 62 contexts, the first Mozambique, in one CRS read, with rows that pass every check: each
// context gets 1bn in aid, 300m in OOF, six providers of 1m each, and debt service and
// population.
const PLACES = ['MOZ', ...Array.from({ length: 61 }, (_, index) => `P${index}`)];
const ALL_PROFILES = PLACES.map((iso3, index) =>
    profile(iso3, index < 20 ? 'extreme' : 'high', index + 1),
);
const ALL_GROUPS = { 'aid-1': PLACES.map((iso3) => `country/${iso3}`) };
const PROVIDERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MOZ_2024 = KNOWN.find(({ iso3, year }) => iso3 === 'MOZ' && year === 2024)!.value;

const passing = ({
    providers = PROVIDERS,
    given = 1e6,
    oof = 300e6,
}: { providers?: readonly string[]; given?: number; oof?: number } = {}): Record<
    string,
    Row[]
> => ({
    'aid-1/purposes': PLACES.map((iso3) => byPurpose(iso3, 11110, 1e9)),
    'aid-1/providers': PLACES.flatMap((iso3) =>
        providers.map((provider) => byProvider(provider, given, iso3)),
    ),
    'aid-1': providers.map((provider) => labelled(provider, `Provider ${provider}`)),
    'oof-1': PLACES.map((iso3) => byRecipient(iso3, 2024, oof)),
    donors2025: [],
    'donors2025-eu': [],
    'climate-total/total': [],
    'climate-adaptation/total': [],
    'climate-mitigation/total': [],
    remittances: [],
    fdi: [],
    debtService: PLACES.map((iso3) => byRecipient(iso3, 2024, iso3 === 'MOZ' ? MOZ_2024 : 1e6)),
    population: PLACES.map((iso3) => byPlace(iso3, 2024, 1e6)),
    stunting: [],
    water: [],
    dtp3: [],
});

/** Every check `rows` break, or none. */
const broken = (rows: Record<string, Row[]>): readonly FiguresCheck[] => {
    try {
        figuresFromRows(rows, ALL_PROFILES, ALL_GROUPS);

        return [];
    } catch (error) {
        assert.ok(error instanceof FiguresCheckError, String(error));

        return error.checks;
    }
};

/** `rows` with `key`'s rows for the first `count` places other than Mozambique left out. */
const without = (rows: Record<string, Row[]>, key: string, count: number) => ({
    ...rows,
    [key]: rows[key]!.filter(
        (row) =>
            !PLACES.slice(1, count + 1).some((iso3) =>
                [row.financingRecipient, row.observationAbout].includes(`country/${iso3}`),
            ),
    ),
});

test('figures of 62 contexts that hold every series pass the checks', () => {
    assert.deepEqual(broken(passing()), []);
});

test('each structural check refuses the figures that break it', () => {
    const cases: [FiguresCheck, Record<string, Row[]>][] = [
        // 59 of 62 with aid.
        ['contexts_without_aid', without(passing(), 'aid-1/purposes', 3)],
        // 44 with debt service.
        ['contexts_without_debt_service', without(passing(), 'debtService', 18)],
        // 59 with population.
        ['contexts_without_population', without(passing(), 'population', 3)],
        [
            'known_value_moved',
            {
                ...passing(),
                debtService: PLACES.map((iso3) =>
                    byRecipient(iso3, 2024, iso3 === 'MOZ' ? MOZ_2024 * 1.02 : 1e6),
                ),
            },
        ],
        ['group_short_of_donors', passing({ providers: PROVIDERS.slice(0, 5) })],
        // Six donors of 1bn to each context give 372bn of 62bn in ODA.
        ['donors_above_oda', passing({ given: 1e9 })],
        // 62 times 400m is 24.8bn.
        ['oof_out_of_range', passing({ oof: 400e6 })],
        // 18.6bn, but above zero in 48 contexts.
        ['oof_out_of_range', without(passing(), 'oof-1', 14)],
    ];

    for (const [check, rows] of cases) {
        assert.deepEqual(broken(rows), [check], check);
    }
});
