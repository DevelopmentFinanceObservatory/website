import assert from 'node:assert/strict';
import test from 'node:test';

import {
    latestDate,
    servedSpan,
    seriesReason,
    singleStatVarSpec,
    tokenAbout,
} from '../tokenAbout.ts';
import { priceBasis } from '../unitLabel.ts';
import type { SentenceToken } from '../types.ts';

const slot = (fields: Partial<SentenceToken>): SentenceToken => ({
    kind: 'slot',
    text: '',
    segment: 'heading',
    ...fields,
});

const crsProvenance = {
    dcid: 'provenance/OECDCreditorReportingSystem',
    label: 'OECD Creditor Reporting System (CRS)',
    source: {
        ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
        label: 'Organisation for Economic Co-operation and Development (OECD)',
    },
    data_commons: { id: 'dfo', label: 'Development Finance Observatory' },
};

// crs-001's measure: gross ODA disbursements over 152 StatVars, nominal.
const grossOda = {
    measure_label: 'gross ODA disbursements',
    measure_axis_values: [
        { axis: 'nettingBasis', value: { dcid: 'Gross', label: 'gross' } },
        { axis: 'crsTypeOfFlow', value: { dcid: 'ODA', label: 'ODA' } },
        { axis: 'measurementQualifier', value: { dcid: 'Nominal', label: 'nominal' } },
    ],
    stat_vars: {
        member_count: 152,
        member_count_exact: true,
        served_count: 152,
        data_date_range: { start: '1973', end: '2024' },
    },
    coverage: { kind: 'breadth', has_data: true, dimensions: [{ label: 'variables', count: 152 }] },
    download: { rows: 4211, rows_exact: true },
    facets: {
        unit: { basis: 'fallback', ref: 'CurrencyUSD', label: 'US Dollar', currency: 'USD' },
    },
    resolution: { resolved_sources: [crsProvenance] },
};

test('a measure states its unit, span and download rows, and defines the axis values no other token states', () => {
    const measure = slot({ axis: 'what', text: 'Gross ODA disbursements' });
    // The unit token states the price basis (Nominal).
    const about = tokenAbout(measure, grossOda, new Set(['unit:', 'axis:measurementQualifier']));

    assert.equal(about.kind, 'measure');
    assert.equal(about.title, 'Gross ODA disbursements');
    assert.deepEqual(about.facts, ['US Dollar', '1973 to 2024', '4,211 rows']);
    assert.deepEqual(about.definitions, [
        { label: 'Gross', dcid: 'Gross' },
        { label: 'ODA', dcid: 'ODA' },
    ]);

    // A wire without `states`: no token states the qualifier, so the
    // measure defines it.
    assert.deepEqual(
        tokenAbout(measure, grossOda, new Set(['unit:'])).definitions.map(({ dcid }) => dcid),
        ['Gross', 'ODA', 'Nominal'],
    );
});

// "aid from Germany to Guatemala": 279 series over three varying CRS axes,
// one of them named by no slot.
test('the line counts the rows and the note names the axes the series vary on', () => {
    const spec = {
        slots: [
            { key: { axis: 'how', property: { dcid: 'crsPurpose' }, label: 'sector' } },
            { key: { axis: 'how', property: { dcid: 'crsTypeOfFinance' }, label: 'instrument' } },
        ],
        open_axis_facts: [
            { property: 'crsPurpose', varies: true, distinct_count: 98, undeclared_count: 0 },
            { property: 'crsTypeOfFinance', varies: true, distinct_count: 3, undeclared_count: 0 },
            { property: 'crsChannel', varies: false, distinct_count: 1, undeclared_count: 0 },
            {
                property: 'crsCooperationModality',
                varies: true,
                distinct_count: 8,
                undeclared_count: 0,
            },
        ],
        stat_vars: { member_count: 279, member_count_exact: true, served_count: 279 },
        coverage: { dimensions: [{ label: 'variables', count: 279 }] },
        download: { rows: 1284, rows_exact: false },
    };
    const about = tokenAbout(slot({ axis: 'what', text: 'aid' }), spec);

    assert.deepEqual(about.facts, ['up to 1,284 rows']);
    assert.deepEqual(about.notes, [
        'One series for each sector, instrument and cooperation modality combination.',
    ]);
    assert.equal(
        seriesReason({ ...spec, open_axis_facts: spec.open_axis_facts.slice(0, 1) }),
        'One series for each sector.',
    );
    assert.equal(seriesReason({}), null);
});

