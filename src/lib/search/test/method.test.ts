/* eslint-disable @typescript-eslint/no-explicit-any -- these tests read the flat spec shape normalizeResponse returns, as view.ts does */
import assert from 'node:assert/strict';
import test from 'node:test';

import { withFacetEdit } from '../promote.ts';
import { METHOD_REF, refineItems, refineKey } from '../refineMenu.ts';
import { normalizeResponse } from '../searchClient.ts';
import { statingTokenIndex } from '../departures.ts';
import type { BaseIdentity, IdentityFacets, SentenceToken, SpecObservations } from '../types.ts';
import {
    ANY_METHOD_LABEL,
    flattenRows,
    formatMethod,
    methodCellText,
    methodPicker,
    NO_METHOD_LABEL,
    sharedMethodPicker,
    sharedMethodServes,
    sourceSlotOptions,
} from '../view.ts';
import { methodBound, methodUnbound } from './fixtures/index.ts';
import { servedAnswer } from './fixtures/served-answer.ts';

const specOf = (body: unknown): any => normalizeResponse(body).parts[0].spec;

/** The unbound fixture's spec as a StatVar with recorded values and one
 *  projection facet would arrive. The served series' facet states no method
 *  (the axis is absent from the sparse map, and so from resolved.facets),
 *  and the only method option is `Estimated`. */
const recordedSpec = (): any => {
    const spec = structuredClone(specOf(methodUnbound));

    for (const series of spec.observations.series) {
        delete series.facet.measurementMethod;
    }
    delete spec.facets.measurementMethod;
    spec.facet_options = spec.facet_options.map((entry: any) =>
        entry.axis === 'measurementMethod'
            ? {
                  ...entry,
                  options: [
                      {
                          value: {
                              ref: { dcid: 'Estimated', label: 'Estimated' },
                              value_kind: 'enum_value',
                          },
                      },
                  ],
              }
            : entry,
    );

    return spec;
};

test('flattenRows carries the served series method label on every row', () => {
    const rows = flattenRows(specOf(methodUnbound));

    assert.ok(rows.length > 0);
    for (const row of rows) {
        assert.equal(row.method, 'Current Price With Base Year as 2011 - 12');
    }
});

test('flattenRows reads null for a series whose facet states no method', () => {
    const rows = flattenRows(recordedSpec());

    assert.ok(rows.length > 0);
    for (const row of rows) {
        assert.equal(row.method, null);
    }
});

test('formatMethod prefers the graph label, else the dcid tail, de-camel-cased', () => {
    assert.equal(formatMethod({ ref: 'Estimated', label: null }), 'Estimated');
    assert.equal(formatMethod({ ref: 'dcAggregate/Census' }), 'Census');
    assert.equal(
        formatMethod({ ref: 'MOSPIFirstAdvanceEstimates' }),
        'MOSPI First Advance Estimates',
    );
    assert.equal(formatMethod(undefined), null);
});

test('formatMethod treats a label equal to the dcid as unlabelled', () => {
    assert.equal(
        formatMethod({ ref: 'dcAggregate/Census', label: 'dcAggregate/Census' }),
        'Census',
    );
    assert.equal(formatMethod({ ref: 'Estimated', label: 'Estimated' }), 'Estimated');
});

test('methodPicker on an unbound axis names the served method and offers every observed one', () => {
    const picker = methodPicker(specOf(methodUnbound));

    assert.ok(picker);
    assert.equal(picker.label, 'Current Price With Base Year as 2011 - 12');
    assert.deepEqual(picker.choices[0], {
        key: '',
        label: ANY_METHOD_LABEL,
        checked: true,
        binding: null,
    });
    assert.equal(picker.choices.length, 8);
    assert.ok(picker.choices.slice(1).every((choice) => !choice.checked));
    assert.deepEqual(
        picker.choices.find((choice) => choice.key === 'MOSPIProvisionalEstimates'),
        {
            key: 'MOSPIProvisionalEstimates',
            label: 'MOSPI Provisional Estimates',
            checked: false,
            binding: { state: 'value', ref: 'MOSPIProvisionalEstimates' },
        },
    );
});

test('methodPicker on a bound axis names and checks the bound method', () => {
    const picker = methodPicker(specOf(methodBound));

    assert.ok(picker);
    assert.equal(picker.label, 'MOSPI Provisional Estimates');
    assert.equal(picker.choices[0].checked, false);
    assert.deepEqual(
        picker.choices.filter((choice) => choice.checked).map((choice) => choice.key),
        ['MOSPIProvisionalEstimates'],
    );
});

