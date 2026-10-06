import assert from 'node:assert/strict';
import test from 'node:test';

import {
    graphNodeDescription,
    measureAlternatives,
    measureDefinitionValues,
    measureMenuRefs,
    measureSlotGroups,
    measureSwitchEntry,
    measureVarianceNotes,
    openAxisFactLabel,
    relatedMeasures,
    unitAlternatives,
    unitSwitches,
} from '../measureMenu.ts';
import {
    northKoreaMeasureSpec,
    northKoreaSlotOptionsBySpec,
} from './fixtures/north-korea-measure.ts';
import { servedAnswer } from './fixtures/served-answer.ts';
import {
    servedAid,
    servedDebt,
    servedHealth,
    servedHealthEvents,
} from './fixtures/served-options.ts';
import { tokenStates } from '../departures.ts';
import type { MeasureAxisValue, RelatedMeasure, SpecAlternativeMeasure } from '../types.ts';

// A price-basis sibling of the North Korea measure: the same definition,
// offered on the byline's unit token.
const constantPrices: SpecAlternativeMeasure = {
    ...northKoreaMeasureSpec.alternative_measures[0],
    label: 'constant prices',
    axis: 'unit',
};

test('measureAlternatives and unitAlternatives split alternative_measures by axis', () => {
    const spec = {
        alternative_measures: [...northKoreaMeasureSpec.alternative_measures, constantPrices],
    };

    assert.deepEqual(
        measureAlternatives(spec).map((alternative) => alternative.label),
        ['net disbursements (nominal)', 'commitments (nominal)'],
    );
    assert.deepEqual(unitAlternatives(spec), [constantPrices]);
    assert.deepEqual(unitAlternatives({ alternative_measures: null }), []);
});

test("unitSwitches pairs each price basis with every part's own sibling, and drops a basis a part lacks", () => {
    const atBasis = (specId: string, qualifier: string): SpecAlternativeMeasure => ({
        ...constantPrices,
        definition: { ...constantPrices.definition, spec_id: specId },
        measure_axis_values: [
            { axis: 'measurementQualifier', value: { dcid: qualifier, label: qualifier } },
        ],
    });
    const grantsReal = atBasis('grants-real', 'RealValue');
    const loansReal = atBasis('loans-real', 'RealValue');
    const loansOther = atBasis('loans-other', 'Nominal');
    const grants = { index: 0, spec: { alternative_measures: [grantsReal] } };

    assert.deepEqual(
        unitSwitches([
            grants,
            { index: 2, spec: { alternative_measures: [loansOther, loansReal] } },
        ]),
        [
            {
                measure: grantsReal,
                picks: [
                    { partIndex: 0, measure: grantsReal },
                    { partIndex: 2, measure: loansReal },
                ],
            },
        ],
    );
    assert.deepEqual(
        unitSwitches([grants, { index: 1, spec: { alternative_measures: [loansOther] } }]),
        [],
    );
    // One part keeps every sibling, with no basis to match.
    assert.deepEqual(
        unitSwitches([{ index: 3, spec: { alternative_measures: [constantPrices] } }]),
        [{ measure: constantPrices, picks: [{ partIndex: 3, measure: constantPrices }] }],
    );
});

test('openAxisFactLabel de-camel-cases a property, dropping a CRS prefix when present', () => {
    const cases: [string, string][] = [
        ['crsCooperationModality', 'cooperation modality'],
        ['measuredProperty', 'measured property'],
    ];

    for (const [property, expected] of cases) {
        assert.equal(openAxisFactLabel(property), expected, property);
    }
});

test('measureVarianceNotes has one line, for crsCooperationModality only -- crsTypeOfFlow has options, crsTypeOfFinance does not vary', () => {
    const notes = measureVarianceNotes(northKoreaMeasureSpec, northKoreaSlotOptionsBySpec);

    assert.deepEqual(notes, ['Results vary by cooperation modality (9 values)']);
});

test('measureVarianceNotes covers crsTypeOfFlow too before its slot_options frame arrives -- nothing has options yet', () => {
    const notes = measureVarianceNotes(northKoreaMeasureSpec, {});

    assert.deepEqual(notes, [
        'Results vary by flow (2 values)',
        'Results vary by cooperation modality (9 values)',
    ]);
});