test('a measure serving one StatVar reads it from the members door; several read nothing', () => {
    const one = { spec_id: 'spec_1', stat_vars: { member_count: 3, served_count: 1 } };
    const about = tokenAbout(slot({ axis: 'what', text: 'inflation' }), one);

    assert.equal(singleStatVarSpec(one), one);
    assert.equal(singleStatVarSpec(grossOda), null);
    // The StatVar's definition joins once the door answers (TokenAbout).
    assert.equal(about.title, 'Inflation');
    assert.deepEqual(about.definitions, []);
});

// crs-006: the 27 European Union members as the provider role.
test('a group names itself, counts its members and defines its graph node', () => {
    const members = ['country/AUT', 'country/BEL', 'country/BGR'];
    const about = tokenAbout(
        slot({ role: 'origin', text: 'the 3 European Union members', entity_refs: members }),
        {
            entities: [
                { ref: 'country/AUT', label: 'Austria', entity_type: 'Country', role: 'origin' },
                { ref: 'country/BEL', label: 'Belgium', entity_type: 'Country', role: 'origin' },
                { ref: 'country/BGR', label: 'Bulgaria', entity_type: 'Country', role: 'origin' },
            ],
            entity_groups: { origin: { dcid: 'EuropeanUnion', label: 'European Union' } },
        },
    );

    assert.equal(about.title, 'European Union');
    assert.deepEqual(about.facts, ['Group of 3 members (country)']);
    assert.deepEqual(about.notes, ['Austria, Belgium, Bulgaria']);
});

test('an open role counts the members with data', () => {
    const about = tokenAbout(slot({ role: 'origin', text: '81 donors', binding_ref: 'origin:' }), {
        entities: [{ ref: 'country/BGD', role: 'destination' }],
        coverage: { dimensions: [{ label: 'providers', count: 81 }] },
    });

    assert.equal(about.title, '81 donors');
    assert.deepEqual(about.facts, ['Every provider with data']);
    assert.deepEqual(about.definitions, []);
});

test('an open role whose title states no count keeps the count in its fact', () => {
    const about = tokenAbout(slot({ role: 'origin', text: '', binding_ref: 'origin:' }), {
        entities: [{ ref: 'country/BGD', role: 'destination' }],
        coverage: { dimensions: [{ label: 'providers', count: 1234 }] },
    });

    assert.equal(about.title, 'Any provider');
    assert.deepEqual(about.facts, ['Every provider with data: 1,234 providers']);
});

test("one place names itself and its type, and a subject place reads the spec's entities", () => {
    const about = tokenAbout(slot({ axis: 'where', text: 'Kenya' }), {
        entities: [
            {
                ref: 'country/KEN',
                label: 'Kenya',
                entity_type: 'Country',
                role: 'observationAbout',
            },
        ],
    });

    assert.equal(about.title, 'Kenya');
    assert.deepEqual(about.facts, ['Country']);

    const area = tokenAbout(slot({ axis: 'where', text: 'Nairobi' }), {
        entities: [
            {
                ref: 'wikidataId/Q3870',
                label: 'Nairobi',
                entity_type: 'AdministrativeArea1',
                role: 'observationAbout',
            },
        ],
    });

    assert.deepEqual(area.facts, ['Administrative area 1']);
});

test('a period states the served span when it differs, and the latest date with a value', () => {
    const spec = {
        coverage: { window: { start_year: 2010, end_year: 2023 } },
        observations: {
            series: [
                {
                    points: [
                        { date: '2022', value: 1 },
                        { date: '2023', value: null },
                    ],
                },
                { points: [{ date: '2021', value: 2 }] },
            ],
        },
    };

    assert.deepEqual(tokenAbout(slot({ axis: 'when', text: 'since 2000' }), spec).facts, [
        'Data served: 2010 to 2023',
        'Latest data: 2022',
    ]);
    assert.deepEqual(tokenAbout(slot({ axis: 'when', text: '2010 to 2023' }), spec).facts, [
        'Latest data: 2022',
    ]);
});

test("the served span and latest date fall back to the StatVars' range when nothing else says", () => {
    const spec = { stat_vars: { data_date_range: { start: '1985-06', end: '2022-12' } } };

    assert.equal(servedSpan(spec), '1985 to 2022');
    assert.equal(latestDate(spec), '2022-12');
});

test("the latest date reads the StatVars' range past a preview that stops short", () => {
    // Germany to Kenya: 486 series end in 2024, the 20 previewed end in 2023.
    const spec = {
        stat_vars: { data_date_range: { start: '1973', end: '2024' } },
        observations: { series: [{ points: [{ date: '2023', value: 5 }] }] },
    };

    assert.equal(latestDate(spec), '2024');
});