test('a shared method token offers and posts only the methods every bound part offers', () => {
    const first = specOf(methodBound);
    const second = structuredClone(first);
    const dropped = 'MOSPISecondAdvanceEstimates';
    const methods = second.facet_options.find((entry: any) => entry.axis === 'measurementMethod');

    methods.options = methods.options.filter((option: any) => option.value.ref?.dcid !== dropped);

    const keys = (specs: any[]) => sharedMethodPicker(specs)?.choices.map((choice) => choice.key);
    const common = keys([second])!;

    assert.ok(keys([first])!.includes(dropped), 'the premise: the first part offers it');
    assert.deepEqual(keys([first, second]), common);
    assert.deepEqual(keys([second, first]), common);
    assert.equal(common[0], '', 'Any method stays first');

    assert.equal(sharedMethodServes([first, second], { state: 'value', ref: dropped }), false);
    assert.equal(sharedMethodServes([first], { state: 'value', ref: dropped }), true);
    assert.equal(sharedMethodServes([first, second], { state: 'value', ref: common[1] }), true);
    assert.equal(sharedMethodServes([first, second], null), true);
});

test('methodPicker offers a projection beside recorded values that state no method', () => {
    const picker = methodPicker(recordedSpec());

    assert.ok(picker);
    assert.equal(picker.label, NO_METHOD_LABEL);
    assert.deepEqual(
        picker.choices.map((choice) => [choice.label, choice.checked]),
        [
            [ANY_METHOD_LABEL, true],
            ['Estimated', false],
        ],
    );
});

test('methodPicker reads Mixed methods when the series served different methods', () => {
    const spec = structuredClone(specOf(methodUnbound));
    const [series] = spec.observations.series;
    spec.observations.series.push({
        ...structuredClone(series),
        entities: [{ role: 'observationAbout', ref: 'country/NPL', label: 'Nepal' }],
        facet: { ...series.facet, measurementMethod: { ref: 'MOSPIProvisionalEstimates' } },
    });
    spec.facets.measurementMethod = { basis: 'fallback', selection: 'per_series' };

    assert.equal(methodPicker(spec)?.label, 'Mixed methods');

    spec.observations = null;
    assert.equal(methodPicker(spec)?.label, 'Mixed methods', 'resolved.facets before series');
});

/** The unbound fixture's spec as a replay serves it today: every series
 *  and `resolved.facets` read `Estimated`, and the method options are
 *  `methods`. */
const estimatedSpec = (methods: string[]): any => {
    const spec = structuredClone(specOf(methodUnbound));
    const estimated = { ref: 'Estimated', label: 'Estimated' };

    for (const series of spec.observations.series) {
        series.facet.measurementMethod = estimated;
    }
    spec.facets.measurementMethod = { basis: 'fallback', ...estimated };
    spec.facet_options = spec.facet_options.map((entry: any) =>
        entry.axis === 'measurementMethod'
            ? {
                  ...entry,
                  options: methods.map((dcid) => ({
                      value: { ref: { dcid, label: dcid }, value_kind: 'enum_value' },
                  })),
              }
            : entry,
    );

    return spec;
};

/** The spec as a snapshot share hydrates it: the frozen observations dfo-apis
 *  serves replace the replay's observations (useSearchRun's
 *  hydrateDefiniteSpec). They were captured under `Census`. */
const snapshotOf = (live: any): any => {
    const frozen: SpecObservations = {
        series: [
            {
                stat_var: { ref: live.observations.series[0].stat_var.ref },
                entities: [{ role: 'observationAbout', ref: 'country/IND', label: 'India' }],
                points: [
                    { date: '2019', value: 100 },
                    { date: '2020', value: 101 },
                ],
                total_obs: 2,
                source_refs: [],
                facet: {
                    unit: { ref: 'INR', label: 'INR' },
                    measurementMethod: { ref: 'Census', label: 'Census' },
                },
            },
        ],
        total_obs: 2,
        truncated: false,
    };

    return { ...live, observations: frozen };
};

test('a snapshot names the captured method when the replay now serves another', () => {
    const live = estimatedSpec(['Census', 'Estimated']);

    assert.equal(methodPicker(live)?.label, 'Estimated');

    const snapshot = snapshotOf(live);

    assert.deepEqual(
        [...new Set(flattenRows(snapshot).map((row) => row.method))],
        ['Census'],
        'the table shows the captured method',
    );
    assert.equal(methodPicker(snapshot)?.label, 'Census');
    assert.equal(methodPicker(snapshot)?.choices[0].checked, true);
});

