/**
 * `component.created` payloads over a quotient of two measures, in the
 * platform's resolved revision envelope shape. The values are those of the
 * components catalogue's `fixtures/stat_card/payload_composed_unit.json` and
 * `fixtures/table/payload_composed_unit.json` (dfo-spec-kit,
 * `dfo_spec_kit_components/catalogue`). They cover a unit label over a StatVar
 * that declares no unit, and a structured numerator over the same StatVar.
 */
export const composedUnit = {
    numerator: 'US Dollar',
    denominator: {
        stat_var: 'dcid:Count_Person',
        label: 'Total population',
    },
};

export const envelopeComposedUnit = {
    schema_version: 1,
    catalog_version: '2026.8.0',
    component_id: 'cmp_01j9zc3tk2m4p7q9r1sz',
    revision: 1,
    provenance: {
        inputs: [
            {
                spec_id: 'ops_9f2e41a7c03b58d2a4c1f6b2e8d35790',
                content_version: 'ocv_f4a81c22d9075e3ba61c2ee98f83b405',
            },
        ],
        execution_ref: null,
        sources: [
            {
                id: 'src_oecd_dac',
                name: 'OECD DAC',
                url: 'https://stats.oecd.org/',
                licence: 'CC BY 4.0',
                retrieved: '2026-06-12',
            },
        ],
        freshness: {
            data_through: '2024',
            last_refreshed: '2026-06-12',
            next_expected: '2026-10',
            partial_period: false,
        },
        warnings: [],
        generated_at: '2026-07-14T10:02:00Z',
        citation: 'OECD DAC via ONE DFO, retrieved 12 June 2026',
        refreshed_from: null,
    },
    component: {
        type: 'stat_card',
        title: {
            text: 'Malaria grants per person in Ethiopia',
            authorship: 'model',
        },
        value: 3.34,
        label: 'Malaria grant disbursements to Ethiopia per person',
        period: '2024',
        unit: {
            numerator: 'US Dollar',
            denominator: {
                stat_var: 'dcid:Count_Person',
                label: 'Total population',
            },
        },
    },
};

export const envelopeComposedUnitTable = {
    schema_version: 1,
    catalog_version: '2026.8.0',
    component_id: 'cmp_01j9zc3xy9m4p7q9r1t0',
    revision: 1,
    provenance: {
        inputs: [
            {
                spec_id: 'ops_9f2e41a7c03b58d2a4c1f6b2e8d35790',
                content_version: 'ocv_f4a81c22d9075e3ba61c2ee98f83b405',
            },
        ],
        execution_ref: null,
        sources: [
            {
                id: 'src_oecd_dac',
                name: 'OECD DAC',
                url: 'https://stats.oecd.org/',
                licence: 'CC BY 4.0',
                retrieved: '2026-06-12',
            },
        ],
        freshness: {
            data_through: '2024',
            last_refreshed: '2026-06-12',
            next_expected: '2026-10',
            partial_period: false,
        },
        warnings: [],
        generated_at: '2026-07-14T10:02:00Z',
        citation: 'OECD DAC via ONE DFO, retrieved 12 June 2026',
        refreshed_from: null,
    },
    component: {
        type: 'table',
        title: {
            text: 'Malaria grant disbursements per person by recipient',
            authorship: 'model',
        },
        columns: [
            {
                key: 'recipient',
                label: 'recipient',
            },
            {
                key: 'period',
                label: 'Period',
            },
            {
                key: 'value',
                label: 'Value',
            },
        ],
        rows: [
            {
                series_id: 'eth_malaria_disbursements_per_person',
                dimensions: {
                    recipient: 'Ethiopia',
                },
                period: '2023',
                source_ref: 'src_oecd_dac',
                unit: {
                    numerator: {
                        currency: 'USD',
                        prices: 'constant',
                        base_year: 2023,
                    },
                    denominator: {
                        stat_var: 'dcid:Count_Person',
                        label: 'Total population',
                    },
                },
                value: 3.37,
            },
            {
                series_id: 'eth_malaria_disbursements_per_person',
                dimensions: {
                    recipient: 'Ethiopia',
                },
                period: '2024',
                source_ref: 'src_oecd_dac',
                unit: {
                    numerator: {
                        currency: 'USD',
                        prices: 'constant',
                        base_year: 2023,
                    },
                    denominator: {
                        stat_var: 'dcid:Count_Person',
                        label: 'Total population',
                    },
                },
                value: 3.34,
            },
            {
                series_id: 'gha_malaria_disbursements_per_person',
                dimensions: {
                    recipient: 'Ghana',
                },
                period: '2023',
                source_ref: 'src_oecd_dac',
                unit: {
                    numerator: {
                        currency: 'USD',
                        prices: 'constant',
                        base_year: 2023,
                    },
                    denominator: {
                        stat_var: 'dcid:Count_Person',
                        label: 'Total population',
                    },
                },
                value: 6.26,
            },
            {
                series_id: 'gha_malaria_disbursements_per_person',
                dimensions: {
                    recipient: 'Ghana',
                },
                period: '2024',
                source_ref: 'src_oecd_dac',
                unit: {
                    numerator: {
                        currency: 'USD',
                        prices: 'constant',
                        base_year: 2023,
                    },
                    denominator: {
                        stat_var: 'dcid:Count_Person',
                        label: 'Total population',
                    },
                },
                value: 6.58,
            },
        ],
    },
};
