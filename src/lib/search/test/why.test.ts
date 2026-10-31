import assert from 'node:assert/strict';
import test from 'node:test';

import { tokenAbout } from '../tokenAbout.ts';
import type { Assumption, SentenceToken, UnreadableSpec, Warning } from '../types.ts';
import { buildWhySummary, maybeOneVariable } from '../view.ts';
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
    assert.equal(summary.inside, null);
});

test('one variable: the Measure row carries its variable id and nothing is marked assumed', () => {
    const part = { warnings: [], variable_text: 'inflation' };
    const summary = buildWhySummary(inflation, part, inflationMembers);

    assert.deepEqual(summary.rows, [
        {
            label: 'Measure',
            value: 'Annual inflation, consumer prices',
            variableId: 'sdg/FP_CPI_TOTL_ZG',
        },
        { label: 'Place', value: 'Pakistan' },
        { label: 'Years', value: '2000 to 2022' },
        { label: 'Unit', value: 'Percentage' },
    ]);
    assert.equal(summary.inside, null);
    assert.deepEqual(summary.notes, []);
    // Until the members door answers, the row names the measure without an id.
    assert.deepEqual(buildWhySummary(inflation, part).rows[0], {
        label: 'Measure',
        value: 'Annual inflation, consumer prices',
    });
});

test('many variables: each assumed fact sits on its own row with its reason and binding', () => {
    const corrected: Assumption = {
        kind: 'name_corrected',
        binding_ref: 'origin:',
        refs: ['country/DEU'],
        text: '"Germny" read as Germany',
    };
    const summary = buildWhySummary(
        oda,
        {
            warnings: odaWarnings,
            variable_text: 'official development assistance',
            assumptions: [corrected, openRecipients],
        },
        odaMembers,
    );

    assert.deepEqual(summary.rows, [
        { label: 'Measure', value: 'Gross disbursements (nominal)' },
        {
            label: 'Provider',
            value: 'Germany',
            note: '"Germny" read as Germany.',
            bindingRef: 'origin:',
        },
        {
            label: 'Recipients',
            value: 'All 191 with data',
            note: 'No recipient was named.',
            bindingRef: 'where:',
        },
        // The wire sends no time_window_defaulted, and the headline's year_named says it.
        {
            label: 'Years',
            value: 'Latest is 2024',
            note: 'No year was named, so the figures are for 2024, the latest year with data.',
            bindingRef: 'when:',
        },
        { label: 'Unit', value: 'US Dollar' },
    ]);
    assert.deepEqual(summary.notes, []);
});

// Coverage counts the variables with data in the answer's rows. The resolved
// membership decides between one variable and several.
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

    assert.deepEqual(single.rows[0], {
        label: 'Measure',
        value: 'Official development assistance gross disbursements 0',
        variableId: 'Amount_FinancialFlow_Gross_Disbursement_0',
    });
});

// Trimmed from the dev API's humanitarian aid from Germany answer.
const value = (dcid: string, label: string, count: number) => ({
    value: { ref: dcid, label },
    count,
});
const humanitarian = partialSpec({
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
});

test('many variables: inside the total lists each axis it splits by and its values, without counts', () => {
    assert.deepEqual(buildWhySummary(humanitarian).inside, {
        summary: 'All gross disbursements (nominal, official development assistance).',
        breakdown: [
            { title: 'By instrument', values: ['Standard grant', 'Standard loan'], more: 0 },
            {
                title: 'By cooperation modality',
                values: [
                    'Project-type intervention',
                    'Contribution to a pooled fund',
                    'Core support to NGOs',
                    'Development awareness',
                    'Other technical assistance',
                ],
                more: 2,
            },
        ],
    });
    // A single variable has nothing inside it to split.
    assert.equal(
        buildWhySummary(
            partialSpec({
                ...humanitarian,
                stat_vars: { member_count: 1, member_count_exact: true, served_count: 1 },
            }),
        ).inside,
        null,
    );
});