test('a snapshot keeps the picker when the replay serves the only method on offer', () => {
    const live = estimatedSpec(['Estimated']);

    assert.equal(methodPicker(live), null, 'the replay alone has nothing to switch to');

    const picker = methodPicker(snapshotOf(live));

    assert.ok(picker);
    assert.equal(picker.label, 'Census');
    assert.deepEqual(
        picker.choices.map((choice) => [choice.label, choice.checked]),
        [
            [ANY_METHOD_LABEL, true],
            ['Estimated', false],
        ],
    );
});

test('methodPicker is null with nothing to switch to', () => {
    const spec = structuredClone(specOf(methodUnbound));
    spec.facet_options = spec.facet_options.map((entry: any) =>
        entry.axis === 'measurementMethod'
            ? {
                  ...entry,
                  options: entry.options.filter(
                      (option: any) => option.value.ref.dcid === spec.facets.measurementMethod.ref,
                  ),
              }
            : entry,
    );

    assert.equal(methodPicker(spec), null, 'unbound axis already serving the only option');

    spec.facet_options = spec.facet_options.filter(
        (entry: any) => entry.axis !== 'measurementMethod',
    );
    assert.equal(methodPicker(spec), null, 'no method options at all');
});

test('picking a method binds identity.facets.measurementMethod', () => {
    const spec = specOf(methodUnbound);
    const choice = methodPicker(spec)?.choices.find(
        (entry) => entry.key === 'MOSPIProvisionalEstimates',
    );

    assert.ok(choice);
    const edit = withFacetEdit(spec.identity as BaseIdentity, 'measurementMethod', choice.binding);

    assert.deepEqual(edit.facets, {
        measurementMethod: { state: 'value', ref: 'MOSPIProvisionalEstimates' },
    });
});

test('Any method on a bound axis drops the binding', () => {
    const spec = specOf(methodBound);
    const anyMethod = methodPicker(spec)?.choices[0];

    assert.ok(anyMethod);
    const edit = withFacetEdit(
        spec.identity as BaseIdentity,
        'measurementMethod',
        anyMethod.binding,
    );

    assert.equal(edit.facets, undefined);
});

test('sourceSlotOptions still reads only the provenance axis', () => {
    const options = sourceSlotOptions(specOf(methodUnbound));

    assert.deepEqual(
        options.map((option) => option.value.ref.dcid),
        [
            'dc/base/India_NationalAccountsStatistics',
            'dc/base/India_RBIStateDomesticProduct_AggCountry',
            'dc/base/India_RBIStateDomesticProduct_StatVarAgg_AggCountry',
        ],
    );
});

/** The live measurementMethod options for "Kenya public and publicly
 *  guaranteed external debt service 2022 to 2030": a declared projection
 *  method and the ref-less option for the facets that declare none. */
const LIVE_METHOD_OPTIONS = {
    axis: 'measurementMethod',
    truncated: false,
    source: 'observed',
    options: [
        { value: { ref: { dcid: 'Estimated', label: 'estimated' }, value_kind: 'enum_value' } },
        { value: { value_kind: 'enum_value' } },
    ],
};

/** The unbound fixture's wire body with its method options replaced by
 *  `LIVE_METHOD_OPTIONS`, its series stating no method, and
 *  `identity.facets` set to `facets` when given (the engine echoes a
 *  posted binding back in the identity). */
const noMethodBody = (facets?: Record<string, unknown>): any => {
    const body: any = structuredClone(methodUnbound);
    const spec = body.parts[0].spec;

    spec.resolved.facet_options = spec.resolved.facet_options.map((entry: any) =>
        entry.axis === 'measurementMethod' ? LIVE_METHOD_OPTIONS : entry,
    );
    for (const series of spec.resolved.observations.series) {
        delete series.facet.measurementMethod;
    }
    delete spec.resolved.facets.measurementMethod;
    if (facets) {
        spec.definition.identity.facets = facets;
    }

    return body;
};

const noMethodSpec = (facets?: Record<string, unknown>): any => specOf(noMethodBody(facets));

