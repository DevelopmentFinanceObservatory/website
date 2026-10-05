import assert from 'node:assert/strict';
import test from 'node:test';

import type { Warning } from '../types.ts';
import { buildWhySummary, scopeAssumptions } from '../view.ts';

// Trimmed from dev API answers: inflation in Pakistan (one variable) and ODA
// from Germany (1,626 variables, 200 on the wire, the recipient role open).
const inflation = {
    stat_vars: {
        items: [
            {
                ref: 'sdg/FP_CPI_TOTL_ZG',
                label: 'Annual inflation, consumer prices',
                data_date_range: { start: '2000', end: '2022' },
            },
        ],
        member_count: 1,
        member_count_exact: false,
        truncated: false,
    },
    shape: { label: 'Annual inflation, consumer prices' },
    entities: [{ ref: 'country/PAK', label: 'Pakistan', role: 'observationAbout' }],
    facets: { unit: { ref: 'SDG_PERCENT', label: 'Percentage' } },
    coverage: { kind: 'exact', observation_count: 23, dimensions: [] },
    resolution: {
        resolved_stat_vars: [{ dcid: 'sdg/FP_CPI_TOTL_ZG' }],
        pipeline_trace: [{ step: 'extract', ran: true, ms: 1006 }],
    },
};

const odaItems = Array.from({ length: 200 }, (_, index) => ({
    ref: `Amount_FinancialFlow_Gross_Disbursement_${index}`,
    label: `Official development assistance gross disbursements ${index}`,
    data_date_range: { start: '1992', end: '2009' },
}));

const oda = {
    stat_vars: { items: odaItems, member_count: 1626, member_count_exact: true, truncated: true },
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
    resolution: {
        // The full trace, which the panel ignores.
        resolved_stat_vars: Array.from({ length: 1626 }, (_, index) => ({ dcid: `sv/${index}` })),
    },
};

const odaWarnings: Warning[] = [
    { code: 'retrieval_score_weak', severity: 'info', message: 'weak' },
    {
        code: 'role_scope_defaulted',
        severity: 'warn',
        message:
            'no recipient was named; the answer was resolved across the 191 recipients with data from Germany.',
    },
];

test('one variable: the Measure row carries its code and no Variables group appears', () => {
    const summary = buildWhySummary(inflation, { warnings: [], variable_text: 'inflation' });

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
    assert.deepEqual(scopeAssumptions(inflation, []), []);
});

test('many variables: rows name the role scope and the list reads stat_vars, not the trace', () => {
    const summary = buildWhySummary(oda, {
        warnings: [...odaWarnings],
        variable_text: 'official development assistance',
    });

    assert.deepEqual(summary.rows, [
        { label: 'Measure', value: 'Gross disbursements (nominal)' },
        { label: 'Unit', value: 'US Dollar' },
        { label: 'Years', value: 'Latest is 2024' },
        { label: 'Donor', value: 'Germany' },
        { label: 'Recipients', value: 'All 191 with data' },
    ]);
    // No time_window_defaulted on the wire: the headline's year_named says it.
    assert.deepEqual(scopeAssumptions(oda, odaWarnings), [
        'No recipient was named, so every recipient with data from Germany is included.',
        'No year was named, so the counts are for 2024, the latest year with data.',
    ]);
    assert.equal(summary.variables?.count, 1626);
    assert.equal(summary.variables?.items.length, 200);
    assert.equal(summary.variables?.items[0].dcid, 'Amount_FinancialFlow_Gross_Disbursement_0');
    assert.equal(
        summary.variables?.summary,
        'All 1,626 variables are gross disbursements (nominal, official development assistance).',
    );
});

