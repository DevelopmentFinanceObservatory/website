import assert from 'node:assert/strict';
import test from 'node:test';

import { tokenAbout } from '../tokenAbout.ts';
import type { Assumption, SentenceToken, UnreadableSpec, Warning } from '../types.ts';
import { buildWhySummary, scopeAssumptions } from '../view.ts';
import { partialSpec } from './fixtures/partial.ts';

// Trimmed from dev API answers: inflation in Pakistan (one variable) and ODA
// from Germany (1,626 variables, the recipient role open).
const inflation = partialSpec({
    stat_vars: {
        member_count: 1,
        member_count_exact: false,
        served_count: 1,
        data_date_range: { start: '2000', end: '2022' },
    },
    shape: { label: 'Annual inflation, consumer prices' },
    entities: [{ ref: 'country/PAK', label: 'Pakistan', role: 'observationAbout' }],
    facets: { unit: { ref: 'SDG_PERCENT', label: 'Percentage' } },
    coverage: { kind: 'exact', observation_count: 23, dimensions: [] },
    resolution: {},
});

// The members door's answer for inflation, as definitionMembersReader
// returns it: its one StatVar.
const inflationMembers = {
    ok: true as const,
    members: [{ dcid: 'sdg/FP_CPI_TOTL_ZG', label: 'Annual inflation, consumer prices' }],
};

// The members door's answer for ODA from Germany: every served StatVar.
const odaMembers = {
    ok: true as const,
    members: Array.from({ length: 1626 }, (_, index) => ({
        dcid: `Amount_FinancialFlow_Gross_Disbursement_${index}`,
        label: `Official development assistance gross disbursements ${index}`,
    })),
};

const oda = partialSpec({
    stat_vars: { member_count: 1626, member_count_exact: true, served_count: 1626 },
    measure_label: 'gross disbursements (nominal)',
    shape: { label: 'gross disbursements (nominal, official development assistance)' },
    entities: [{ ref: 'country/DEU', label: 'Germany', role: 'origin' }],
    entity_options: [{ role: 'destination', options: [], truncated: true }],
    facets: { unit: { ref: 'CurrencyUSD', label: 'US Dollar' } },
    headline: { year: 2024, year_named: false },
    coverage: {
        kind: 'breadth',
        dimensions: [
            { label: 'recipients', count: 191 },
            { label: 'variables', count: 1626 },
        ],
    },
    resolution: {},
});

const odaWarnings: Warning[] = [
    { code: 'retrieval_score_weak', severity: 'info', message: 'weak' },
    {
        code: 'role_scope_defaulted',
        severity: 'warn',
        message:
            'no recipient was named; the answer was resolved across the 191 recipients with data from Germany.',
    },
];

// The assumption the ODA answer carries for the recipient role it left open.
const openRecipients: Assumption = {
    kind: 'open_role',
    binding_ref: 'where:',
    refs: [],
    text: 'every recipient',
};

const placeScope = (text: string): Assumption => ({
    kind: 'place_scope',
    binding_ref: 'where:',
    refs: [],
    text,
});

test('an unreadable spec counts no StatVars in the measure About or the Why panel', () => {
    // flattenSpec keeps the stat_vars that failed to read; served_count alone looks valid.
    const spec: UnreadableSpec = {
        spec_id: 'spec_unreadable',
        stat_vars_unreadable: true,
        stat_vars: { served_count: 3, member_count: '3' },
        measure_label: 'gross disbursements',
        open_axis_facts: [
            { property: 'crsPurpose', varies: true, distinct_count: 3, undeclared_count: 0 },
        ],
    };
    const measure: SentenceToken = {
        kind: 'slot',
        axis: 'what',
        text: 'gross disbursements',
        segment: 'heading',
    };
    const summary = buildWhySummary(spec);

    assert.deepEqual(tokenAbout(measure, spec).notes, []);
    assert.equal(summary.variables, null);
    assert.equal(summary.family, null);
});