test('normalizeResponse keeps the ref-less method option and the picker lists it last', () => {
    const spec = noMethodSpec();
    const entry = spec.facet_options.find((option: any) => option.axis === 'measurementMethod');

    assert.deepEqual(entry.options[1], { value: { value_kind: 'enum_value' } });

    const picker = methodPicker(spec);

    assert.ok(picker);
    assert.equal(picker.label, NO_METHOD_LABEL);
    assert.deepEqual(picker.choices, [
        { key: '', label: ANY_METHOD_LABEL, checked: true, binding: null },
        {
            key: 'Estimated',
            label: 'Estimated',
            checked: false,
            binding: { state: 'value', ref: 'Estimated' },
        },
        {
            key: NO_METHOD_LABEL,
            label: NO_METHOD_LABEL,
            checked: false,
            binding: { state: 'value', ref: null },
        },
    ]);
});

test('a repeated ref-less option is listed once', () => {
    const spec = noMethodSpec();

    spec.facet_options = [...spec.facet_options, LIVE_METHOD_OPTIONS];

    assert.deepEqual(
        methodPicker(spec)?.choices.map((choice) => choice.key),
        ['', 'Estimated', NO_METHOD_LABEL],
    );
});

test('picking No stated method posts a null method ref', () => {
    const spec = noMethodSpec();
    const choice = methodPicker(spec)?.choices.find((entry) => entry.label === NO_METHOD_LABEL);

    assert.ok(choice);
    const edit = withFacetEdit(spec.identity as BaseIdentity, 'measurementMethod', choice.binding);

    assert.deepEqual(edit.facets, {
        measurementMethod: { state: 'value', ref: null },
    });
    assert.match(
        JSON.stringify({ identity: edit }),
        /"measurementMethod":\{"state":"value","ref":null\}/,
        'the posted body carries ref: null',
    );
});

test('an echoed null method ref reads No stated method and checks only that choice', () => {
    const spec = noMethodSpec({ measurementMethod: { state: 'value', ref: null } });
    const picker = methodPicker(spec);

    assert.ok(picker);
    assert.equal(picker.label, NO_METHOD_LABEL);
    assert.deepEqual(
        picker.choices.filter((choice) => choice.checked).map((choice) => choice.key),
        [NO_METHOD_LABEL],
    );

    const edit = withFacetEdit(
        spec.identity as BaseIdentity,
        'measurementMethod',
        picker.choices[0].binding,
    );

    assert.equal(edit.facets, undefined, 'Any method drops the null binding');
});

test('the Method column names a row without a method beside rows with one', () => {
    const spec = noMethodSpec();
    const [series] = spec.observations.series;

    spec.observations.series.push({
        ...structuredClone(series),
        entities: [{ role: 'observationAbout', ref: 'country/NPL', label: 'Nepal' }],
        facet: { ...series.facet, measurementMethod: { ref: 'Estimated', label: 'Estimated' } },
    });

    const cells = new Set(flattenRows(spec).map(methodCellText));

    assert.deepEqual([...cells].sort(), ['Estimated', NO_METHOD_LABEL]);
});

test('sourceSlotOptions skips a provenance option with no ref', () => {
    const spec = structuredClone(specOf(methodUnbound));
    const provenance = spec.facet_options.find((entry: any) => entry.axis === 'provenance');

    provenance.options.push({ value: { value_kind: 'source' } });

    assert.equal(sourceSlotOptions(spec).length, 3);
});

test('method labels read in sentence case while the posted ref keeps the dcid', () => {
    assert.equal(formatMethod({ ref: 'Estimated', label: 'estimated' }), 'Estimated');
    assert.equal(formatMethod({ ref: 'dcAggregate/census' }), 'Census');

    const spec = noMethodSpec({ measurementMethod: { state: 'value', ref: 'Estimated' } });
    const picker = methodPicker(spec);

    assert.ok(picker);
    assert.equal(picker.label, 'Estimated', 'the trigger');
    assert.deepEqual(
        picker.choices.map((choice) => choice.label),
        [ANY_METHOD_LABEL, 'Estimated', NO_METHOD_LABEL],
    );
    assert.deepEqual(picker.choices[1].binding, { state: 'value', ref: 'Estimated' });

    for (const series of spec.observations.series) {
        series.facet.measurementMethod = { ref: 'Estimated', label: 'estimated' };
    }
    assert.deepEqual([...new Set(flattenRows(spec).map(methodCellText))], ['Estimated']);
});

// `pnpm typecheck` checks this file: each @ts-expect-error fails the build
// if the types stop refusing the line under it.
test('the identity types take a null ref on measurementMethod and unit only', () => {
    const facets: IdentityFacets = {
        measurementMethod: { state: 'value', ref: null },
        unit: { state: 'value', ref: null },
        // @ts-expect-error -- every facet carries a provenance, so a null ref names nothing
        provenance: { state: 'value', ref: null },
    };
    const identity = noMethodSpec().identity as BaseIdentity;

    // @ts-expect-error -- withFacetEdit types the binding by its axis
    withFacetEdit(identity, 'provenance', { state: 'value', ref: null });

    assert.deepEqual(facets.measurementMethod, { state: 'value', ref: null });
});