test('many variables: the breakdown counts the variables by each value of an axis they differ on -- humanitarian aid from Germany', () => {
    const value = (dcid: string, label: string, count: number) => ({
        value: { dcid, label },
        count,
    });
    const summary = buildWhySummary({
        ...oda,
        stat_vars: { items: odaItems.slice(0, 39), member_count: 39, truncated: false },
        slots: [
            { key: { axis: 'how', property: { dcid: 'crsTypeOfFinance' }, label: 'instrument' } },
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
    });

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
        spec: {
            stat_vars: {
                items: [
                    {
                        ref: 'LifeExpectancy_Person',
                        label: 'Life Expectancy',
                        data_date_range: { start: '1960', end: '2023' },
                    },
                ],
                member_count: 3,
                member_count_exact: false,
                truncated: true,
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
        },
        rows: [
            { label: 'Measure', value: 'Life Expectancy', code: 'LifeExpectancy_Person' },
            { label: 'Unit', value: 'Year' },
            { label: 'Years', value: '1960 to 2023' },
            { label: 'Place', value: 'Ethiopia' },
        ],
        family: 'This answer uses 1 of at least 3 Life Expectancy variables.',
    },
    {
        description: 'GDP of Kenya',
        spec: {
            stat_vars: {
                items: [
                    {
                        ref: 'Amount_EconomicActivity_GrossDomesticProduction_Nominal',
                        label: 'Nominal gross domestic product',
                        data_date_range: { start: '1960', end: '2024' },
                    },
                ],
                member_count: 38,
                member_count_exact: false,
                truncated: true,
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
        family: 'This answer uses 1 of at least 38 Nominal gross domestic product variables.',
    },
];

test('one variable of a larger family: laid out as one variable, the family size in its own note', () => {
    for (const { description, spec, rows, family } of singleOfFamily) {
        const summary = buildWhySummary(spec, { warnings: [], variable_text: null });

        assert.deepEqual(summary.rows, rows, description);
        assert.equal(summary.variables, null, description);
        assert.equal(summary.family, family, description);
    }
});

test('each scope warning becomes one assumption sentence', () => {
    const cases = [
        {
            description: 'no place named',
            spec: {
                stat_vars: {
                    items: [{ ref: 'LifeExpectancy_Person', label: 'Life expectancy' }],
                    member_count: 3,
                    member_count_exact: false,
                    truncated: true,
                },
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
            row: { label: 'Places', value: 'All 1,649 with data' },
            assumptions: [
                'No place was named, so every place with data is included, at every level.',
            ],
        },
        {
            // Trimmed from the dev API's "population" answer, which it
            // narrowed to the countries with data.
            description: 'no place named, the answer narrowed to countries',
            spec: {
                stat_vars: {
                    items: [{ ref: 'Count_Person', label: 'Total population' }],
                    member_count: 28,
                    member_count_exact: false,
                    truncated: true,
                },
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
            row: { label: 'Countries', value: 'All 216 with data' },
            assumptions: ['No place was named, so every country with data is included.'],
        },
        {
            description: 'no donor named, the recipient bound',
            spec: {
                ...oda,
                entities: [{ ref: 'country/KEN', label: 'Kenya', role: 'destination' }],
                entity_options: [{ role: 'origin', options: [], truncated: true }],
                coverage: { kind: 'breadth', dimensions: [] },
            },
            codes: ['role_scope_defaulted'],
            row: { label: 'Donors', value: 'All with data' },
            assumptions: [
                'No donor was named, so every donor with data to Kenya is included.',
                'No year was named, so the counts are for 2024, the latest year with data.',
            ],
        },
        {
            description: 'no year named, a broad answer counting its latest year',
            spec: oda,
            codes: ['time_window_defaulted'],
            row: { label: 'Years', value: 'Latest is 2024' },
            assumptions: [
                'No year was named, so the counts are for 2024, the latest year with data.',
            ],
        },
        {
            description: 'no year named, no headline year',
            spec: inflation,
            codes: ['time_window_defaulted'],
            row: { label: 'Years', value: '2000 to 2022' },
            assumptions: ['No year was named, so every year with data is included.'],
        },
        {
            description: 'a role warning with no open role on the spec keeps the API wording',
            spec: { ...oda, entity_options: [] },
            codes: ['role_scope_defaulted'],
            row: { label: 'Donor', value: 'Germany' },
            assumptions: [
                'No recipient was named; the answer was resolved across the 191 recipients with data from Germany.',
                'No year was named, so the counts are for 2024, the latest year with data.',
            ],
        },
    ];

    for (const { description, spec, codes, row, assumptions } of cases) {
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
        assert.deepEqual(scopeAssumptions(spec, warnings), assumptions, description);
    }
});

test('chosen: each facet axis gives its value and why, in source, method, unit order', () => {
    const spec = {
        facets: {
            unit: { ref: 'CurrencyUSD', label: 'US Dollar', basis: 'fallback' },
            provenance: {
                ref: 'dc/base/WorldDevelopmentIndicators',
                label: 'WorldDevelopmentIndicators',
                basis: 'bound',
            },
            measurementMethod: { selection: 'per_series', basis: 'declared_default' },
        },
    };

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

test('chosen: a slot a declared default filled follows the facets; other provenances add nothing', () => {
    const filter = (provenance: string, label: string, ref: string) => ({
        key: { axis: 'how', label },
        binding_kind: 'value',
        refs: [{ dcid: ref, label: ref }],
        provenance,
    });
    const spec = {
        resolution: {
            slot_filters: [
                filter('declared_default', 'type of flow', 'ODA'),
                filter('binder', 'purpose', 'Health'),
                filter('measure_elected', 'finance type', 'Grant'),
            ],
        },
    };

    assert.deepEqual(buildWhySummary(spec).chosen, [
        {
            label: 'Type of flow',
            value: 'ODA',
            reason: 'Filled in from the default for this measure.',
        },
    ]);
});

test('sources carry the licence only when the answer serves one source', () => {
    const source = (dcid: string) => ({ dcid, label: dcid });
    const download = { licence: { label: 'CCBY4' } };

    assert.equal(
        buildWhySummary({ download, resolution: { resolved_sources: [source('a')] } }).sources[0]
            ?.licence,
        'CCBY4',
    );
    assert.deepEqual(
        buildWhySummary({
            download,
            resolution: { resolved_sources: [source('a'), source('b')] },
        }).sources.map((entry) => entry.licence),
        [null, null],
    );
});
