/**
 * A `component.revised` `payload`, trimmed from dfo-ai's recorded
 * `docs/transcripts/studio_transcript_edit.jsonl` (line_chart,
 * cmp_01M3KK8SJ4D1C7YY65AMKTZCR0 revision 2), in the platform's resolved
 * revision envelope shape.
 */
export const envelopeRevised = {
    schema_version: 1,
    catalog_version: '2026.8.0',
    component_id: 'cmp_01M3KK8SJ4D1C7YY65AMKTZCR0',
    revision: 2,
    provenance: {
        inputs: [
            {
                spec_id: 'spec_36ee4aaed40c7c8ee7a0a6869b1fc80e',
                content_version: 'cv_f51f1a22b6af86e0cd281cbf93b3ec6c',
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
        generated_at: '2026-09-28T08:49:29.753204Z',
        citation: 'dc/base/WorldDevelopmentIndicators via ONE DFO, retrieved 2026-09-28',
        refreshed_from: null,
    },
    component: {
        type: 'line_chart',
        title: {
            text: 'Kenya: life expectancy since 1960',
            authorship: 'model',
        },
        series: [
            {
                id: 'country_ken_dc_base_worlddevelop_dcid_lifeexpectancy__e3230f',
                label: 'Kenya',
                unit: 'Year',
                source_ref: 'src_dc_base_worlddevelopmentindicators_9957fdf7',
                points: [
                    { period: '1960', value: 48.477 },
                    { period: '2023', value: 61.155 },
                ],
            },
        ],
    },
};