test('one variable: the Measure row carries its code and no Variables group appears', () => {
    const part = { warnings: [], variable_text: 'inflation' };
    const summary = buildWhySummary(inflation, part, inflationMembers);

    assert.deepEqual(summary.rows, [
        {
            label: 'Measure',
            value: 'Annual inflation, consumer prices',
            code: 'sdg/FP_CPI_TOTL_ZG',
        },
        { label: 'Unit', value: 'Percentage' },
        { label: 'Years', value: '2000 to 2022' },
        { label: 'Place', value: 'Pakistan' },
    ]);
    assert.equal(summary.variables, null);
    assert.deepEqual(scopeAssumptions(inflation, [], []), []);
    // Until the members door answers, the row names the measure without a code.
    assert.deepEqual(buildWhySummary(inflation, part).rows[0], {
        label: 'Measure',
        value: 'Annual inflation, consumer prices',
    });
});

test('many variables: rows name the role scope and the list reads the members door', () => {
    const part = { warnings: [...odaWarnings], variable_text: 'official development assistance' };
    const summary = buildWhySummary(oda, part, odaMembers);

    assert.deepEqual(summary.rows, [
        { label: 'Measure', value: 'Gross disbursements (nominal)' },
        { label: 'Unit', value: 'US Dollar' },
        { label: 'Years', value: 'Latest is 2024' },
        { label: 'Provider', value: 'Germany' },
        { label: 'Recipients', value: 'All 191 with data' },
    ]);
    // No time_window_defaulted on the wire: the headline's year_named says it.
    assert.deepEqual(scopeAssumptions(oda, [openRecipients], odaWarnings), [
        'The question left this role open, so the answer covers every recipient from Germany.',
        'No year was named, so the counts are for 2024, the latest year with data.',
    ]);
    assert.equal(summary.variables?.count, 1626);
    assert.equal(summary.variables?.members.state, 'listed');
    assert.deepEqual(
        summary.variables?.members.state === 'listed'
            ? [summary.variables.members.items.length, summary.variables.members.items[0].dcid]
            : null,
        [1626, 'Amount_FinancialFlow_Gross_Disbursement_0'],
    );
    assert.deepEqual(buildWhySummary(oda, part).variables?.members, { state: 'loading' });
    assert.deepEqual(buildWhySummary(oda, part, { ok: false }).variables?.members, {
        state: 'failed',
    });
    assert.equal(
        summary.variables?.summary,
        'All 1,626 variables are gross disbursements (nominal, official development assistance).',
    );
});

// Coverage counts the variables with data in the answer's rows; the resolved
// membership is what the panel lists.
test('the resolved membership chooses the layout over the coverage variables count', () => {
    const part = { warnings: [], variable_text: 'official development assistance' };
    const variables = (count: number) => ({
        ...oda.coverage,
        dimensions: [{ label: 'variables', count }],
    });
    const three = { ok: true as const, members: odaMembers.members.slice(0, 3) };
    const one = { ok: true as const, members: odaMembers.members.slice(0, 1) };
    const unsettled = { member_count: 3, member_count_exact: false, served_count: null };

    // Coverage reports one variable, the members door lists three.
    for (const stat_vars of [
        unsettled,
        { member_count: 3, member_count_exact: true, served_count: 3 },
    ]) {
        const summary = buildWhySummary(
            partialSpec({ ...oda, stat_vars, coverage: variables(1) }),
            part,
            three,
        );

        assert.equal(summary.variables?.count, 3);
        assert.equal(summary.variables?.exact, true);
        assert.deepEqual(summary.variables?.members, {
            state: 'listed',
            items: three.members,
        });
        assert.deepEqual(summary.rows[0], {
            label: 'Measure',
            value: 'Gross disbursements (nominal)',
        });
    }

    // Coverage reports three, the members door lists one.
    const single = buildWhySummary(
        partialSpec({
            ...oda,
            stat_vars: { member_count: 3, member_count_exact: true, served_count: 1 },
            coverage: variables(3),
        }),
        part,
        one,
    );

    assert.equal(single.variables, null);
    assert.deepEqual(single.rows[0], {
        label: 'Measure',
        value: 'Official development assistance gross disbursements 0',
        code: 'Amount_FinancialFlow_Gross_Disbursement_0',
    });
    assert.equal(single.family, 'This answer uses 1 of 3 variables.');

    // Membership unsettled and the members still being read: the family's
    // floor fills the Variables group, whatever coverage counts.
    const pending = buildWhySummary(
        partialSpec({ ...oda, stat_vars: unsettled, coverage: variables(1) }),
        part,
    );

    assert.equal(pending.variables?.count, 3);
    assert.equal(pending.variables?.exact, false);
    assert.deepEqual(pending.variables?.members, { state: 'loading' });
});