// Trimmed from dev API /api/graph/node/{dcid} answers. The StatVar with a
// description is the node shape once the graph serves one.
const graphNodes: [string, unknown, string | null][] = [
    [
        'a generic node reads properties.description',
        {
            shape: 'node',
            dcid: 'Disbursement',
            label: 'disbursement',
            properties: { description: ["The placing of resources at the recipient's disposal."] },
        },
        "The placing of resources at the recipient's disposal.",
    ],
    [
        'a StatVar node reads its own description',
        {
            shape: 'stat_var',
            dcid: 'sdg/FP_CPI_TOTL_ZG',
            label: 'Annual inflation, consumer prices',
            definition: 'mp=value,pt=SDG_FP_CPI_TOTL_ZG',
            description: 'The annual percentage change in the cost of a basket of goods.',
        },
        'The annual percentage change in the cost of a basket of goods.',
    ],
    [
        'a StatVar node with only a machine definition has none',
        {
            shape: 'stat_var',
            dcid: 'sdg/FP_CPI_TOTL_ZG',
            definition: 'mp=value,pt=SDG_FP_CPI_TOTL_ZG',
        },
        null,
    ],
    ['a node with no properties has none', { shape: 'node', dcid: 'amount', properties: {} }, null],
    ['a node the graph does not hold has none', null, null],
];

for (const [description, node, expected] of graphNodes) {
    test(`graphNodeDescription: ${description}`, () => {
        assert.equal(graphNodeDescription(node), expected);
    });
}

// Inflation in Pakistan on the local API: the indicator's smallest group and
// two of its five related measures.
const currentAccount: RelatedMeasure = {
    stat_var: {
        dcid: 'sdg/BN_CAB_XOKA_GD_ZS',
        label: 'Current account balance as a proportion of GDP',
    },
    definition: {
        schema_version: 1,
        spec_id: 'spec_3af5925ed367064199de038fbc6114a8',
        identity: northKoreaMeasureSpec.alternative_measures[0].definition.identity,
    },
};
const reserves: RelatedMeasure = {
    ...currentAccount,
    stat_var: { dcid: 'sdg/FI_RES_TOTL_MO', label: 'Total reserves in months of imports' },
    definition: { ...currentAccount.definition, spec_id: 'spec_1a156f792cd0b0af6712427feebd5a1e' },
};

test("relatedMeasures lists the related measures under their group's name", () => {
    const related = relatedMeasures({
        related_group: { dcid: 'dc/g/SDG_17.13.1', label: '17.13.1: Macroeconomic Dashboard' },
        related_measures: [currentAccount, reserves],
    });

    assert.equal(related.title, 'Other indicators in 17.13.1: Macroeconomic Dashboard');
    assert.deepEqual(related.measures, [currentAccount, reserves]);
    assert.equal(relatedMeasures({ related_measures: [] }).title, null);
});

test("measureSwitchEntry posts the picked measure's own identity and nothing else", () => {
    const measures = [...northKoreaMeasureSpec.alternative_measures.slice(0, 2), currentAccount];

    for (const measure of measures) {
        assert.deepEqual(measureSwitchEntry('inflation', measure), {
            entry_kind: 'identity',
            variable_text: 'inflation',
            identity: measure.definition.identity,
        });
    }
});

// Humanitarian aid from Germany on the local API: the elected measure and
// its two alternatives.
const axisValues = (values: [string, string, string][]): MeasureAxisValue[] =>
    values.map(([axis, dcid, label]) => ({ axis, value: { dcid, label } }));
const gross = axisValues([
    ['populationType', 'FinancialFlow', 'financial flow'],
    ['measuredProperty', 'amount', 'amount'],
    ['measurementQualifier', 'Nominal', 'nominal'],
    ['financialFlowType', 'Disbursement', 'disbursement'],
    ['nettingBasis', 'Gross', 'gross'],
]);
const net = gross.map((value) =>
    value.axis === 'nettingBasis' ? { ...value, value: { dcid: 'Net', label: 'net' } } : value,
);
const commitments = axisValues([
    ['populationType', 'FinancialObligation', 'financial obligation'],
    ['measuredProperty', 'amount', 'amount'],
    ['measurementQualifier', 'Nominal', 'nominal'],
    ['financialObligationType', 'Commitment', 'commitment'],
]);
const dcids = (refs: { dcid: string }[]) => refs.map((ref) => ref.dcid);

