import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProvenanceRef, Shape } from '../types.ts';
import {
    buildWhySummary,
    flattenRows,
    provenanceOrigin,
    shapeOrigin,
    sourceOrigin,
    specOrigin,
} from '../view.ts';

// The three Data Commons as the engine names them (dfo-apis
// origin_catalogue.origins).
const DFO = { id: 'dfo', label: 'Development Finance Observatory' } as const;
const BASE = { id: 'base', label: 'Data Commons by Google' } as const;
const UN = { id: 'un_system', label: 'UN System Data Commons' } as const;

const wdi: ProvenanceRef = {
    ref: 'dc/base/WorldDevelopmentIndicators',
    label: 'World Development Indicators',
    documentation: '/api/graph/documentation/dc/base/WorldDevelopmentIndicators',
    source: { ref: 'dc/s/WorldBank', label: 'World Bank' },
    data_commons: BASE,
};

const crs: ProvenanceRef = {
    ref: 'provenance/OECDCreditorReportingSystem',
    label: 'OECD Creditor Reporting System',
    documentation: '/api/graph/documentation/provenance/OECDCreditorReportingSystem',
    source: {
        ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
        label: 'Organisation for Economic Co-operation and Development (OECD)',
    },
    data_commons: DFO,
};

const sdg: ProvenanceRef = {
    ref: 'undata/p/SDG',
    label: 'SDG Global Database',
    documentation: '/api/graph/documentation/undata/p/SDG',
    source: { ref: 'undata/p/SDG', label: 'SDG Global Database' },
    data_commons: UN,
};

test('provenanceOrigin credits upstream data via its Data Commons and DFO data with its publisher alone', () => {
    assert.equal(provenanceOrigin(wdi), 'World Bank via Data Commons by Google');
    // A UN agency provenance is its own source, so its label already names it.
    assert.equal(provenanceOrigin(sdg), 'via UN System Data Commons');
    assert.equal(
        provenanceOrigin(crs),
        'Organisation for Economic Co-operation and Development (OECD)',
    );
});

test('provenanceOrigin is null for a provenance the origin catalogue does not list', () => {
    assert.equal(provenanceOrigin({ ref: 'dc/base/Unlisted', label: 'dc/base/Unlisted' }), null);
    assert.equal(provenanceOrigin(undefined), null);
});

const shape = (extra: Partial<Shape>): Shape => ({
    shape_id: 'shape-1',
    label: 'population',
    population_type: null,
    measured_property: null,
    stat_type: null,
    slot_keys: [],
    member_count: 1,
    ...extra,
});

test('shapeOrigin names the one upstream source when the shape has one', () => {
    assert.equal(
        shapeOrigin(
            shape({
                data_commons: [BASE],
                upstream: { source: wdi.source!, data_commons: BASE },
            }),
        ),
        'World Bank via Data Commons by Google',
    );
    assert.equal(
        shapeOrigin(
            shape({ data_commons: [UN], upstream: { source: sdg.source!, data_commons: UN } }),
        ),
        'SDG Global Database via UN System Data Commons',
    );
});

test('shapeOrigin lists the upstream Data Commons, and stays silent when DFO holds the variables too', () => {
    assert.equal(shapeOrigin(shape({ data_commons: [UN] })), 'via UN System Data Commons');
    assert.equal(
        shapeOrigin(shape({ data_commons: [BASE, UN] })),
        'via Data Commons by Google and UN System Data Commons',
    );
    assert.equal(shapeOrigin(shape({ data_commons: [DFO, BASE] })), null);
    assert.equal(shapeOrigin(shape({ data_commons: [DFO] })), null);
    assert.equal(shapeOrigin(shape({ data_commons: [] })), null);
    assert.equal(shapeOrigin(shape({})), null);
});

const unicef: ProvenanceRef = {
    ref: 'undata/p/UNICEF',
    label: "United Nations Children's Fund (UNICEF)",
    documentation: '/api/graph/documentation/undata/p/UNICEF',
    source: { ref: 'undata/p/UNICEF', label: "United Nations Children's Fund (UNICEF)" },
    data_commons: UN,
};