test('a how code defines its bound value, labelling each when there are several', () => {
    const purpose = {
        key: { axis: 'how', property: { dcid: 'crsPurpose' }, label: 'purpose' },
    };
    const one = tokenAbout(
        slot({ axis: 'how', text: 'for malaria control', binding_ref: 'how:crsPurpose' }),
        {
            slots: [
                {
                    ...purpose,
                    binding: {
                        kind: 'value',
                        value: { ref: { dcid: 'crs/12262', label: 'Malaria control' } },
                    },
                },
            ],
        },
    );

    assert.equal(one.kind, 'code');
    assert.deepEqual(one.facts, ['Purpose']);
    assert.deepEqual(one.definitions, [{ label: null, dcid: 'crs/12262' }]);

    const two = tokenAbout(
        slot({ axis: 'how', text: 'for health', binding_ref: 'how:crsPurpose' }),
        {
            slots: [
                {
                    ...purpose,
                    binding: {
                        kind: 'set',
                        values: [
                            { ref: { dcid: 'crs/121', label: 'Health, general' } },
                            { ref: { dcid: 'crs/122', label: 'Basic health' } },
                        ],
                    },
                },
            ],
        },
    );

    assert.deepEqual(two.definitions, [
        { label: 'Health, general', dcid: 'crs/121' },
        { label: 'Basic health', dcid: 'crs/122' },
    ]);
});

const priceBasisCases: [string, object, ReturnType<typeof priceBasis>][] = [
    [
        'the unit request wins',
        {
            identity: {
                facets: {
                    unit: {
                        state: 'value',
                        request: { currency: 'USD', prices: 'constant', base_year: 2022 },
                    },
                },
            },
            facets: { unit: { ref: 'ChainedUSDollarBaseYr2017' } },
        },
        { prices: 'constant', baseYear: 2022 },
    ],
    [
        "a unit's base year comes next",
        {
            facets: { unit: { ref: 'ChainedUSDollarBaseYr2017' } },
            measure_axis_values: grossOda.measure_axis_values,
        },
        { prices: 'constant', baseYear: 2017 },
    ],
    ['then the measure qualifier', grossOda, { prices: 'current', baseYear: null }],
    ['and nothing states none', { facets: { unit: { ref: 'Percent' } } }, null],
];

for (const [description, spec, expected] of priceBasisCases) {
    test(`priceBasis: ${description}`, () => {
        assert.deepEqual(priceBasis(spec), expected);
    });
}

test('a unit states its currency, and notes its price basis and the conversion tables, each once', () => {
    const conversion = {
        recipe_id: 'r',
        table_provenance: { ref: 'provenance/DfoRates', label: 'DFO exchange rates and deflators' },
        exchange_rate_table_version: '2025-06',
        deflator_table_version: '2025-06d',
        fallback_count: 0,
        projected_count: 0,
    };
    const about = tokenAbout(
        slot({ axis: 'unit', text: 'constant 2022 Kenyan shillings', segment: 'byline' }),
        {
            identity: {
                facets: {
                    unit: {
                        state: 'value',
                        request: { currency: 'KES', prices: 'constant', base_year: 2022 },
                    },
                },
            },
            facets: { unit: { ref: 'CurrencyKES', label: 'Kenyan Shilling', currency: 'KES' } },
            observations: { series: [{ conversion }, { conversion }, { conversion: null }] },
            unit_conversion: {
                currencies: [{ code: 'KES', noun: 'Kenyan shillings' }],
                default_base_year: 2024,
                role_currencies: {},
            },
        },
    );

    assert.equal(about.kind, 'unit');
    assert.equal(about.title, 'Constant 2022 Kenyan shillings');
    assert.deepEqual(about.facts, ['Kenyan shillings (KES)']);
    assert.deepEqual(about.notes, [
        'Constant 2022 prices: values adjusted for inflation to 2022 prices, so years compare.',
        'Exchange rates from DFO exchange rates and deflators, version 2025-06',
        'Deflators from DFO exchange rates and deflators, version 2025-06d',
    ]);
});

test('a source names each provenance with its publisher, taking it from the resolved ref', () => {
    const about = tokenAbout(
        slot({ axis: 'source', text: 'OECD Creditor Reporting System (CRS)', segment: 'byline' }),
        {
            ...grossOda,
            slots: [
                {
                    key: { axis: 'source' },
                    binding: {
                        kind: 'value',
                        value: { ref: { dcid: crsProvenance.dcid, label: 'CRS' } },
                    },
                },
            ],
        },
    );

    assert.equal(about.kind, 'source');
    assert.equal(about.sources.length, 1);
    assert.equal(about.sources[0].dcid, crsProvenance.dcid);
    assert.equal(about.sources[0].label, crsProvenance.label);
    assert.match(about.sources[0].origin ?? '', /Organisation for Economic Co-operation/);
});