test('many variables: the breakdown counts the variables by each value of an axis they differ on -- humanitarian aid from Germany', () => {
    const value = (dcid: string, label: string, count: number) => ({
        value: { ref: dcid, label },
        count,
    });
    const summary = buildWhySummary(
        partialSpec({
            ...oda,
            stat_vars: { member_count: 39, member_count_exact: true, served_count: 39 },
            slots: [
                {
                    key: {
                        axis: 'how',
                        property: { ref: 'crsTypeOfFinance' },
                        label: 'instrument',
                    },
                },
            ],
            open_axis_facts: [
                {
                    property: 'crsTypeOfFinance',
                    varies: true,
                    distinct_count: 2,
                    undeclared_count: 0,
                    values: [
                        value('CRSTypeOfFinance110', 'standard grant', 35),
                        value('CRSTypeOfFinance421', 'standard loan', 4),
                    ],
                },
                {
                    property: 'crsCooperationModality',
                    varies: true,
                    distinct_count: 7,
                    undeclared_count: 8,
                    values: [
                        value('C01', 'project-type intervention', 6),
                        value('B03', 'contribution to a pooled fund', 5),
                        value('B01', 'core support to NGOs', 5),
                        value('H01', 'development awareness', 5),
                        value('D02', 'other technical assistance', 4),
                        value('G01', 'administrative costs', 4),
                        value('E01', 'scholarships', 2),
                    ],
                },
                {
                    property: 'crsChannel',
                    varies: false,
                    distinct_count: 1,
                    undeclared_count: 0,
                    values: [value('Channel1', 'public sector', 39)],
                },
            ],
        }),
    );

    assert.deepEqual(summary.variables?.breakdown, [
        {
            title: 'By instrument',
            values: [
                { label: 'Standard grant', count: 35 },
                { label: 'Standard loan', count: 4 },
            ],
            more: 0,
        },
        {
            title: 'By cooperation modality',
            values: [
                { label: 'Project-type intervention', count: 6 },
                { label: 'Contribution to a pooled fund', count: 5 },
                { label: 'Core support to NGOs', count: 5 },
                { label: 'Development awareness', count: 5 },
                { label: 'Other technical assistance', count: 4 },
            ],
            more: 2,
        },
    ]);
});

// Trimmed from dev API answers that serve one variable of a larger family:
// life expectancy in Ethiopia (1 of at least 3) and GDP of Kenya's first
// candidate (1 of at least 38). Coverage counts the 1 variable served.
const singleOfFamily = [
    {
        description: 'life expectancy in Ethiopia',
        spec: partialSpec({
            stat_vars: {
                member_count: 3,
                member_count_exact: false,
                served_count: 1,
                data_date_range: { start: '1960', end: '2023' },
            },
            shape: { label: 'Life Expectancy' },
            entities: [{ ref: 'country/ETH', label: 'Ethiopia', role: 'observationAbout' }],
            facets: { unit: { ref: 'Year', label: 'Year' } },
            coverage: {
                kind: 'exact',
                dimensions: [
                    { label: 'sources', count: 1 },
                    { label: 'observations', count: 64 },
                    { label: 'variables', count: 1 },
                ],
            },
            headline: null,
        }),
        member: { dcid: 'LifeExpectancy_Person', label: 'Life Expectancy' },
        rows: [
            { label: 'Measure', value: 'Life Expectancy', code: 'LifeExpectancy_Person' },
            { label: 'Unit', value: 'Year' },
            { label: 'Years', value: '1960 to 2023' },
            { label: 'Place', value: 'Ethiopia' },
        ],
        family: 'This answer uses 1 of at least 3 variables.',
    },
    {
        description: 'GDP of Kenya',
        spec: partialSpec({
            stat_vars: {
                member_count: 38,
                member_count_exact: false,
                served_count: 1,
                data_date_range: { start: '1960', end: '2024' },
            },
            shape: { label: 'Nominal gross domestic product' },
            entities: [{ ref: 'country/KEN', label: 'Kenya', role: 'observationAbout' }],
            coverage: {
                kind: 'exact',
                dimensions: [
                    { label: 'sources', count: 1 },
                    { label: 'observations', count: 65 },
                    { label: 'variables', count: 1 },
                ],
            },
            headline: null,
        }),
        member: {
            dcid: 'Amount_EconomicActivity_GrossDomesticProduction_Nominal',
            label: 'Nominal gross domestic product',
        },
        rows: [
            {
                label: 'Measure',
                value: 'Nominal gross domestic product',
                code: 'Amount_EconomicActivity_GrossDomesticProduction_Nominal',
            },
            { label: 'Years', value: '1960 to 2024' },
            { label: 'Place', value: 'Kenya' },
        ],
        family: 'This answer uses 1 of at least 38 variables.',
    },
];