// A spec whose sentence ends ", according to <source>", the source slot
// carrying `binding` and the trace listing `resolved`.
const sentenced = (
    upstream: ProvenanceRef,
    {
        binding = { kind: 'unbound' } as object,
        resolved = [] as ProvenanceRef[],
        sourceText = 'X',
    } = {},
) => ({
    shape: shape({
        data_commons: [upstream.data_commons!],
        upstream: { source: upstream.source!, data_commons: upstream.data_commons! },
    }),
    slots: [{ key: { axis: 'source', property: null, label: 'source' }, binding }],
    resolution: { resolved_sources: resolved },
    sentence_plan: [
        { kind: 'slot', text: 'Literacy rate', axis: 'what' },
        { kind: 'text', text: ', according to ' },
        { kind: 'slot', text: sourceText, axis: 'source' },
        { kind: 'text', text: '.' },
    ],
});

test('specOrigin drops the publisher that the sentence already names as its resolved source', () => {
    assert.equal(
        specOrigin(sentenced(unicef, { resolved: [unicef] })),
        'via UN System Data Commons',
    );
});

test('specOrigin drops the publisher that the bound source slot names', () => {
    const value = { value_kind: 'source', ref: { ref: unicef.ref, label: unicef.label } };

    assert.equal(
        specOrigin(sentenced(unicef, { binding: { kind: 'value', value } })),
        'via UN System Data Commons',
    );
    assert.equal(
        specOrigin(
            sentenced(unicef, {
                binding: { kind: 'set', values: [value, { ref: { ref: 'undata/p/FAO' } }] },
            }),
        ),
        'via UN System Data Commons',
    );
});

test('specOrigin keeps the publisher when the sentence names a Dataset under it, or no source', () => {
    // "according to World Development Indicators" does not name the World Bank.
    assert.equal(
        specOrigin(sentenced(wdi, { resolved: [wdi] })),
        'World Bank via Data Commons by Google',
    );
    // An empty source slot names nothing, whatever the trace lists.
    assert.equal(
        specOrigin(sentenced(unicef, { resolved: [unicef], sourceText: '' })),
        "United Nations Children's Fund (UNICEF) via UN System Data Commons",
    );
    // No sentence at all, so the title is the variable text.
    assert.equal(
        specOrigin({ shape: sentenced(unicef).shape }),
        "United Nations Children's Fund (UNICEF) via UN System Data Commons",
    );
});

test('sourceOrigin finds a picker option by dcid in the trace, the resolved facet or a series', () => {
    const spec = {
        resolution: { resolved_sources: [crs] },
        facets: {
            provenance: {
                basis: 'fallback',
                ref: wdi.ref,
                label: wdi.label,
                source: wdi.source,
                data_commons: wdi.data_commons,
            },
        },
        observations: { series: [{ source_refs: [sdg] }] },
    };

    assert.equal(
        sourceOrigin(spec, crs.ref),
        'Organisation for Economic Co-operation and Development (OECD)',
    );
    assert.equal(sourceOrigin(spec, wdi.ref), 'World Bank via Data Commons by Google');
    assert.equal(sourceOrigin(spec, sdg.ref), 'via UN System Data Commons');
    assert.equal(sourceOrigin(spec, 'dc/base/Other'), null);
});

test('the why summary notes each resolved source with its origin and the route of its document', () => {
    const unlinked = { ref: 'dc/base/Unlisted', label: 'dc/base/Unlisted' };
    const summary = buildWhySummary({ resolution: { resolved_sources: [wdi, crs, unlinked] } });

    assert.deepEqual(
        summary.sources.map((source) => [source.ref, source.origin, source.documentation]),
        [
            [wdi.ref, 'World Bank via Data Commons by Google', wdi.documentation],
            [
                crs.ref,
                'Organisation for Economic Co-operation and Development (OECD)',
                crs.documentation,
            ],
            [unlinked.ref, null, null],
        ],
    );
});

test('flattenRows reads the row entity and unit from the series role tuple and facet map', () => {
    const rows = flattenRows({
        slots: [],
        observations: {
            series: [
                {
                    stat_var: { ref: 'Count_Person' },
                    entities: [{ role: 'observationAbout', ref: 'country/KEN', label: 'Kenya' }],
                    points: [{ date: '2020', value: 53771300 }],
                    total_obs: 1,
                    source_refs: [wdi],
                    facet: {
                        provenance: { ref: wdi.ref, label: wdi.label, source: wdi.source },
                        unit: { ref: 'Percent', label: 'Percent' },
                    },
                },
            ],
        },
    });

    assert.deepEqual(
        rows.map((row) => [row.year, row.cells['entity:observationAbout'], row.unit]),
        [['2020', 'Kenya', '%']],
    );
});
