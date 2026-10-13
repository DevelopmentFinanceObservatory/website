/**
 * One part of the real `/api/search/resolve` response for "health aid to
 * Kenya" from the dev API, captured 2026-10-05 with observations on, in the
 * page's flattened shape (`flattenSpec`): the resolved Spec keeps its shape
 * label, slots (the sector slot's `expansion` list dropped), entities and
 * observations, and the part keeps its `observations_series_truncated`
 * warning.
 *
 * The capture predates `ObservationSeries.axes` and the warning's
 * `params.order`. This file adds both as the current API sends them: each
 * series' axes are the CRSCooperationModality, CRSPurposeCode,
 * CRSTypeOfFinance and CRSTypeOfFlow values its StatVar dcid names,
 * ordered by property dcid and labelled as the same response labels those
 * values elsewhere, and `order` is "ranked". The series and their points
 * are as captured.
 */

export const kenyaHealthPart = {
    variableText: 'health aid',
    spec: {
        shape: {
            label: 'gross disbursements (health, official development assistance)',
        },
        slots: [
            {
                key: {
                    axis: 'how',
                    property: {
                        ref: 'crsCooperationModality',
                        label: 'CRS cooperation modality',
                    },
                    label: 'modality',
                },
                binding: {
                    kind: 'unbound',
                },
                summable: true,
            },
            {
                key: {
                    axis: 'how',
                    property: {
                        ref: 'crsPurpose',
                        label: 'CRS purpose',
                    },
                    label: 'sector',
                },
                binding: {
                    kind: 'value',
                    value: {
                        ref: {
                            ref: 'CRSPurposeCode120',
                            label: 'health',
                        },
                        value_kind: 'enum_value',
                    },
                },
                summable: true,
            },
            {
                key: {
                    axis: 'how',
                    property: {
                        ref: 'crsTypeOfFinance',
                        label: 'CRS type of finance',
                    },
                    label: 'instrument',
                },
                binding: {
                    kind: 'unbound',
                },
                summable: true,
            },
            {
                key: {
                    axis: 'how',
                    property: {
                        ref: 'crsTypeOfFlow',
                        label: 'CRS type of flow',
                    },
                    label: 'flow',
                },
                binding: {
                    kind: 'value',
                    value: {
                        ref: {
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                        value_kind: 'enum_value',
                    },
                },
                summable: true,
            },
            {
                key: {
                    axis: 'how',
                    property: {
                        ref: 'financialFlowType',
                        label: 'financial flow type',
                    },
                    label: 'financial flow type',
                },
                binding: {
                    kind: 'value',
                    value: {
                        ref: {
                            ref: 'Disbursement',
                            label: 'disbursement',
                        },
                        value_kind: 'enum_value',
                    },
                },
                summable: false,
            },
            {
                key: {
                    axis: 'how',
                    property: {
                        ref: 'nettingBasis',
                        label: 'netting basis',
                    },
                    label: 'netting basis',
                },
                binding: {
                    kind: 'value',
                    value: {
                        ref: {
                            ref: 'Gross',
                            label: 'gross',
                        },
                        value_kind: 'enum_value',
                    },
                },
                summable: false,
            },
            {
                key: {
                    axis: 'where',
                    label: 'place',
                },
                binding: {
                    kind: 'value',
                    value: {
                        ref: {
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                        value_kind: 'entity',
                    },
                },
                summable: false,
            },
            {
                key: {
                    axis: 'when',
                    label: 'time window',
                },
                binding: {
                    kind: 'unbound',
                },
                summable: false,
            },
            {
                key: {
                    axis: 'source',
                    label: 'data source',
                },
                binding: {
                    kind: 'unbound',
                },
                summable: false,
            },
        ],
        entities: [
            {
                ref: 'country/KEN',
                label: 'Kenya',
                entity_type: 'Country',
                role: 'destination',
            },
        ],
        observations: {
            series: [
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12110_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, health policy and administrative management, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/CHE',
                            label: 'Switzerland',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12110',
                            label: 'health policy and administrative management',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2009',
                            value: 98099.0,
                        },
                    ],
                    total_obs: 1,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12110_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, health policy and administrative management, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/DEU',
                            label: 'Germany',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12110',
                            label: 'health policy and administrative management',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2015',
                            value: 1091913.0,
                        },
                        {
                            date: '2016',
                            value: 773208.0,
                        },
                        {
                            date: '2017',
                            value: 1104986.0,
                        },
                        {
                            date: '2018',
                            value: 1361705.0,
                        },
                        {
                            date: '2019',
                            value: 769267.0,
                        },
                        {
                            date: '2020',
                            value: 770642.0,
                        },
                        {
                            date: '2021',
                            value: 347163.0,
                        },
                        {
                            date: '2022',
                            value: 574846.0,
                        },
                        {
                            date: '2023',
                            value: 420195.0,
                        },
                    ],
                    total_obs: 9,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12110_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, health policy and administrative management, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/IRL',
                            label: 'Ireland',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12110',
                            label: 'health policy and administrative management',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2007',
                            value: 45653.0,
                        },
                        {
                            date: '2008',
                            value: 48939.0,
                        },
                        {
                            date: '2009',
                            value: 38991.0,
                        },
                        {
                            date: '2010',
                            value: 15147.0,
                        },
                        {
                            date: '2013',
                            value: 87227.0,
                        },
                        {
                            date: '2014',
                            value: 155379.0,
                        },
                        {
                            date: '2015',
                            value: 98837.0,
                        },
                        {
                            date: '2016',
                            value: 74922.0,
                        },
                        {
                            date: '2017',
                            value: 19071.0,
                        },
                    ],
                    total_obs: 9,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12110_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, health policy and administrative management, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/ITA',
                            label: 'Italy',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12110',
                            label: 'health policy and administrative management',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2018',
                            value: 55711.0,
                        },
                    ],
                    total_obs: 1,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12110_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, health policy and administrative management, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/JPN',
                            label: 'Japan',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12110',
                            label: 'health policy and administrative management',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2012',
                            value: 173994.0,
                        },
                        {
                            date: '2013',
                            value: 42434.0,
                        },
                    ],
                    total_obs: 2,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12110_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, health policy and administrative management, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/NOR',
                            label: 'Norway',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12110',
                            label: 'health policy and administrative management',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2023',
                            value: 136853.0,
                        },
                        {
                            date: '2024',
                            value: 223269.0,
                        },
                    ],
                    total_obs: 2,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12181_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical education and training, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/BEL',
                            label: 'Belgium',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12181',
                            label: 'medical education and training',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2016',
                            value: 50614.0,
                        },
                        {
                            date: '2017',
                            value: 68626.0,
                        },
                    ],
                    total_obs: 2,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12181_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical education and training, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/DEU',
                            label: 'Germany',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12181',
                            label: 'medical education and training',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2017',
                            value: 129432.0,
                        },
                        {
                            date: '2018',
                            value: 139742.0,
                        },
                        {
                            date: '2019',
                            value: 119866.0,
                        },
                        {
                            date: '2020',
                            value: 86122.0,
                        },
                    ],
                    total_obs: 4,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12181_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical education and training, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/IRL',
                            label: 'Ireland',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12181',
                            label: 'medical education and training',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2008',
                            value: 18884.0,
                        },
                        {
                            date: '2009',
                            value: 15987.0,
                        },
                        {
                            date: '2010',
                            value: 14435.0,
                        },
                        {
                            date: '2011',
                            value: 26938.0,
                        },
                        {
                            date: '2013',
                            value: 6676.0,
                        },
                        {
                            date: '2015',
                            value: 114986.0,
                        },
                    ],
                    total_obs: 6,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12181_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical education and training, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/ITA',
                            label: 'Italy',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12181',
                            label: 'medical education and training',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2014',
                            value: 0.0,
                        },
                        {
                            date: '2015',
                            value: 27732.0,
                        },
                        {
                            date: '2018',
                            value: 628800.0,
                        },
                    ],
                    total_obs: 3,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12181_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical education and training, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/JPN',
                            label: 'Japan',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12181',
                            label: 'medical education and training',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2023',
                            value: 237578.0,
                        },
                    ],
                    total_obs: 1,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12182_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical research, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/BEL',
                            label: 'Belgium',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12182',
                            label: 'medical research',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2016',
                            value: 91571.0,
                        },
                        {
                            date: '2017',
                            value: 134835.0,
                        },
                    ],
                    total_obs: 2,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12182_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical research, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/GBR',
                            label: 'United Kingdom',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12182',
                            label: 'medical research',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2010',
                            value: 455437.0,
                        },
                        {
                            date: '2011',
                            value: 752759.0,
                        },
                        {
                            date: '2012',
                            value: 1098242.0,
                        },
                        {
                            date: '2013',
                            value: 1284478.0,
                        },
                        {
                            date: '2014',
                            value: 2412916.0,
                        },
                    ],
                    total_obs: 5,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12191_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical service, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/DEU',
                            label: 'Germany',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12191',
                            label: 'medical service',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2015',
                            value: 267858.0,
                        },
                        {
                            date: '2016',
                            value: 288089.0,
                        },
                        {
                            date: '2017',
                            value: 1578.0,
                        },
                        {
                            date: '2018',
                            value: 110216.0,
                        },
                        {
                            date: '2019',
                            value: 216230.0,
                        },
                        {
                            date: '2020',
                            value: 223636.0,
                        },
                        {
                            date: '2021',
                            value: 147641.0,
                        },
                        {
                            date: '2022',
                            value: 162651.0,
                        },
                        {
                            date: '2023',
                            value: 172897.0,
                        },
                    ],
                    total_obs: 9,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12191_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical service, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/IRL',
                            label: 'Ireland',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12191',
                            label: 'medical service',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2007',
                            value: 40353.0,
                        },
                        {
                            date: '2008',
                            value: 183546.0,
                        },
                        {
                            date: '2009',
                            value: 18173.0,
                        },
                        {
                            date: '2010',
                            value: 162895.0,
                        },
                        {
                            date: '2011',
                            value: 134602.0,
                        },
                        {
                            date: '2013',
                            value: 13092.0,
                        },
                        {
                            date: '2016',
                            value: 62651.0,
                        },
                        {
                            date: '2017',
                            value: 69241.0,
                        },
                        {
                            date: '2018',
                            value: 59157.0,
                        },
                        {
                            date: '2022',
                            value: 5565.0,
                        },
                        {
                            date: '2023',
                            value: 2967.0,
                        },
                    ],
                    total_obs: 11,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12191_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical service, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/ITA',
                            label: 'Italy',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12191',
                            label: 'medical service',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2011',
                            value: 4867.0,
                        },
                        {
                            date: '2012',
                            value: 25707.0,
                        },
                        {
                            date: '2013',
                            value: 0.0,
                        },
                        {
                            date: '2014',
                            value: 66731.0,
                        },
                        {
                            date: '2015',
                            value: 528652.0,
                        },
                        {
                            date: '2016',
                            value: 339654.0,
                        },
                        {
                            date: '2017',
                            value: 162930.0,
                        },
                        {
                            date: '2018',
                            value: 141246.0,
                        },
                        {
                            date: '2019',
                            value: 23508.0,
                        },
                        {
                            date: '2020',
                            value: 80610.0,
                        },
                        {
                            date: '2023',
                            value: 0.0,
                        },
                        {
                            date: '2024',
                            value: 237170.0,
                        },
                    ],
                    total_obs: 12,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12191_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical service, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/JPN',
                            label: 'Japan',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12191',
                            label: 'medical service',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2011',
                            value: 122207.0,
                        },
                        {
                            date: '2022',
                            value: 696000.0,
                        },
                    ],
                    total_obs: 2,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12191_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, medical service, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/KOR',
                            label: 'South Korea',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12191',
                            label: 'medical service',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2009',
                            value: 40293.0,
                        },
                    ],
                    total_obs: 1,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12220_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, basic health care, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/AUS',
                            label: 'Australia',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12220',
                            label: 'basic health care',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2010',
                            value: 882.0,
                        },
                    ],
                    total_obs: 1,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
                {
                    stat_var: {
                        ref: 'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSCooperationModalityB01_CRSPurposeCode12220_Nominal',
                        label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes, basic health care, standard grant, official development assistance, disbursement, and gross',
                    },
                    entities: [
                        {
                            role: 'origin',
                            ref: 'country/CHE',
                            label: 'Switzerland',
                        },
                        {
                            role: 'destination',
                            ref: 'country/KEN',
                            label: 'Kenya',
                        },
                    ],
                    axes: [
                        {
                            property: 'crsCooperationModality',
                            ref: 'CRSCooperationModalityB01',
                            label: 'core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes',
                        },
                        {
                            property: 'crsPurpose',
                            ref: 'CRSPurposeCode12220',
                            label: 'basic health care',
                        },
                        {
                            property: 'crsTypeOfFinance',
                            ref: 'CRSTypeOfFinance110',
                            label: 'standard grant',
                        },
                        {
                            property: 'crsTypeOfFlow',
                            ref: 'CRSTypeOfFlow10',
                            label: 'official development assistance',
                        },
                    ],
                    points: [
                        {
                            date: '2020',
                            value: 1613250.0,
                        },
                        {
                            date: '2021',
                            value: 87527.0,
                        },
                    ],
                    total_obs: 2,
                    source_refs: [
                        {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                    ],
                    facet: {
                        provenance: {
                            ref: 'provenance/OECDCreditorReportingSystem',
                            label: 'OECD Creditor Reporting System (CRS)',
                            source: {
                                ref: 'dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd',
                                label: 'Organisation for Economic Co-operation and Development (OECD)',
                            },
                            data_commons: {
                                id: 'dfo',
                                label: 'Development Finance Observatory',
                            },
                        },
                        unit: {
                            ref: 'CurrencyUSD',
                            label: 'US Dollar',
                        },
                    },
                },
            ],
            total_obs: 3024,
            truncated: false,
        },
    },
    warnings: [
        {
            code: 'observations_series_truncated',
            severity: 'warn',
            message:
                'showing 20 of 683 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.',
            spec_id: 'spec_ea8ff6f802a6a3df5863520f2f05db07',
            params: {
                shown: 20,
                total: 683,
                order: 'ranked',
            },
        },
    ],
};