test('one variable of a larger family: laid out as one variable, the family size in its own note', () => {
    for (const { description, spec, member, rows, family } of singleOfFamily) {
        const summary = buildWhySummary(
            spec,
            { warnings: [], variable_text: null },
            { ok: true, members: [member] },
        );

        assert.deepEqual(summary.rows, rows, description);
        assert.equal(summary.variables, null, description);
        assert.equal(summary.family, family, description);
    }
});

test('each assumption becomes one sentence, and each scope warning names its row', () => {
    const cases: {
        description: string;
        spec: Record<string, unknown>;
        codes: string[];
        given: Assumption[];
        row: { label: string; value: string };
        assumptions: string[];
    }[] = [
        {
            description: 'no place named',
            spec: {
                stat_vars: { member_count: 3, member_count_exact: false, served_count: 1 },
                shape: { label: 'Life Expectancy' },
                entities: [],
                coverage: {
                    kind: 'exact',
                    dimensions: [
                        { label: 'places', count: 1649 },
                        { label: 'variables', count: 1 },
                    ],
                },
            },
            codes: ['place_scope_defaulted'],
            given: [placeScope('every place')],
            row: { label: 'Places', value: 'All 1,649 with data' },
            assumptions: ['No place was named, so the answer covers every place.'],
        },
        {
            // Trimmed from the dev API's "population" answer, which it
            // narrowed to the countries with data.
            description: 'no place named, the answer narrowed to countries',
            spec: {
                stat_vars: { member_count: 28, member_count_exact: false, served_count: 1 },
                shape: { label: 'Total population' },
                entities: [],
                coverage: {
                    kind: 'exact',
                    dimensions: [
                        { label: 'countries', count: 216 },
                        { label: 'observations', count: 65 },
                        { label: 'variables', count: 1 },
                    ],
                },
            },
            codes: ['place_scope_defaulted'],
            given: [placeScope('every country')],
            row: { label: 'Countries', value: 'All 216 with data' },
            assumptions: ['No place was named, so the answer covers every country.'],
        },
        {
            description: 'no provider named, the recipient bound',
            spec: {
                ...oda,
                entities: [{ ref: 'country/KEN', label: 'Kenya', role: 'destination' }],
                entity_options: [{ role: 'origin', options: [], truncated: true }],
                coverage: { kind: 'breadth', dimensions: [{ label: 'providers', count: 36 }] },
            },
            codes: ['role_scope_defaulted'],
            given: [{ ...openRecipients, binding_ref: 'origin:', text: 'every provider' }],
            row: { label: 'Providers', value: 'All 36 with data' },
            assumptions: [
                'The question left this role open, so the answer covers every provider to Kenya.',
                'No year was named, so the counts are for 2024, the latest year with data.',
            ],
        },
        {
            description: 'no year named, a broad answer counting its latest year',
            spec: oda,
            codes: ['time_window_defaulted'],
            given: [],
            row: { label: 'Years', value: 'Latest is 2024' },
            assumptions: [
                'No year was named, so the counts are for 2024, the latest year with data.',
            ],
        },
        {
            description: 'no year named, no headline year',
            spec: inflation,
            codes: ['time_window_defaulted'],
            given: [],
            row: { label: 'Years', value: '2000 to 2022' },
            assumptions: ['No year was named, so every year with data is included.'],
        },
        {
            description:
                'a role warning on a part that assumed nothing adds no sentence of its own',
            spec: { ...oda, entity_options: [] },
            codes: ['role_scope_defaulted'],
            given: [],
            row: { label: 'Provider', value: 'Germany' },
            assumptions: [
                'No year was named, so the counts are for 2024, the latest year with data.',
            ],
        },
    ];

    for (const { description, spec, codes, given, row, assumptions } of cases) {
        const warnings: Warning[] = codes.map(
            (code) =>
                odaWarnings.find((warning) => warning.code === code) ?? {
                    code,
                    severity: 'warn',
                    message: 'defaulted',
                },
        );
        const why = buildWhySummary(spec, { warnings, variable_text: null });

        assert.ok(
            why.rows.some((r) => r.label === row.label && r.value === row.value),
            description,
        );
        assert.deepEqual(scopeAssumptions(spec, given, warnings), assumptions, description);
    }
});