/** `body` with the byline method token dfo-apis states while the identity
 *  binds a method: " · " and the token after the source token, before the
 *  byline's closing full stop. */
const withMethodToken = (body: unknown, text: string): any => {
    const withToken: any = structuredClone(body);
    const plan: SentenceToken[] = withToken.sentence_plan;
    const stop = plan.findLastIndex(
        (token) => token.segment === 'byline' && token.kind === 'text' && token.text === '.',
    );
    const token: SentenceToken = {
        kind: 'slot',
        text,
        axis: 'method',
        segment: 'byline',
        binding_ref: METHOD_REF,
        entity_refs: [],
        states: [METHOD_REF],
    };

    assert.equal(plan[stop - 1]?.axis, 'source', 'the source token closes the byline');
    plan.splice(stop, 0, { kind: 'text', text: ' · ', segment: 'byline', states: [] }, token);

    return withToken;
};

/** The unbound fixture's wire body whose only method option is the one its
 *  series serve, `Estimated`. */
const singleMethodBody = (): any => {
    const body: any = structuredClone(methodUnbound);
    const spec = body.parts[0].spec;
    const estimated = { ref: 'Estimated', label: 'Estimated' };

    for (const series of spec.resolved.observations.series) {
        series.facet.measurementMethod = estimated;
    }
    spec.resolved.facets.measurementMethod = { basis: 'fallback', ...estimated };
    spec.resolved.facet_options = spec.resolved.facet_options.map((entry: any) =>
        entry.axis === 'measurementMethod'
            ? {
                  ...entry,
                  options: [
                      {
                          value: {
                              ref: { dcid: 'Estimated', label: 'Estimated' },
                              value_kind: 'enum_value',
                          },
                      },
                  ],
              }
            : entry,
    );

    return body;
};

/** What the page offers for the method of `body`'s one part: the Refine
 *  method entry's current value and checked choice, and the byline token
 *  stating "method:" with the choice its menu checks. */
const methodOffer = (body: unknown) => {
    const answer = servedAnswer(body);
    const [part] = answer.parts;
    const entry = refineItems({ ...answer, entityOptionsBySpec: {} }).find(
        (item) => item.key === refineKey(0, METHOD_REF),
    );
    const at = statingTokenIndex(answer.plan, answer.partCount, 0, METHOD_REF);
    const checked = (choices: { label: string; checked: boolean }[] | undefined) =>
        choices?.filter((choice) => choice.checked).map((choice) => choice.label);

    return {
        refine:
            entry?.kind === 'facet'
                ? { current: entry.current, checked: checked(entry.picker.choices) }
                : null,
        token:
            at === -1
                ? null
                : {
                      text: answer.plan[at].text,
                      checked: checked(methodPicker(part.spec)?.choices),
                  },
    };
};

test('the method is a Refine entry while unbound and a byline token while bound', () => {
    const cases: [string, unknown, ReturnType<typeof methodOffer>][] = [
        // Estimated beside the facets that state no method.
        [
            'unbound, two methods',
            noMethodBody(),
            { refine: { current: null, checked: [ANY_METHOD_LABEL] }, token: null },
        ],
        [
            'bound',
            withMethodToken(methodBound, 'MOSPI Provisional Estimates'),
            {
                refine: null,
                token: {
                    text: 'MOSPI Provisional Estimates',
                    checked: ['MOSPI Provisional Estimates'],
                },
            },
        ],
        [
            'bound to no stated method',
            withMethodToken(
                noMethodBody({ measurementMethod: { state: 'value', ref: null } }),
                'no stated method',
            ),
            { refine: null, token: { text: 'no stated method', checked: [NO_METHOD_LABEL] } },
        ],
        // The answer already serves the only method on offer.
        ['unbound, one method', singleMethodBody(), { refine: null, token: null }],
    ];

    for (const [name, body, offer] of cases) {
        assert.deepEqual(methodOffer(body), offer, name);
    }
});

test('a bound method no token states is a Refine entry naming it', () => {
    assert.deepEqual(methodOffer(methodBound), {
        refine: {
            current: 'MOSPI Provisional Estimates',
            checked: ['MOSPI Provisional Estimates'],
        },
        token: null,
    });
});