test('measureDefinitionValues defines the values that set a row apart from the other rows', () => {
    assert.deepEqual(dcids(measureDefinitionValues(gross, [net, commitments])), [
        'FinancialFlow',
        'Disbursement',
        'Gross',
    ]);
    assert.deepEqual(dcids(measureDefinitionValues(commitments, [gross, net])), [
        'FinancialObligation',
        'Commitment',
    ]);
});

test('measureDefinitionValues defines every value when no other row differs, and none without values', () => {
    assert.deepEqual(dcids(measureDefinitionValues(commitments, [])), [
        'FinancialObligation',
        'amount',
        'Nominal',
        'Commitment',
    ]);
    assert.deepEqual(
        dcids(measureDefinitionValues(gross, [gross])),
        dcids(gross.map((v) => v.value)),
    );
    assert.deepEqual(measureDefinitionValues(undefined, [gross]), []);
});

// The measure token's groups: the slots its `states` names that offer a
// choice, across dataset families.
const measureGroups = (body: unknown, events?: unknown) => {
    const { plan, parts, optionsBySpec } = servedAnswer(body, events);
    const token = plan.find((candidate) => candidate.axis === 'what' && candidate.text !== '');

    assert.ok(token);

    return measureSlotGroups(parts[0].spec, tokenStates(token), optionsBySpec).map(
        ({ slot, entry }) => [slot.key.label, entry.options.length],
    );
};

test('measureSlotGroups lists each stated slot with a choice: flow for CRS aid, flow type for IDS debt, none for WDI health', () => {
    // "gross ODA disbursements" states flow (3 served options), financial
    // flow type and netting basis, which have no options.
    assert.deepEqual(measureGroups(servedAid), [['flow', 3]]);
    // "external debt service" states financial flow type: servicing payment
    // and disbursement.
    assert.deepEqual(measureGroups(servedDebt), [['financial flow type', 2]]);
    // "health expenditure" states two slots whose one option is their
    // current value.
    assert.deepEqual(measureGroups(servedHealth, servedHealthEvents), []);
});

test('measureSlotGroups keeps a stated slot bound to a set whose options are that set, since one member narrows it', () => {
    const member = (dcid: string) => ({ value_kind: 'entity', ref: { dcid, label: dcid } });
    const key = { axis: 'how', property: { dcid: 'sex', label: 'sex' }, label: 'sex' };
    const spec = {
        spec_id: 'sex-set',
        slots: [{ key, binding: { kind: 'set', values: [member('Female'), member('Male')] } }],
    } as unknown as Parameters<typeof measureSlotGroups>[0];
    const options = [member('Female'), member('Male')].map((value) => ({ value }));
    const optionsBySpec = { 'sex-set': { 'how:sex': { options, truncated: false } } };

    assert.deepEqual(
        measureSlotGroups(spec, ['how:sex'], optionsBySpec).map(
            ({ entry }) => entry.options.length,
        ),
        [2],
    );
});

test('measureMenuRefs names each group slot and, with a measure switch, the unslotted axes the token states', () => {
    const refsOf = (answer: ReturnType<typeof servedAnswer>, switchesMeasure: boolean) => {
        const { plan, parts, optionsBySpec } = answer;
        const token = plan.find((candidate) => candidate.axis === 'what')!;
        const { spec } = parts[0];
        const states = tokenStates(token);

        return measureMenuRefs(
            spec,
            states,
            measureSlotGroups(spec, states, optionsBySpec),
            switchesMeasure,
        );
    };

    // "gross ODA disbursements": flow has a group; financial flow type and
    // netting basis do not.
    assert.deepEqual(refsOf(servedAnswer(servedAid), true), [
        'axis:populationType',
        'axis:measuredProperty',
        'how:crsTypeOfFlow',
    ]);
    // "health expenditure": neither stated slot has a choice, so a
    // departure on expenditure type finds no menu to open.
    assert.deepEqual(refsOf(servedAnswer(servedHealth, servedHealthEvents), false), []);
});