test('the members door is read only for an answer that may serve one variable', () => {
    const cases: [Record<string, unknown>, boolean][] = [
        [{ member_count: 3, member_count_exact: false, served_count: 1 }, true],
        [{ member_count: 1, member_count_exact: true, served_count: null }, true],
        [{ member_count: 1, member_count_exact: false, served_count: null }, false],
        [{ member_count: 3, member_count_exact: true, served_count: null }, false],
        [{ member_count: 1626, member_count_exact: true, served_count: 1626 }, false],
    ];

    for (const [stat_vars, expected] of cases) {
        assert.equal(
            maybeOneVariable(partialSpec({ stat_vars })),
            expected,
            JSON.stringify(stat_vars),
        );
    }
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
            { label: 'Measure', value: 'Life Expectancy', variableId: 'LifeExpectancy_Person' },
            { label: 'Place', value: 'Ethiopia' },
            { label: 'Years', value: '1960 to 2023' },
            { label: 'Unit', value: 'Year' },
        ],
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
                variableId: 'Amount_EconomicActivity_GrossDomesticProduction_Nominal',
            },
            { label: 'Place', value: 'Kenya' },
            { label: 'Years', value: '1960 to 2024' },
        ],
    },
];

test('one variable of a larger family: laid out as one variable', () => {
    for (const { description, spec, member, rows } of singleOfFamily) {
        const summary = buildWhySummary(
            spec,
            { warnings: [], variable_text: null },
            { ok: true, members: [member] },
        );

        assert.deepEqual(summary.rows, rows, description);
        assert.equal(summary.inside, null, description);
    }
});

test('each scope assumption and scope warning marks the row it states', () => {
    const cases: {
        description: string;
        spec: Record<string, unknown>;
        codes: string[];
        given: Assumption[];
        row: { label: string; value: string; note?: string; bindingRef?: string };
        notes?: string[];
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
            row: {
                label: 'Places',
                value: 'All 1,649 with data',
                note: 'No place was named.',
                bindingRef: 'where:',
            },
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
            row: {
                label: 'Countries',
                value: 'All 216 with data',
                note: 'No place was named.',
                bindingRef: 'where:',
            },
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
            row: {
                label: 'Providers',
                value: 'All 36 with data',
                note: 'No provider was named.',
                bindingRef: 'origin:',
            },
        },
        {
            description: 'no year named, a broad answer counting its latest year',
            spec: oda,
            codes: ['time_window_defaulted'],
            given: [],
            row: {
                label: 'Years',
                value: 'Latest is 2024',
                note: 'No year was named, so the figures are for 2024, the latest year with data.',
                bindingRef: 'when:',
            },
        },
        {
            description: 'no year named, no headline year',
            spec: inflation,
            codes: ['time_window_defaulted'],
            given: [],
            row: {
                label: 'Years',
                value: '2000 to 2022',
                note: 'No year was named, so every year with data is included.',
                bindingRef: 'when:',
            },
        },
        {
            description: 'a role warning on a part that assumed nothing marks no role',
            spec: { ...oda, entity_options: [] },
            codes: ['role_scope_defaulted'],
            given: [],
            row: { label: 'Provider', value: 'Germany' },
        },
        {
            description: 'an open role no row states reads as a note',
            spec: { ...oda, entity_options: [] },
            codes: [],
            given: [openRecipients],
            row: { label: 'Provider', value: 'Germany' },
            notes: ['The question left this role open, so the answer covers every recipient.'],
        },
    ];

    for (const { description, spec, codes, given, row, notes = [] } of cases) {
        const warnings: Warning[] = codes.map(
            (code) =>
                odaWarnings.find((warning) => warning.code === code) ?? {
                    code,
                    severity: 'warn',
                    message: 'defaulted',
                },
        );
        const why = buildWhySummary(spec, { warnings, variable_text: null, assumptions: given });

        assert.deepEqual(
            why.rows.find((r) => r.label === row.label),
            row,
            description,
        );
        assert.deepEqual(why.notes, notes, description);
    }
});

