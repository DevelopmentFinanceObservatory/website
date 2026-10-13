/**
 * Trimmed from a real captured `/api/search/resolve` response for the query
 * "humanitarian aid to North Korea". This fixture is already in the
 * flattened shape `measureMenu.ts` reads, the same shape `flattenSpec`
 * (searchClient.ts) produces and `SearchSentence.tsx` passes to
 * `renderSpecToken`, rather than a raw wire envelope: nothing here exercises
 * the envelope parse.
 *
 * Real spec_id, slot keys/labels/bindings, alternative_measures
 * (definitions verbatim, including their own real spec_ids), and
 * open_axis_facts. Trimmed: `crsTypeOfFlow`'s slot_options cut from 9
 * entries to the 2 real ones the served members actually exhibit
 * (`open_axis_facts`' own `distinct_count: 2` for that property is exact,
 * not fudged by the trim) — dcids/labels/member_counts are the real
 * captured values. Each alternative carries `axis: 'what'`, which the API
 * added after the capture.
 */

import type { OpenConstraintAxisFact, Slot, SpecAlternativeMeasure } from '../../types.ts';

export const northKoreaMeasureSpec = {
    spec_id: 'spec_50cc91e6f7de0df96bab83832081ca1a',
    measure_label: 'gross disbursements (nominal)',
    measure_label_axes: [
        'populationType',
        'measuredProperty',
        'measurementQualifier',
        'financialFlowType',
        'nettingBasis',
    ],
    slots: [
        {
            key: {
                axis: 'how',
                property: { ref: 'crsPurpose', label: 'CRS purpose' },
                label: 'sector',
            },
            binding: {
                kind: 'value',
                value: {
                    ref: { ref: 'CRSPurposeCode700', label: 'humanitarian aid' },
                    value_kind: 'enum_value',
                },
            },
        },
        {
            key: {
                axis: 'how',
                property: { ref: 'crsTypeOfFinance', label: 'CRS type of finance' },
                label: 'instrument',
            },
            binding: {
                kind: 'value',
                value: {
                    ref: { ref: 'CRSTypeOfFinance110', label: 'standard grant' },
                    value_kind: 'enum_value',
                },
            },
        },
        {
            key: {
                axis: 'how',
                property: { ref: 'crsTypeOfFlow', label: 'CRS type of flow' },
                label: 'flow',
            },
            binding: { kind: 'unbound' },
        },
        {
            key: {
                axis: 'how',
                property: { ref: 'financialFlowType', label: 'financial flow type' },
                label: 'financial flow type',
            },
            binding: {
                kind: 'value',
                value: {
                    ref: { ref: 'Disbursement', label: 'disbursement' },
                    value_kind: 'enum_value',
                },
            },
        },
        {
            key: {
                axis: 'how',
                property: { ref: 'nettingBasis', label: 'netting basis' },
                label: 'netting basis',
            },
            binding: {
                kind: 'value',
                value: { ref: { ref: 'Gross', label: 'gross' }, value_kind: 'enum_value' },
            },
        },
    ] as unknown as Slot[],
    alternative_measures: [
        {
            definition: {
                schema_version: 1,
                spec_id: 'spec_ac4fa5f90acb366dfd0c51c198b456ac',
                identity: {
                    identity_version: 'spec1',
                    shape: {
                        kind: 'statvar_schema',
                        population_type: 'FinancialFlow',
                        measured_property: 'amount',
                        stat_type: 'measuredValue',
                        measurement_qualifier: 'Nominal',
                    },
                    slots: [
                        {
                            property: 'crsPurpose',
                            binding: { state: 'value', ref: 'CRSPurposeCode700' },
                        },
                        { property: 'crsTypeOfFinance', binding: { state: 'unbound' } },
                        { property: 'crsTypeOfFlow', binding: { state: 'unbound' } },
                        {
                            property: 'financialFlowType',
                            binding: { state: 'value', ref: 'Disbursement' },
                        },
                        { property: 'nettingBasis', binding: { state: 'value', ref: 'Net' } },
                    ],
                    entities: { destination: ['country/PRK'] },
                    requested_window: { kind: 'all' },
                },
            },
            label: 'net disbursements (nominal)',
            axis: 'what',
        },
        {
            definition: {
                schema_version: 1,
                spec_id: 'spec_36f44c45073c18070c8005f5354fbdcf',
                identity: {
                    identity_version: 'spec1',
                    shape: {
                        kind: 'statvar_schema',
                        population_type: 'FinancialObligation',
                        measured_property: 'amount',
                        stat_type: 'measuredValue',
                        measurement_qualifier: 'Nominal',
                    },
                    slots: [
                        {
                            property: 'crsPurpose',
                            binding: { state: 'value', ref: 'CRSPurposeCode700' },
                        },
                        { property: 'crsTypeOfFinance', binding: { state: 'unbound' } },
                        { property: 'crsTypeOfFlow', binding: { state: 'unbound' } },
                        {
                            property: 'financialObligationType',
                            binding: { state: 'value', ref: 'Commitment' },
                        },
                    ],
                    entities: { destination: ['country/PRK'] },
                    requested_window: { kind: 'all' },
                },
            },
            label: 'commitments (nominal)',
            axis: 'what',
        },
    ] as unknown as SpecAlternativeMeasure[],
    open_axis_facts: [
        {
            property: 'crsTypeOfFinance',
            varies: false,
            value: { ref: 'CRSTypeOfFinance110', label: 'standard grant' },
            distinct_count: 1,
            undeclared_count: 0,
        },
        { property: 'crsTypeOfFlow', varies: true, distinct_count: 2, undeclared_count: 0 },
        {
            property: 'crsCooperationModality',
            varies: true,
            distinct_count: 9,
            undeclared_count: 5,
        },
    ] as OpenConstraintAxisFact[],
};

/** `optionsBySpec`-shaped: the trailing `slot_options` frame for
 *  `crsTypeOfFlow` this spec_id would have streamed, keyed `how:crsTypeOfFlow`
 *  (`keyRef`). `crsCooperationModality` carries no entry here at all — it
 *  has no `spec.slots` entry of its own, so it never has one. */
export const northKoreaSlotOptionsBySpec = {
    [northKoreaMeasureSpec.spec_id]: {
        'how:crsTypeOfFlow': {
            options: [
                {
                    value: {
                        ref: { ref: 'CRSTypeOfFlow10', label: 'official development assistance' },
                        value_kind: 'enum_value',
                    },
                    relation: 'root',
                    member_count: 14293,
                },
                {
                    value: {
                        ref: { ref: 'CRSTypeOfFlow30', label: 'private development finance' },
                        value_kind: 'enum_value',
                    },
                    relation: 'root',
                    member_count: 2714,
                },
            ],
            truncated: false,
        },
    },
};
