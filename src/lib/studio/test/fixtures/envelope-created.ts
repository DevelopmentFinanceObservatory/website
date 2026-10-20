/**
 * A `component.created` `payload`, trimmed from a Studio transcript the ai
 * harness recorded (`studio_transcript.jsonl`, line_chart,
 * cmp_01M3KK0ZXJ24DJFK401ZVTW7MG), in the platform's resolved revision
 * envelope shape.
 */
export const envelopeCreated = {
    schema_version: 1,
    catalog_version: '2026.8.0',
    component_id: 'cmp_01M3KK0ZXJ24DJFK401ZVTW7MG',
    revision: 1,
    provenance: {
        inputs: [
            {
                spec_id: 'spec_209b19f3a7a50d137f034615f4695fe7',
                content_version: 'cv_bbd438aa1d8becf601443e1f4006d74c',
            },
        ],
        execution_ref: null,
        sources: [
            {
                id: 'src_dc_base_worlddevelopmentindicators_9957fdf7',
                name: 'dc/base/WorldDevelopmentIndicators',
                url: '',
                licence: 'unknown',
                retrieved: '2026-09-28',
            },
        ],
        freshness: {
            data_through: null,
            last_refreshed: null,
            next_expected: null,
            partial_period: false,
        },
        warnings: [],
        generated_at: '2026-09-28T08:45:10.450239Z',
        citation: 'dc/base/WorldDevelopmentIndicators via ONE DFO, retrieved 2026-09-28',
        refreshed_from: null,
    },
    component: {
        type: 'line_chart',
        title: {
            text: 'Life Expectancy in Nigeria (1960–2023)',
            authorship: 'model',
        },
        series: [
            {
                id: 'country_nga_dc_base_worlddevelop_dcid_lifeexpectancy__5c3e43',
                label: 'Nigeria',
                unit: 'Year',
                source_ref: 'src_dc_base_worlddevelopmentindicators_9957fdf7',
                points: [
                    { period: '1960', value: 37.207 },
                    { period: '2023', value: 52.727 },
                ],
            },
        ],
    },
};

/** The same frame's own `provenance`, which the harness writes: its source id
 *  is the graph dcid, and its freshness is filled where the payload's is null. */
export const envelopeCreatedFrameProvenance = {
    inputs: [
        {
            spec_id: 'spec_209b19f3a7a50d137f034615f4695fe7',
            content_version: 'cv_bbd438aa1d8becf601443e1f4006d74c',
        },
    ],
    sources: [
        {
            id: 'dc/base/WorldDevelopmentIndicators',
            name: 'WorldDevelopmentIndicators',
            licence: 'not stated by the platform',
        },
    ],
    freshness: { data_through: '2023', last_refreshed: '2026-09-28', partial_period: false },
    warnings: [],
    generated_at: '2026-09-28T08:45:10.498525+00:00',
    citation: 'WorldDevelopmentIndicators',
};