test('a facet the search picked says so on its row; one the request set says nothing', () => {
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
        resolution: {
            resolved_sources: [
                {
                    ref: 'dc/base/WorldDevelopmentIndicators',
                    label: 'World Development Indicators',
                },
            ],
        },
    });
    const summary = buildWhySummary(spec);

    assert.deepEqual(summary.rows, [
        {
            label: 'Unit',
            value: 'US Dollar',
            note: 'Picked by the search.',
            bindingRef: 'unit:',
        },
        {
            label: 'Method',
            value: 'Differs by series',
            note: 'The default for this measure.',
            bindingRef: 'method:',
        },
    ]);
    // The request named the source, so it offers no Change and says nothing.
    assert.equal(summary.sourceBindingRef, null);
    assert.deepEqual(summary.sources[0]?.meta, []);
});

test('a slot a declared default filled is a row of its own; one no slot names reads as a note', () => {
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
            ],
        },
    });
    const defaulted: Assumption = {
        kind: 'declared_default',
        binding_ref: 'how:typeofflow',
        refs: ['ODA'],
        text: 'official development assistance',
    };
    const summary = buildWhySummary(spec, {
        assumptions: [defaulted, { ...defaulted, binding_ref: 'how:other' }],
    });

    assert.deepEqual(summary.rows, [
        {
            label: 'Type of flow',
            value: 'Official development assistance',
            note: 'No type of flow was named, so the answer uses the default for this measure.',
            bindingRef: 'how:typeofflow',
        },
    ]);
    assert.deepEqual(summary.notes, [
        'The question left this open, so the answer uses official development assistance, the default for this measure.',
    ]);
});

test('sources carry the licence only when the answer serves one source', () => {
    const source = (ref: string) => ({ ref, label: ref });
    const download = { licence: { label: 'CCBY4' } };

    assert.deepEqual(
        buildWhySummary(partialSpec({ download, resolution: { resolved_sources: [source('a')] } }))
            .sources[0]?.meta,
        ['CCBY4'],
    );
    assert.deepEqual(
        buildWhySummary(
            partialSpec({
                download,
                resolution: { resolved_sources: [source('a'), source('b')] },
            }),
        ).sources.map((entry) => entry.meta),
        [[], []],
    );
});

// Trimmed from the dev API's "debt service of Mozambique" answer: one IDS
// series the search picked the source and unit for, with the code the World
// Bank files it under.
const ids = {
    ref: 'dc/base/WorldBankInternationalDebtStatistics',
    label: 'World Bank International Debt Statistics (IDS)',
    documentation: '/sources/dc/base/WorldBankInternationalDebtStatistics',
    source: { ref: 'dc/base/WorldBank', label: 'World Bank' },
};
const mozambique = partialSpec({
    stat_vars: {
        member_count: 1,
        member_count_exact: true,
        served_count: 1,
        data_date_range: { start: '1984', end: '2024' },
        source_codes: [{ provenance: ids.ref, code: 'DT.TDS.DEGG.CD', exact: true }],
    },
    measure_label: 'debt service on public or publicly guaranteed external debt',
    entities: [{ ref: 'country/MOZ', label: 'Mozambique', role: 'observationAbout' }],
    facets: {
        unit: { ref: 'USDollar', label: 'US Dollar', basis: 'fallback' },
        provenance: { ref: ids.ref, label: ids.label, basis: 'fallback' },
    },
    download: { licence: { label: 'Creative Commons Attribution' } },
    headline: { year: 2024, year_named: false, observations: 1, series: 1, role_counts: {} },
    resolution: { resolved_sources: [ids] },
});