test('chosen: each facet axis gives its value and why, in source, method, unit order', () => {
    const spec = partialSpec({
        facets: {
            unit: { ref: 'CurrencyUSD', label: 'US Dollar', basis: 'fallback' },
            provenance: {
                ref: 'dc/base/WorldDevelopmentIndicators',
                label: 'WorldDevelopmentIndicators',
                basis: 'bound',
            },
            measurementMethod: { selection: 'per_series', basis: 'declared_default' },
        },
    });

    assert.deepEqual(buildWhySummary(spec).chosen, [
        { label: 'Source', value: 'World Development Indicators', reason: 'Set by your request.' },
        {
            label: 'Method',
            value: 'Differs by series',
            reason: 'Filled in from the default for this measure.',
        },
        {
            label: 'Unit',
            value: 'US Dollar',
            reason: 'Picked by the search, as the request left it open.',
        },
    ]);
});

test('a slot a declared default filled is stated once, as an assumption; no provenance adds a choice', () => {
    const filter = (provenance: string, label: string, ref: string) => ({
        key: { axis: 'how', property: { ref: label.replaceAll(' ', '') }, label },
        binding_kind: 'value',
        refs: [{ ref, label: ref }],
        provenance,
    });
    const spec = partialSpec({
        resolution: {
            slot_filters: [
                filter('declared_default', 'type of flow', 'ODA'),
                filter('binder', 'purpose', 'Health'),
                filter('measure_elected', 'finance type', 'Grant'),
            ],
        },
    });

    const defaulted: Assumption = {
        kind: 'declared_default',
        binding_ref: 'how:typeofflow',
        refs: ['ODA'],
        text: 'official development assistance',
    };

    assert.deepEqual(buildWhySummary(spec).chosen, []);
    assert.deepEqual(scopeAssumptions(spec, [defaulted]), [
        'No type of flow was named, so the answer uses official development assistance, the default for this measure.',
    ]);
    // A ref no slot names keeps the sentence without a label.
    assert.deepEqual(scopeAssumptions(spec, [{ ...defaulted, binding_ref: 'how:other' }]), [
        'The question left this open, so the answer uses official development assistance, the default for this measure.',
    ]);
});

test('sources carry the licence only when the answer serves one source', () => {
    const source = (ref: string) => ({ ref, label: ref });
    const download = { licence: { label: 'CCBY4' } };

    assert.equal(
        buildWhySummary(partialSpec({ download, resolution: { resolved_sources: [source('a')] } }))
            .sources[0]?.licence,
        'CCBY4',
    );
    assert.deepEqual(
        buildWhySummary(
            partialSpec({
                download,
                resolution: { resolved_sources: [source('a'), source('b')] },
            }),
        ).sources.map((entry) => entry.licence),
        [null, null],
    );
});