test('the debt service answer: exact publisher code, assumed facts in place, source once, one citation', () => {
    const summary = buildWhySummary(
        mozambique,
        { warnings: [], variable_text: 'debt service' },
        {
            ok: true,
            members: [
                {
                    dcid: 'Amount_FinancialFlow_ServicingPayment_PublicOrPubliclyGuaranteed_Nominal',
                    label: 'Debt service on public or publicly guaranteed external debt',
                },
            ],
        },
        new Date('2026-10-31'),
    );

    assert.deepEqual(summary.rows, [
        {
            label: 'Measure',
            value: 'Debt service on public or publicly guaranteed external debt',
            variableId: 'Amount_FinancialFlow_ServicingPayment_PublicOrPubliclyGuaranteed_Nominal',
            sourceCodes: {
                exact: true,
                publishers: [{ publisher: 'World Bank', codes: ['DT.TDS.DEGG.CD'], more: 0 }],
            },
        },
        { label: 'Place', value: 'Mozambique' },
        {
            label: 'Years',
            value: '1984 to 2024',
            note: 'No year was named, so every year with data is included.',
            bindingRef: 'when:',
        },
        {
            label: 'Unit',
            value: 'US Dollar',
            note: 'Picked by the search.',
            bindingRef: 'unit:',
        },
    ]);
    assert.deepEqual(summary.sources, [
        {
            ref: ids.ref,
            label: ids.label,
            documentation: ids.documentation,
            meta: ['World Bank', 'Creative Commons Attribution', 'picked by the search'],
        },
    ]);
    assert.equal(summary.sourceBindingRef, 'source:');
    assert.equal(
        summary.cite,
        'World Bank International Debt Statistics (IDS) (2026), via the Development Finance Observatory',
    );
    assert.deepEqual(summary.notes, []);
});

test('the citation credits the DFO as processor only when a unit request converted the figures', () => {
    const offer = {
        currencies: [{ code: 'EUR', noun: 'euros' }],
        default_base_year: 2024,
        role_currencies: {},
    };
    const cases: [string, Record<string, unknown>, string][] = [
        ['a conversion offered, none applied', { unit_conversion: offer }, 'via'],
        [
            'converted to euros',
            {
                unit_conversion: offer,
                identity: {
                    facets: {
                        unit: { state: 'value', request: { currency: 'EUR', prices: 'current' } },
                    },
                },
            },
            'processed by',
        ],
    ];

    for (const [description, patch, route] of cases) {
        const summary = buildWhySummary(
            partialSpec({ ...mozambique, stat_vars: undefined, ...patch }),
            null,
            null,
            new Date('2026-10-31'),
        );

        assert.equal(
            summary.cite,
            `World Bank International Debt Statistics (IDS) (2026), ${route} the Development Finance Observatory`,
            description,
        );
    }
});

test('codes that do not name the whole answer read as what it is built from, the first three of each publisher', () => {
    const codes = ['DT.AMT.A', 'DT.AMT.B', 'DT.AMT.C', 'DT.AMT.D', 'DT.AMT.E'];
    const summary = buildWhySummary(
        partialSpec({
            ...mozambique,
            stat_vars: {
                member_count: 5,
                member_count_exact: true,
                served_count: 5,
                source_codes: [
                    ...codes.map((code) => ({ provenance: ids.ref, code })),
                    { provenance: 'dc/base/Unlisted', code: 'X1' },
                ],
            },
        }),
    );

    assert.deepEqual(summary.rows[0]?.sourceCodes, {
        exact: false,
        publishers: [
            { publisher: 'World Bank', codes: ['DT.AMT.A', 'DT.AMT.B', 'DT.AMT.C'], more: 2 },
            { publisher: 'Source', codes: ['X1'], more: 0 },
        ],
    });
    // An answer whose variables carry no code names none.
    assert.equal(buildWhySummary(inflation).rows[0]?.sourceCodes, undefined);
});
