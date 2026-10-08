import assert from 'node:assert/strict';
import test from 'node:test';

import { keyRef, normalizeResponse } from '../searchClient.ts';
import { tokenPart } from '../sentencePlan.ts';
import { fixtures } from './fixtures/index.ts';
import { noDataResponse, wireSpec } from './fixtures/no-data.ts';
import { servedAnswer } from './fixtures/served-answer.ts';
import { servedAid, servedHealth, servedHealthEvents } from './fixtures/served-options.ts';
import {
    ambiguousEntityMenuTitle,
    ambiguousWordingGroup,
    anchorDcid,
    buildPlaceOptionGroups,
    coverageSentence,
    currentEntityDcids,
    detailRows,
    downloadRowCount,
    entityOptionsEntry,
    entitySlotBindingForRefs,
    isLevelScopedOptions,
    levelMenu,
    mergeEntityOptionsEntry,
    mergePlaceOptionsEntry,
    mergeSlotOptionsEntry,
    missingPlaceOptionScopes,
    noDataCallout,
    noDataText,
    observationsOmissionText,
    openEntityEntry,
    operationProgressText,
    optionMuted,
    partitionLevelOptions,
    placeEditorPickRoute,
    placeOptionsForSpec,
    placeOptionsSignature,
    planPlaceOptions,
    PREFETCH_GRACE_MS,
    rankOptionsByCoverage,
    resolveObservationsOmission,
    rootGroups,
    rowsLabel,
    slotOffersChoice,
    seriesPreviewCaptions,
    sharedDirectionalEditRoute,
    sharedEntityOptions,
    showGroupHeadings,
    slotOptionLabel,
    slotOptionsEntry,
    splitCurrentPick,
} from '../view.ts';
import type { EntityOptionsBySpec, PlaceOptionScopeResult, PlaceOptionsEntry } from '../view.ts';
import type { SentenceToken } from '../types.ts';

test('entity_options reducer preserves the SSE truncation flag for a destination', () => {
    const entries = mergeEntityOptionsEntry({}, 'spec-1', {
        role: 'destination',
        options: [
            {
                value: {
                    value_kind: 'entity',
                    ref: { dcid: 'country/KEN', label: 'Kenya' },
                },
            },
        ],
        truncated: true,
    });

    assert.equal(
        entityOptionsEntry({ spec_id: 'spec-1' }, entries, 'destination')?.truncated,
        true,
    );
});

test('openEntityEntry retains the open origin entry used by Add Criteria', () => {
    const entries = {
        'spec-1': [{ role: 'origin' as const, options: [], truncated: false }],
    };

    assert.equal(openEntityEntry({ spec_id: 'spec-1' }, entries, 'origin')?.role, 'origin');
});

test('openEntityEntry preserves a truncated count-only destination for its lazy picker', () => {
    const entries = {
        'spec-1': [{ role: 'destination' as const, options: [], truncated: true }],
    };

    assert.deepEqual(openEntityEntry({ spec_id: 'spec-1' }, entries, 'destination'), {
        role: 'destination',
        options: [],
        truncated: true,
    });
});

test('sharedEntityOptions exposes only recipients every touched part can accept', () => {
    const option = (dcid: string, label: string) => ({
        value: { value_kind: 'entity' as const, ref: { dcid, label } },
    });
    const entries = {
        first: [
            {
                role: 'destination' as const,
                options: [option('country/KEN', 'Kenya'), option('country/GHA', 'Ghana')],
                truncated: false,
            },
        ],
        second: [
            {
                role: 'destination' as const,
                options: [option('country/KEN', 'Kenya'), option('country/RWA', 'Rwanda')],
                truncated: true,
            },
        ],
    } satisfies EntityOptionsBySpec;

    const shared = sharedEntityOptions(
        [{ spec_id: 'first' }, { spec_id: 'second' }],
        entries,
        'destination',
    );

    assert.deepEqual(shared?.options, [option('country/KEN', 'Kenya')]);
    assert.equal(shared?.truncated, true);
});

test('sharedEntityOptions does not use a representative list when a touched part lacks that role', () => {
    const entries = {
        first: [
            {
                role: 'origin' as const,
                options: [
                    {
                        value: {
                            value_kind: 'entity' as const,
                            ref: { dcid: 'country/FRA', label: 'France' },
                        },
                    },
                ],
                truncated: false,
            },
        ],
    } satisfies EntityOptionsBySpec;

    assert.equal(
        sharedEntityOptions([{ spec_id: 'first' }, { spec_id: 'second' }], entries, 'origin'),
        undefined,
    );
});

test('a hoisted bound destination refines the sentence instead of using a shared representative menu', () => {
    assert.equal(sharedDirectionalEditRoute(['country/KEN'], undefined), 'bound-refine');
});

test('noDataText names the rejected qualifier terms instead of parsing the sentence', () => {
    assert.equal(
        noDataText({
            reason: 'qualifier_not_bound',
            unbound_qualifiers: [{ text: 'budget support', named: [], disposition: 'unbound' }],
        }),
        "We couldn't apply “budget support” to this query.",
    );
});

test('noDataText explains that a no-vocabulary qualifier distinction is not recorded', () => {
    assert.equal(
        noDataText({
            reason: 'qualifier_not_bound',
            unbound_qualifiers: [
                { text: 'budget support', named: [], disposition: 'no_vocabulary' },
            ],
        }),
        'This data does not record the distinction “budget support”. Try again without it.',
    );
});

test('noDataText explains a role_incompatible flagged_match by direction, not by parsing the sentence', () => {
    assert.equal(
        noDataText({ reason: 'role_incompatible' }),
        'The matched series is not published as a flow to or from that place.',
    );
});

test('noDataText names the gate for a reason paired with a flagged_match but no unbound_qualifiers', () => {
    assert.equal(
        noDataText({ reason: 'facet_not_available', gate: 'no_member_has_data_at_place' }),
        'Data exists, but not from the requested source, method, or unit. That match has no data at this place.',
    );
});

test('noDataText names the only_alternate_has_data gate, honest that a different variable answers instead', () => {
    assert.equal(
        noDataText({ reason: 'no_matching_slice', gate: 'only_alternate_has_data' }),
        'That specific combination is unavailable as a data series. Only a different variable has data for this request.',
    );
});

// --- noDataCallout ----------------------------------------------------

const QUESTION = 'government expenditure Kenya received as a donor in 2020';

test('noDataCallout hands the flagged match the full question as editText when the match has no rendered sentence', () => {
    const response = noDataResponse('role_incompatible', null, {
        flagged_match: wireSpec('spec_flagged'),
    });
    const part = normalizeResponse(response).parts[0];

    const callout = noDataCallout(part, QUESTION);

    assert.equal(callout?.kind, 'flagged');
    assert.equal(callout && 'editText' in callout ? callout.editText : undefined, QUESTION);
    assert.notEqual(
        callout && 'editText' in callout ? callout.editText : undefined,
        part.variable_text,
    );
});

test('noDataCallout hands the flagged match its own rendered sentence as editText when it has one', () => {
    const sentence = 'Kenya received budget support in 2020.';
    const response = noDataResponse('role_incompatible', null, {
        flagged_match: wireSpec('spec_flagged', { rendered_sentence: sentence }),
    });
    const part = normalizeResponse(response).parts[0];

    const callout = noDataCallout(part, QUESTION);

    assert.equal(callout?.kind, 'flagged');
    assert.equal(callout && 'editText' in callout ? callout.editText : undefined, sentence);
});

test('noDataCallout offers the alternate match, not Studio, for an only_alternate_has_data gate', () => {
    const response = noDataResponse('no_matching_slice', 'only_alternate_has_data', {
        alternate_match: wireSpec('spec_alternate'),
    });
    const part = normalizeResponse(response).parts[0];

    const callout = noDataCallout(part, QUESTION);

    assert.equal(callout?.kind, 'alternate');
    assert.equal(callout && 'spec' in callout ? callout.spec.spec_id : undefined, 'spec_alternate');
});

test('noDataCallout falls back to Studio when neither a flagged nor alternate match exists and nearest_real is empty', () => {
    const response = noDataResponse('variable_not_resolved', null, {});
    const part = normalizeResponse(response).parts[0];

    assert.deepEqual(noDataCallout(part, QUESTION), { kind: 'studio' });
});

test('noDataCallout is null when nearest_real is non-empty, leaving the nearest-subsets branch to the caller', () => {
    const response = noDataResponse('no_observations', null, {
        nearest_real: [wireSpec('spec_near')],
    });
    const part = normalizeResponse(response).parts[0];

    assert.equal(noDataCallout(part, QUESTION), null);
});

// --- coverageSentence / seriesPreviewCaptions ----------------------------

// Headlines recorded on the dev API: humanitarian aid from Germany, ODA from
// Germany, education aid to Nigeria, and the health catalogue question.
test('coverageSentence names the scope of every count, with singular nouns for one', () => {
    const germany = [{ ref: 'country/DEU', label: 'Germany', role: 'origin' }];
    const nigeria = [{ ref: 'country/NGA', label: 'Nigeria', role: 'destination' }];
    const latest = (observations: number, provider: number, recipient: number) => ({
        year: 2024,
        year_named: false,
        observations,
        series: observations,
        role_counts: { financingProvider: provider, financingRecipient: recipient },
    });
    const dimensions = (recipients: number) => ({
        kind: 'breadth',
        dimensions: [
            { label: 'recipients', count: recipients },
            { label: 'variables', count: 39 },
        ],
    });
    const cases = [
        {
            spec: { headline: latest(155, 1, 61), entities: germany, coverage: dimensions(145) },
            sentence:
                '2024 is the latest year with data, with 155 values for 61 of the 145 recipients that have data from Germany.',
        },
        {
            spec: { headline: latest(157, 34, 1), entities: nigeria, coverage: { dimensions: [] } },
            sentence:
                '2024 is the latest year with data, with 157 values from 34 providers to Nigeria.',
        },
        {
            spec: { headline: latest(5, 4, 2), entities: [], coverage: dimensions(42) },
            sentence:
                '2024 is the latest year with data, with 5 values from 4 providers for 2 of the 42 recipients that have data.',
        },
        {
            spec: { headline: latest(1, 1, 1), entities: germany, coverage: dimensions(1) },
            sentence:
                '2024 is the latest year with data, with 1 value for the one recipient that has data from Germany.',
        },
        {
            spec: {
                headline: {
                    ...latest(30, 1, 30),
                    year: 2020,
                    year_named: true,
                    named_window: { start_year: 2020, end_year: 2020 },
                },
                entities: germany,
                coverage: dimensions(30),
            },
            sentence: '2020 has 30 values for all 30 recipients that have data from Germany.',
        },
        {
            spec: {
                headline: {
                    ...latest(157, 34, 1),
                    year: 2020,
                    year_named: true,
                    named_window: { start_year: 2015, end_year: 2020 },
                },
                entities: nigeria,
                coverage: { dimensions: [] },
            },
            sentence:
                '2020 is the latest year with data in the years asked, with 157 values from 34 providers to Nigeria.',
        },
    ];

    for (const { spec, sentence } of cases) {
        assert.equal(coverageSentence(spec), sentence);
    }

    assert.equal(coverageSentence({ coverage: dimensions(145) }), null);
});

test('seriesPreviewCaptions counts the series a truncated preview holds, labelled per part', () => {
    const series = Array.from({ length: 20 }, (_, index) => ({ series_key: String(index) }));
    const truncated = [{ code: 'observations_series_truncated' }];
    const part = { variableText: 'humanitarian aid', spec: { observations: { series } } };

    assert.deepEqual(seriesPreviewCaptions([{ ...part, warnings: truncated }]), [
        'Showing 20 series, in no particular order',
    ]);
    assert.deepEqual(
        seriesPreviewCaptions([
            { ...part, warnings: truncated },
            { ...part, variableText: 'GDP', warnings: [] },
        ]),
        ['humanitarian aid: Showing 20 series, in no particular order'],
    );
    assert.deepEqual(seriesPreviewCaptions([{ ...part, warnings: [] }]), []);
    const cases: [Record<string, number | string>, string][] = [
        [{ shown: 20, total: 927 }, 'Showing 20 of 927 series, in no particular order'],
        [
            { shown: 20, total: 927, order: 'fixed' },
            'Showing 20 of 927 series, in no particular order',
        ],
        [
            { shown: 20, total: 683, order: 'ranked' },
            'Showing 20 of 683 series, most recent and largest first',
        ],
    ];

    for (const [params, caption] of cases) {
        assert.deepEqual(
            seriesPreviewCaptions([
                { ...part, warnings: [{ code: 'observations_series_truncated', params }] },
            ]),
            [caption],
        );
    }

    // The observations' own order describes the rows shown, so it wins over a
    // disagreeing warning.
    const withOrder = (order: 'ranked' | 'fixed', warningOrder: string) => [
        {
            ...part,
            spec: { observations: { series, order } },
            warnings: [
                {
                    code: 'observations_series_truncated',
                    params: { shown: 20, total: 683, order: warningOrder },
                },
            ],
        },
    ];

    assert.deepEqual(seriesPreviewCaptions(withOrder('ranked', 'fixed')), [
        'Showing 20 of 683 series, most recent and largest first',
    ]);
    assert.deepEqual(seriesPreviewCaptions(withOrder('fixed', 'ranked')), [
        'Showing 20 of 683 series, in no particular order',
    ]);
});

// --- downloadRowCount / detailRows ----------------------------------------

// ODA from Germany on the local API: the download facts, unit, source and
// open axes behind the right panel.
const odaPanelSpec = {
    download: {
        rows: 152601,
        rows_exact: true,
        series: 32490,
        window: { start_year: 1973, end_year: 2024 },
        licence: { label: 'OECD Terms and Conditions' },
    },
    facets: { unit: { ref: 'CurrencyUSD', label: 'US Dollar' } },
    resolution: {
        resolved_sources: [
            {
                dcid: 'provenance/OECDCreditorReportingSystem',
                label: 'OECD Creditor Reporting System (CRS)',
            },
        ],
    },
    slots: [
        {
            key: { axis: 'how', property: { dcid: 'crsCooperationModality' }, label: 'modality' },
        },
    ],
    open_axis_facts: [
        { property: 'crsPurpose', varies: true, distinct_count: 229, undeclared_count: 0 },
        {
            property: 'crsCooperationModality',
            varies: true,
            distinct_count: 17,
            undeclared_count: 301,
        },
        { property: 'crsChannel', varies: false, distinct_count: 0, undeclared_count: 1626 },
    ],
    confidence: 'medium',
    coverage: { kind: 'breadth', dimensions: [{ label: 'recipients', count: 191 }] },
};

test('downloadRowCount reads the rows in the file, an upper bound as up to, and nothing it cannot count', () => {
    assert.deepEqual(downloadRowCount(odaPanelSpec), { rows: 152601, upTo: false });
    assert.deepEqual(downloadRowCount({ download: { rows: 23, rows_exact: false } }), {
        rows: 23,
        upTo: true,
    });
    assert.equal(downloadRowCount({ download: { rows: null, rows_exact: false } }), null);
    // A breadth answer's one-year count is no stand-in for the file.
    assert.equal(downloadRowCount({ coverage: { observation_count: 7618 } }), null);
});

test('detailRows describes the file: years, series, unit, licence linked to its source, size once measured, and gaps', () => {
    assert.deepEqual(detailRows(odaPanelSpec, 48_213_000), [
        { label: 'Years', value: '1973 to 2024' },
        { label: 'Series', value: '32,490' },
        { label: 'Unit', value: 'US Dollar' },
        {
            label: 'Licence',
            value: 'OECD Terms and Conditions',
            source: 'provenance/OECDCreditorReportingSystem',
        },
        { label: 'File size', value: '48.2 MB' },
        { label: 'Gaps', value: '301 variables state no modality' },
    ]);
});

test('detailRows leaves out what the API did not send, and links no licence for an answer over several sources', () => {
    const inflation = {
        download: {
            rows: 23,
            rows_exact: true,
            series: 1,
            window: { start_year: 2000, end_year: 2022 },
            licence: { label: 'PublicDomain' },
        },
        resolution: { resolved_sources: [{ dcid: 'a' }, { dcid: 'b' }] },
    };

    assert.deepEqual(detailRows(inflation), [
        { label: 'Years', value: '2000 to 2022' },
        { label: 'Series', value: '1' },
        { label: 'Licence', value: 'Public Domain' },
    ]);
    assert.deepEqual(detailRows({ download: null }, 1830), [
        { label: 'File size', value: '1.8 KB' },
    ]);
});

test('detailRows qualifies years and series as upper bounds when the row count is one', () => {
    // ODA from Germany to Kenya in euros: the conversion drops the rows a
    // rate table lacks, so rows, series and years are all at most.
    const converted = (window: object) => ({
        download: { rows: 2426, rows_exact: false, series: 486, window },
    });

    assert.deepEqual(detailRows(converted({ start_year: 1973, end_year: 2024 })), [
        { label: 'Years', value: 'within 1973 to 2024' },
        { label: 'Series', value: 'up to 486' },
    ]);
    assert.deepEqual(detailRows(converted({ start_year: 1990, end_year: null })), [
        { label: 'Series', value: 'up to 486' },
    ]);
});

test('noDataText offers the currencies a unit_not_resolved refusal carries', () => {
    assert.equal(
        noDataText({
            reason: 'unit_not_resolved',
            unit_alternatives: [
                { currency: 'XOF', label: 'West African CFA franc' },
                { currency: 'XAF', label: 'Central African CFA franc' },
                { currency: 'CHF', label: 'Swiss franc' },
            ],
        }),
        "We couldn't read the requested unit in that query. Did you mean West African CFA franc, Central African CFA franc, or Swiss franc?",
    );
});

test("noDataText reads a role alternative as that role's currency and keeps ISO labels", () => {
    assert.equal(
        noDataText({
            reason: 'unit_not_resolved',
            unit_alternatives: [
                { currency: { role: 'origin' }, label: 'provider' },
                { currency: { role: 'destination' }, label: 'recipient' },
            ],
        }),
        "We couldn't read the requested unit in that query. Did you mean the provider's currency or the recipient's currency?",
    );
    assert.equal(
        noDataText({
            reason: 'unit_not_resolved',
            unit_alternatives: [
                { currency: 'EUR', label: 'Euro' },
                { currency: { role: 'destination' }, label: 'recipient' },
            ],
        }),
        "We couldn't read the requested unit in that query. Did you mean Euro or the recipient's currency?",
    );
});

test('noDataText keeps the plain unit message when no alternatives are offered', () => {
    assert.equal(
        noDataText({ reason: 'unit_not_resolved' }),
        "We couldn't read the requested unit in that query.",
    );
});

// --- slotOptionsEntry --------------------------------------------------

test('slotOptionsEntry returns an empty, non-truncated entry when the spec_id is not in the map', () => {
    assert.deepEqual(slotOptionsEntry({}, 'spec-1', 'what:crsPurpose'), {
        options: [],
        truncated: false,
    });
});

test('slotOptionsEntry returns an empty, non-truncated entry when the spec is present but the key is absent', () => {
    const bySpec = {
        'spec-1': { 'what:crsPurpose': { options: [{ value: {} }], truncated: true } },
    };

    assert.deepEqual(slotOptionsEntry(bySpec, 'spec-1', 'where:'), {
        options: [],
        truncated: false,
    });
});

test('slotOptionsEntry reads back a populated entry, truncated true preserved', () => {
    const entry = {
        options: [{ value: { ref: { dcid: 'country/KEN', label: 'Kenya' } } }],
        truncated: true,
    };
    const bySpec = { 'spec-1': { 'where:': entry } };

    assert.deepEqual(slotOptionsEntry(bySpec, 'spec-1', 'where:'), entry);
});

test('slotOptionsEntry does not leak a same-named key from a different spec_id', () => {
    const bySpec = {
        'spec-1': { 'where:': { options: [{ value: {} }], truncated: false } },
    };

    assert.deepEqual(slotOptionsEntry(bySpec, 'spec-2', 'where:'), {
        options: [],
        truncated: false,
    });
});

// --- mergeSlotOptionsEntry ----------------------------------------------

test('mergeSlotOptionsEntry seeds a brand new spec/key pair into an empty map', () => {
    const entry = { options: [{ value: {} }], truncated: false };

    assert.deepEqual(mergeSlotOptionsEntry({}, 'spec-1', 'where:', entry), {
        'spec-1': { 'where:': entry },
    });
});

test('mergeSlotOptionsEntry adds a second key under a spec without dropping a sibling key already there', () => {
    const first = { options: [{ value: { ref: { dcid: 'country/KEN' } } }], truncated: false };
    const second = { options: [{ value: { ref: { dcid: 'crsPurpose/110' } } }], truncated: true };
    const bySpec = mergeSlotOptionsEntry({}, 'spec-1', 'where:', first);

    assert.deepEqual(mergeSlotOptionsEntry(bySpec, 'spec-1', 'how:crsPurpose', second), {
        'spec-1': { 'where:': first, 'how:crsPurpose': second },
    });
});

test("mergeSlotOptionsEntry overwrites an existing key's entry, options and truncated both replaced", () => {
    const stale = { options: [{ value: { ref: { dcid: 'a' } } }], truncated: true };
    const fresh = { options: [{ value: { ref: { dcid: 'b' } } }], truncated: false };
    const bySpec = mergeSlotOptionsEntry({}, 'spec-1', 'where:', stale);

    assert.deepEqual(mergeSlotOptionsEntry(bySpec, 'spec-1', 'where:', fresh), {
        'spec-1': { 'where:': fresh },
    });
});

test("mergeSlotOptionsEntry leaves a different spec's entries untouched", () => {
    const otherSpecEntry = { options: [{ value: {} }], truncated: false };
    const bySpec = mergeSlotOptionsEntry({}, 'spec-1', 'where:', otherSpecEntry);
    const newEntry = { options: [{ value: {} }], truncated: true };

    const next = mergeSlotOptionsEntry(bySpec, 'spec-2', 'where:', newEntry);

    assert.deepEqual(next['spec-1'], { 'where:': otherSpecEntry });
    assert.deepEqual(next['spec-2'], { 'where:': newEntry });
});

// --- slotOptionLabel ------------------------------------------------------

test('slotOptionLabel reshapes a source-axis option through sourceOptionLabel (de-camelcased)', () => {
    const slot = { key: { axis: 'source' } };
    const option = {
        value: { ref: { dcid: 'WorldDevelopmentIndicators', label: 'WorldDevelopmentIndicators' } },
    };

    assert.equal(slotOptionLabel(slot, option), 'World Development Indicators');
});

test('slotOptionLabel reads the plain optionLabel for a non-source axis', () => {
    const slot = { key: { axis: 'how' } };
    const option = { value: { ref: { dcid: 'crsPurpose/110', label: 'Education' } } };

    assert.equal(slotOptionLabel(slot, option), 'Education');
});

test('slotOptionLabel falls back to optionLabel rather than throwing when the slot has no key at all', () => {
    const option = { value: { ref: { dcid: 'crsPurpose/110', label: 'Education' } } };

    assert.equal(slotOptionLabel({}, option), 'Education');
});

// --- showGroupHeadings ----------------------------------------------------

test('showGroupHeadings is false for zero groups', () => {
    assert.equal(showGroupHeadings([]), false);
});

test('showGroupHeadings is false for exactly one group (the directional single-group surface)', () => {
    assert.equal(showGroupHeadings([{ title: 'Similar places' }]), false);
});

test('showGroupHeadings is true for two groups', () => {
    assert.equal(showGroupHeadings([{ title: 'Similar places' }, { title: 'Within' }]), true);
});

// --- lookup/decision parity: the per-slot lookup must not reshape the
// option list itself, since isLevelScopedOptions/partitionLevelOptions is
// exactly the decision Add Criteria's shared renderer makes off it.

test("a level-scoped option list stays level-scoped after slotOptionsEntry's lookup, so a shared renderer would route it through the hierarchy branch", () => {
    const levelScoped = [
        { value: { ref: { dcid: 'crsPurpose/100' } }, relation: 'root', member_count: 12 },
    ];
    const bySpec = mergeSlotOptionsEntry({}, 'spec-1', 'how:crsPurpose', {
        options: levelScoped,
        truncated: false,
    });

    assert.equal(
        isLevelScopedOptions(slotOptionsEntry(bySpec, 'spec-1', 'how:crsPurpose').options),
        true,
    );
});

test("a flat option list stays flat after slotOptionsEntry's lookup, so a shared renderer would route it through the flat branch", () => {
    const flat = [{ value: { ref: { dcid: 'country/KEN' } } }];
    const bySpec = mergeSlotOptionsEntry({}, 'spec-1', 'where:', {
        options: flat,
        truncated: false,
    });

    assert.equal(isLevelScopedOptions(slotOptionsEntry(bySpec, 'spec-1', 'where:').options), false);
});

test('mergeSlotOptionsEntry then slotOptionsEntry round-trips a truncated entry exactly, not just its option list', () => {
    const entry = { options: [{ value: { ref: { dcid: 'crsTypeOfFlow/110' } } }], truncated: true };
    const bySpec = mergeSlotOptionsEntry({}, 'spec-1', 'how:crsTypeOfFlow', entry);

    assert.deepEqual(slotOptionsEntry(bySpec, 'spec-1', 'how:crsTypeOfFlow'), entry);
});

// --- optionMuted ------------------------------------------------------

test('optionMuted is true for a flat option the probe confirmed has no data', () => {
    const option = {
        value: { ref: { dcid: 'country/LVA' } },
        coverage: { kind: 'bare', has_data: false },
    };

    assert.equal(optionMuted(option), true);
});

test('optionMuted is false for an observed option, and false for a never-probed one', () => {
    const observed = {
        value: { ref: { dcid: 'country/DEU' } },
        coverage: { kind: 'bare', has_data: true },
    };
    const unprobed = { value: { ref: { dcid: 'country/KEN' } } };

    assert.equal(optionMuted(observed), false);
    assert.equal(optionMuted(unprobed), false);
});

test('optionMuted reads a probed-zero level-scoped parent the same way it reads a flat option (F2)', () => {
    const options = [
        {
            value: { ref: { dcid: 'crsPurpose/100' } },
            relation: 'parent',
            member_count: 40,
            coverage: { kind: 'bare', has_data: false },
        },
        { value: { ref: { dcid: 'crsPurpose/110' } }, relation: 'child', member_count: 12 },
    ];
    const partition = partitionLevelOptions(options);

    assert.equal(optionMuted(partition.parent), true);
});

test('optionMuted reads a probed-zero level-scoped child the same way it reads a flat option', () => {
    const options = [
        { value: { ref: { dcid: 'crsPurpose/100' } }, relation: 'parent', member_count: 40 },
        {
            value: { ref: { dcid: 'crsPurpose/110' } },
            relation: 'child',
            member_count: 12,
            coverage: { kind: 'bare', has_data: false },
        },
    ];
    const partition = partitionLevelOptions(options);

    assert.equal(optionMuted(partition.children[0]), true);
});

// --- rankOptionsByCoverage ----------------------------------------------

test('rankOptionsByCoverage passes a flat list through unchanged when nothing carries a probed verdict', () => {
    const options = [
        { value: { ref: { dcid: 'country/DEU' } } },
        { value: { ref: { dcid: 'country/KEN' } } },
    ];

    assert.deepEqual(rankOptionsByCoverage(options, 'country/KEN'), options);
});

test('rankOptionsByCoverage ranks a flat option list richest-first and demotes a probed-zero option to the end', () => {
    const options = [
        { value: { ref: { dcid: 'country/LVA' } }, coverage: { kind: 'bare', has_data: false } },
        {
            value: { ref: { dcid: 'country/DEU' } },
            coverage: { kind: 'exact', has_data: true, observation_count: 18 },
        },
        {
            value: { ref: { dcid: 'country/KEN' } },
            coverage: { kind: 'exact', has_data: true, observation_count: 5 },
        },
    ];

    assert.deepEqual(
        rankOptionsByCoverage(options, null).map((o) => o.value.ref.dcid),
        ['country/DEU', 'country/KEN', 'country/LVA'],
    );
});

test('rankOptionsByCoverage keeps the bound option visible ahead of other probed-zero options, even when it is itself probed-zero', () => {
    const options = [
        { value: { ref: { dcid: 'country/LVA' } }, coverage: { kind: 'bare', has_data: false } },
        { value: { ref: { dcid: 'country/CZE' } }, coverage: { kind: 'bare', has_data: false } },
        {
            value: { ref: { dcid: 'country/DEU' } },
            coverage: { kind: 'exact', has_data: true, observation_count: 18 },
        },
    ];

    assert.deepEqual(
        rankOptionsByCoverage(options, 'country/CZE').map((o) => o.value.ref.dcid),
        ['country/DEU', 'country/CZE', 'country/LVA'],
    );
});

test('rankOptionsByCoverage keeps a probed-zero current pick visible on the flat EntityOption shape PlaceScopeEditor feeds it', () => {
    const options = [
        { dcid: 'country/LVA', label: 'Latvia', coverage: { kind: 'bare', has_data: false } },
        { dcid: 'country/CZE', label: 'Czechia', coverage: { kind: 'bare', has_data: false } },
        {
            dcid: 'country/DEU',
            label: 'Germany',
            coverage: { kind: 'exact', has_data: true, observation_count: 18 },
        },
    ];

    assert.deepEqual(
        rankOptionsByCoverage(options, 'country/CZE').map((o) => o.dcid),
        ['country/DEU', 'country/CZE', 'country/LVA'],
    );
});

// --- resolveObservationsOmission -----------------------------------------

test('resolveObservationsOmission reads spec.observations.omitted before any warning', () => {
    const parts = [
        {
            spec: {
                observations: {
                    omitted: { reason: 'observations_no_points' as const, message: 'no points' },
                },
            },
            warnings: [{ code: 'observations_probe_failed' }],
        },
    ];

    assert.equal(resolveObservationsOmission(parts).reason, 'observations_no_points');
});

test('resolveObservationsOmission carries pairs/cap from an over-cap omission', () => {
    const parts = [
        {
            spec: {
                observations: {
                    omitted: {
                        reason: 'observations_preview_too_large' as const,
                        message: 'too large',
                        pairs: 126,
                        cap: 120,
                    },
                },
            },
        },
    ];

    assert.deepEqual(resolveObservationsOmission(parts), {
        reason: 'observations_preview_too_large',
        pairs: 126,
        cap: 120,
    });
});

test('resolveObservationsOmission falls back to a part warning code for an engine with no omitted field, reading the code rather than the message', () => {
    assert.deepEqual(
        resolveObservationsOmission([
            {
                warnings: [
                    {
                        code: 'observations_probe_failed',
                        message:
                            'observations fetch failed; Spec.resolved.observations was not populated.',
                    },
                ],
            },
        ]),
        { reason: 'observations_probe_failed' },
    );
});

test('resolveObservationsOmission ignores a warning code outside the omission vocabulary, even when its message mentions observations', () => {
    assert.deepEqual(
        resolveObservationsOmission([
            { warnings: [{ code: 'binding_folded', message: 'no observations were requested' }] },
        ]),
        { reason: null },
    );
});

test('resolveObservationsOmission is reason: null with no omitted field and no warnings at all', () => {
    assert.deepEqual(resolveObservationsOmission([{ warnings: [] }, {}]), { reason: null });
});

test('resolveObservationsOmission keeps the first part when two definite parts carry different omission reasons', () => {
    const parts = [
        {
            spec: {
                observations: {
                    omitted: { reason: 'observations_no_points' as const, message: 'no points' },
                },
            },
        },
        {
            spec: {
                observations: {
                    omitted: {
                        reason: 'observations_preview_too_large' as const,
                        message: 'too large',
                    },
                },
            },
        },
    ];

    assert.equal(resolveObservationsOmission(parts).reason, 'observations_no_points');
});

test('resolveObservationsOmission falls through a signal-less first part to the next part that has one', () => {
    const parts = [
        { warnings: [] },
        {
            spec: {
                observations: {
                    omitted: {
                        reason: 'observations_preview_too_large' as const,
                        message: 'too large',
                    },
                },
            },
        },
    ];

    assert.equal(resolveObservationsOmission(parts).reason, 'observations_preview_too_large');
});

// --- observationsOmissionText ---------------------------------------------

test('observationsOmissionText for observations_no_points states the recorded count instead of asserting the selection is empty', () => {
    const text = observationsOmissionText({ reason: 'observations_no_points' }, 153);

    assert.match(text, /153 observations are recorded/);
    assert.match(text, /for this selection/);
    assert.doesNotMatch(text, /no observations/i);
});

test('observationsOmissionText for observations_no_points at zero states the outcome without a figure, and says the fetch ran', () => {
    const text = observationsOmissionText({ reason: 'observations_no_points' }, 0);

    assert.match(text, /fetched this selection and found no observations/);
    assert.doesNotMatch(text, /0 observations/);
});

test('observationsOmissionText for observations_preview_too_large names the pair count and cap, and points at the download button', () => {
    const text = observationsOmissionText(
        { reason: 'observations_preview_too_large', pairs: 126, cap: 120 },
        135,
    );

    assert.match(text, /126 series/);
    assert.match(text, /120/);
    assert.match(text, /download button/);
});

test('observationsOmissionText for observations_preview_too_large still points at the download button without pairs/cap counts', () => {
    const text = observationsOmissionText({ reason: 'observations_preview_too_large' }, 0);

    assert.match(text, /larger than the preview fetches/);
    assert.match(text, /download button/);
});

test('observationsOmissionText renders distinct, accurate text for every other known reason', () => {
    const reasons = [
        'observations_timed_out',
        'observations_no_matching_source',
        'observations_windowed_scope_unsupported',
        'observations_converted_scope_unsupported',
        'observations_no_dispatchable_facet',
        'observations_bulk_fetch_failed',
        'observations_probe_failed',
        'observations_nothing_to_probe',
        'observations_clients_unavailable',
    ] as const;

    // The substantive claim each reason's copy must make: a time-out reason
    // says it ran out of time, a source reason names a source, a clients
    // reason names unavailability, and so on. Distinct but wrong text fails
    // against this table.
    const claims: Record<(typeof reasons)[number], RegExp> = {
        observations_timed_out: /ran out of time/,
        observations_no_matching_source: /published source/,
        observations_windowed_scope_unsupported: /date range/,
        observations_converted_scope_unsupported: /unit conversion/,
        observations_no_dispatchable_facet: /source, method, or unit/,
        observations_bulk_fetch_failed: /series together/,
        observations_probe_failed: /fetch failed/,
        observations_nothing_to_probe: /nothing for the preview to fetch/,
        observations_clients_unavailable: /unavailable/,
    };

    const texts = reasons.map((reason) => observationsOmissionText({ reason }, 0));

    assert.equal(new Set(texts).size, reasons.length);
    reasons.forEach((reason, index) => assert.match(texts[index], claims[reason]));
    // No reason may assert the selection is empty, in any wording. The
    // client knows why the preview is missing, not that the slice carries
    // nothing, so the assertions below guard the phrase and its near-synonyms.
    texts.forEach((text) => {
        assert.doesNotMatch(text, /no observations/i);
        assert.doesNotMatch(text, /nothing (was |came )?(found|back)/i);
        assert.doesNotMatch(text, /empty/i);
    });
});

test('observationsOmissionText falls back to a generic "preview unavailable" message, and never "no observations", for a reason: null the way a fixture with no omitted field and no observations event resolves to', () => {
    const text = observationsOmissionText({ reason: null }, 0);

    assert.match(text, /unavailable/i);
    assert.doesNotMatch(text, /no observations/i);
});

// anchorDcid ------------------------------------------------------------
//
// The pinned definite-single fixture (Population of Kenya in 2020) is a
// real captured /resolve response, but its resolved.slots array was
// trimmed away entirely — the fixture's own header says fields no earlier
// test read were dropped rather than capped. The wire contract still ships
// one Slot per shape-defined axis (types.ts's Spec.slots is non-optional),
// including a `where` entry for a bound subject place. These tests restore
// just that missing slot on a clone of the fixture's real spec, binding it
// to the fixture's own anchor (country/KEN, Kenya's real dcid in this
// capture), and pair it with the where token shape a bound subject place
// actually sends (binding_ref: "where:", entity_refs: []).
function kenyaFixtureSpec() {
    // Clones the raw wire envelope pre-flatten, same rationale as
    // fixtures.test.ts's own walk of the raw shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = structuredClone(fixtures['definite-single']);

    body.parts[0].spec.resolved.slots = [
        {
            key: { axis: 'where', property: null, label: 'place' },
            binding: {
                kind: 'value',
                value: { value_kind: 'entity', ref: { dcid: 'country/KEN', label: 'Kenya' } },
            },
        },
    ];

    return normalizeResponse(body).parts[0].spec;
}

const kenyaWhereToken: SentenceToken = {
    kind: 'slot',
    text: 'Kenya',
    segment: 'heading',
    axis: 'where',
    binding_ref: 'where:',
    entity_refs: [],
};

test('anchorDcid reads the bound where slot for a subject place token with no entity_refs (the Kenya routing bug)', () => {
    assert.equal(anchorDcid(kenyaWhereToken, kenyaFixtureSpec()), 'country/KEN');
});

test('anchorDcid prefers entity_refs[0] over the where slot when both are present', () => {
    const token: SentenceToken = { ...kenyaWhereToken, entity_refs: ['country/GHA'] };

    assert.equal(anchorDcid(token, kenyaFixtureSpec()), 'country/GHA');
});

test('anchorDcid returns undefined for an unbound where slot (the DEFAULT place scope)', () => {
    const spec = kenyaFixtureSpec();
    spec.slots[0].binding = { kind: 'unbound' };

    assert.equal(anchorDcid(kenyaWhereToken, spec), undefined);
});

test('anchorDcid returns undefined when the bound where value is not an entity', () => {
    const spec = kenyaFixtureSpec();
    spec.slots[0].binding = { kind: 'value', value: { value_kind: 'literal', literal: 'latest' } };

    assert.equal(anchorDcid(kenyaWhereToken, spec), undefined);
});

test('anchorDcid returns undefined for a non-where token with no entity_refs', () => {
    const token: SentenceToken = {
        kind: 'slot',
        text: '',
        segment: 'heading',
        axis: 'how',
        entity_refs: [],
    };

    assert.equal(anchorDcid(token, kenyaFixtureSpec()), undefined);
});

test("anchorDcid reads a multi-bound where slot's set binding as its first value", () => {
    const spec = kenyaFixtureSpec();
    spec.slots[0].binding = {
        kind: 'set',
        values: [
            { value_kind: 'entity', ref: { dcid: 'country/KEN', label: 'Kenya' } },
            { value_kind: 'entity', ref: { dcid: 'country/ETH', label: 'Ethiopia' } },
        ],
    };

    assert.equal(anchorDcid(kenyaWhereToken, spec), 'country/KEN');
});

// --- currentEntityDcids ----------------------------------------------------

test('currentEntityDcids reads every dcid a role is bound to, in the order the engine listed them', () => {
    const spec = {
        entities: [
            { ref: 'country/FRA', role: 'origin' },
            { ref: 'country/KEN', role: 'destination' },
            { ref: 'country/ETH', role: 'destination' },
        ],
    };

    assert.deepEqual(currentEntityDcids(spec, 'destination'), ['country/KEN', 'country/ETH']);
});

test('currentEntityDcids is empty for a role nothing is bound to', () => {
    assert.deepEqual(currentEntityDcids({ entities: [] }, 'origin'), []);
    assert.deepEqual(currentEntityDcids({}, 'origin'), []);
});

// --- splitCurrentPick (Set overload) ----------------------------------------

test('splitCurrentPick with a Set pulls out every match, in list order, and never duplicates or hides a pinned row', () => {
    const options = [{ dcid: 'a' }, { dcid: 'b' }, { dcid: 'c' }];

    const { current, rest } = splitCurrentPick(options, new Set(['c', 'a']));

    assert.deepEqual(current, [{ dcid: 'a' }, { dcid: 'c' }]);
    assert.deepEqual(rest, [{ dcid: 'b' }]);
});

test('splitCurrentPick with an empty Set pins nothing', () => {
    const options = [{ dcid: 'a' }, { dcid: 'b' }];

    assert.deepEqual(splitCurrentPick(options, new Set<string>()), { current: [], rest: options });
});

test('splitCurrentPick returns a single current for a plain string dcid', () => {
    const options = [{ dcid: 'a' }, { dcid: 'b' }];

    assert.deepEqual(splitCurrentPick(options, 'b'), {
        current: { dcid: 'b' },
        rest: [{ dcid: 'a' }],
    });
    assert.deepEqual(splitCurrentPick(options, null), { current: null, rest: options });
});

// --- entitySlotBindingForRefs -----------------------------------------------

test('entitySlotBindingForRefs is unbound for an empty selection', () => {
    assert.deepEqual(entitySlotBindingForRefs([]), { kind: 'unbound' });
});

test('entitySlotBindingForRefs renders one ref as a plain value, never a length-1 set', () => {
    assert.deepEqual(entitySlotBindingForRefs([{ dcid: 'country/KEN', label: 'Kenya' }]), {
        kind: 'value',
        value: { value_kind: 'entity', ref: { dcid: 'country/KEN', label: 'Kenya' } },
    });
});

test('entitySlotBindingForRefs renders two or more refs as a set', () => {
    assert.deepEqual(
        entitySlotBindingForRefs([
            { dcid: 'country/KEN', label: 'Kenya' },
            { dcid: 'country/ETH', label: 'Ethiopia' },
        ]),
        {
            kind: 'set',
            values: [
                { value_kind: 'entity', ref: { dcid: 'country/KEN', label: 'Kenya' } },
                { value_kind: 'entity', ref: { dcid: 'country/ETH', label: 'Ethiopia' } },
            ],
        },
    );
});

// --- placeEditorPickRoute -------------------------------------------------

test('placeEditorPickRoute routes a directional token to its own entities.<role> edit', () => {
    const token: SentenceToken = { ...kenyaWhereToken, axis: undefined, role: 'destination' };

    assert.deepEqual(placeEditorPickRoute(token, kenyaFixtureSpec()), {
        kind: 'entity',
        role: 'destination',
    });
});

test('placeEditorPickRoute routes a bound subject place (the Kenya routing bug) to the where slot it reads off spec.slots', () => {
    assert.deepEqual(placeEditorPickRoute(kenyaWhereToken, kenyaFixtureSpec()), {
        kind: 'where',
        whereIndex: 0,
    });
});

test('placeEditorPickRoute routes a role-less token whose anchor came from entity_refs to the same where slot -- onEditEntity has no observationAbout variant to send it through instead', () => {
    const token: SentenceToken = { ...kenyaWhereToken, entity_refs: ['country/GHA'] };

    assert.deepEqual(placeEditorPickRoute(token, kenyaFixtureSpec()), {
        kind: 'where',
        whereIndex: 0,
    });
});

test('placeEditorPickRoute falls back to text when the spec has no where slot to bind', () => {
    const token: SentenceToken = { ...kenyaWhereToken, entity_refs: ['country/GHA'] };
    const spec = { ...kenyaFixtureSpec(), slots: [] };

    assert.deepEqual(placeEditorPickRoute(token, spec), { kind: 'text' });
});

// --- mergePlaceOptionsEntry / missingPlaceOptionScopes / placeOptionsForSpec

const kenPeers: PlaceOptionsEntry = {
    anchor_ref: 'country/KEN',
    options: [{ dcid: 'country/GHA', label: 'Ghana' }],
    truncated: false,
};

const kenChildren: PlaceOptionsEntry = {
    anchor_ref: 'country/KEN',
    options: [{ dcid: 'country/KEN/admin1/Nairobi', label: 'Nairobi' }],
    truncated: false,
};

test('mergePlaceOptionsEntry seeds a brand new spec/scope pair into an empty map', () => {
    assert.deepEqual(mergePlaceOptionsEntry({}, 'spec-1', 'peers', kenPeers), {
        'spec-1': { peers: kenPeers },
    });
});

test('mergePlaceOptionsEntry adds the sibling scope under the same spec without dropping the first', () => {
    const bySpec = mergePlaceOptionsEntry({}, 'spec-1', 'peers', kenPeers);

    assert.deepEqual(mergePlaceOptionsEntry(bySpec, 'spec-1', 'children', kenChildren), {
        'spec-1': { peers: kenPeers, children: kenChildren },
    });
});

test("mergePlaceOptionsEntry replaces an existing (spec, scope) entry outright, unlike mergeEntityOptionsEntry's append", () => {
    const stale: PlaceOptionsEntry = { anchor_ref: 'country/GHA', options: [], truncated: false };
    const bySpec = mergePlaceOptionsEntry({}, 'spec-1', 'peers', stale);

    assert.deepEqual(mergePlaceOptionsEntry(bySpec, 'spec-1', 'peers', kenPeers), {
        'spec-1': { peers: kenPeers },
    });
});

test("mergePlaceOptionsEntry leaves a different spec's entries untouched", () => {
    const bySpec = mergePlaceOptionsEntry({}, 'spec-1', 'peers', kenPeers);
    const next = mergePlaceOptionsEntry(bySpec, 'spec-2', 'peers', kenChildren);

    assert.deepEqual(next['spec-1'], { peers: kenPeers });
    assert.deepEqual(next['spec-2'], { peers: kenChildren });
});

test('placeOptionsForSpec reads the scope map for a spec_id, undefined when no event has named it', () => {
    const bySpec = mergePlaceOptionsEntry({}, 'spec-1', 'peers', kenPeers);

    assert.deepEqual(placeOptionsForSpec({ spec_id: 'spec-1' }, bySpec), { peers: kenPeers });
    assert.equal(placeOptionsForSpec({ spec_id: 'spec-2' }, bySpec), undefined);
});

test('missingPlaceOptionScopes is empty when both scopes are prefetched for the current anchor -- the zero-network-request case', () => {
    const prefetched = { peers: kenPeers, children: kenChildren };

    assert.deepEqual(
        missingPlaceOptionScopes(['peers', 'children'], prefetched, 'country/KEN'),
        [],
    );
});

test('missingPlaceOptionScopes names only the scope not covered by the prefetch', () => {
    const prefetched = { peers: kenPeers };

    assert.deepEqual(missingPlaceOptionScopes(['peers', 'children'], prefetched, 'country/KEN'), [
        'children',
    ]);
});

test('missingPlaceOptionScopes names every scope when the trailing event has not arrived yet (prefetched undefined)', () => {
    assert.deepEqual(missingPlaceOptionScopes(['peers', 'children'], undefined, 'country/KEN'), [
        'peers',
        'children',
    ]);
});

test("missingPlaceOptionScopes refetches a scope whose prefetched anchor_ref doesn't match the anchor PlaceEditor was given", () => {
    // Ghana's own peers, still sitting in the map from before the user
    // edited the where slot to Kenya -- must not be shown as Kenya's peers.
    const staleAnchor: PlaceOptionsEntry = { ...kenPeers, anchor_ref: 'country/GHA' };
    const prefetched = { peers: staleAnchor, children: kenChildren };

    assert.deepEqual(missingPlaceOptionScopes(['peers', 'children'], prefetched, 'country/KEN'), [
        'peers',
    ]);
});

test("missingPlaceOptionScopes only ever asks about the scopes it is given (placeEditorScopes' directional peers-only list)", () => {
    assert.deepEqual(missingPlaceOptionScopes(['peers'], { peers: kenPeers }, 'country/KEN'), []);
});

// --- placeOptionsSignature -------------------------------------------------

test('placeOptionsSignature is stable across repeated calls with the same input -- an unrelated re-render must not change it', () => {
    const prefetched = { peers: kenPeers, children: kenChildren };

    assert.equal(
        placeOptionsSignature(['peers', 'children'], prefetched),
        placeOptionsSignature(['peers', 'children'], prefetched),
    );
});

test('placeOptionsSignature changes when a scope goes from no entry to a prefetched one', () => {
    const before = placeOptionsSignature(['peers', 'children'], { children: kenChildren });
    const after = placeOptionsSignature(['peers', 'children'], {
        peers: kenPeers,
        children: kenChildren,
    });

    assert.notEqual(before, after);
});

test('placeOptionsSignature ignores an arrival for a scope PlaceEditor never asked for', () => {
    // A directional editor only ever asks for 'peers' (placeEditorScopes'
    // origin/destination branch) -- a 'children' entry showing up in the
    // same map must not move its signature.
    const before = placeOptionsSignature(['peers'], { peers: kenPeers });
    const after = placeOptionsSignature(['peers'], { peers: kenPeers, children: kenChildren });

    assert.equal(before, after);
});

test("placeOptionsSignature changes when a scope's anchor_ref changes -- an edit reassigning the anchor", () => {
    const ghanaPeers: PlaceOptionsEntry = { ...kenPeers, anchor_ref: 'country/GHA' };

    assert.notEqual(
        placeOptionsSignature(['peers'], { peers: kenPeers }),
        placeOptionsSignature(['peers'], { peers: ghanaPeers }),
    );
});

test('placeOptionsSignature changes on a same-anchor re-arrival (arrival bumped, anchor_ref unchanged)', () => {
    const first: PlaceOptionsEntry = { ...kenPeers, arrival: 1 };
    const second: PlaceOptionsEntry = { ...kenPeers, arrival: 2 };

    assert.notEqual(
        placeOptionsSignature(['peers'], { peers: first }),
        placeOptionsSignature(['peers'], { peers: second }),
    );
});

test('placeOptionsSignature treats a missing arrival as 0, same as an explicit 0', () => {
    const withoutArrival: PlaceOptionsEntry = { ...kenPeers };
    const withZero: PlaceOptionsEntry = { ...kenPeers, arrival: 0 };

    assert.equal(
        placeOptionsSignature(['peers'], { peers: withoutArrival }),
        placeOptionsSignature(['peers'], { peers: withZero }),
    );
});

// --- planPlaceOptions --------------------------------------------------------

const PLACE_SCOPES = ['peers', 'children'] as const;
const NOW = 1_000_000;

test('planPlaceOptions reveals with no dispatch when both scopes are already prefetched at mount -- the zero-network-request case', () => {
    const plan = planPlaceOptions(
        PLACE_SCOPES,
        { peers: kenPeers, children: kenChildren },
        'country/KEN',
        undefined,
        new Set(),
        true,
        null,
        NOW,
    );

    assert.deepEqual(plan.dispatchNow, []);
    assert.equal(plan.reveal, true);
    assert.equal(plan.wait, null);
    assert.deepEqual(plan.lockFromPrefetch.map((l) => l.scope).sort(), ['children', 'peers']);
});

test('planPlaceOptions waits out the grace deadline when nothing is prefetched and the base stream is still open', () => {
    const plan = planPlaceOptions(
        PLACE_SCOPES,
        undefined,
        'country/KEN',
        undefined,
        new Set(),
        true,
        null,
        NOW,
    );

    assert.deepEqual(plan.dispatchNow, []);
    assert.equal(plan.reveal, false);
    assert.deepEqual(plan.wait, { deadline: NOW + PREFETCH_GRACE_MS, delayMs: PREFETCH_GRACE_MS });
});

test('planPlaceOptions dispatches immediately when nothing is prefetched and the base stream has already closed', () => {
    const plan = planPlaceOptions(
        PLACE_SCOPES,
        undefined,
        'country/KEN',
        undefined,
        new Set(),
        false,
        null,
        NOW,
    );

    assert.deepEqual(plan.dispatchNow.sort(), ['children', 'peers']);
    assert.equal(plan.reveal, false);
    assert.equal(plan.wait, null);
});

test('planPlaceOptions locks the scope it has a prefetch for and waits on the one still missing', () => {
    const plan = planPlaceOptions(
        PLACE_SCOPES,
        { peers: kenPeers },
        'country/KEN',
        undefined,
        new Set(),
        true,
        null,
        NOW,
    );

    assert.deepEqual(plan.lockFromPrefetch, [{ scope: 'peers', entry: kenPeers }]);
    assert.deepEqual(plan.dispatchNow, []);
    assert.equal(plan.reveal, false);
    assert.deepEqual(plan.wait, { deadline: NOW + PREFETCH_GRACE_MS, delayMs: PREFETCH_GRACE_MS });
});

test('planPlaceOptions never redispatches a scope an earlier run already locked', () => {
    const plan = planPlaceOptions(
        PLACE_SCOPES,
        undefined,
        'country/KEN',
        undefined,
        new Set(['peers']),
        false,
        null,
        NOW,
    );

    assert.deepEqual(plan.dispatchNow, ['children']);
    assert.deepEqual(plan.lockFromPrefetch, []);
});

test('planPlaceOptions ignores a prefetch that arrives for a scope already locked -- the first decision wins', () => {
    const plan = planPlaceOptions(
        PLACE_SCOPES,
        { peers: kenPeers },
        'country/KEN',
        undefined,
        new Set(['peers']),
        true,
        null,
        NOW,
    );

    assert.deepEqual(plan.lockFromPrefetch, []);
    assert.deepEqual(plan.dispatchNow, []);
    assert.deepEqual(plan.wait, { deadline: NOW + PREFETCH_GRACE_MS, delayMs: PREFETCH_GRACE_MS });
});

test('planPlaceOptions schedules a zero-delay wait, not a fresh grace period, once the committed deadline has already passed', () => {
    const pastDeadline = NOW - 50;

    const plan = planPlaceOptions(
        PLACE_SCOPES,
        undefined,
        'country/KEN',
        undefined,
        new Set(),
        true,
        pastDeadline,
        NOW,
    );

    assert.deepEqual(plan.dispatchNow, []);
    assert.equal(plan.reveal, false);
    assert.deepEqual(plan.wait, { deadline: pastDeadline, delayMs: 0 });
});

test("planPlaceOptions ignores a prefetch whose anchor_ref doesn't match the current anchor", () => {
    const staleAnchor: PlaceOptionsEntry = { ...kenPeers, anchor_ref: 'country/GHA' };

    const plan = planPlaceOptions(
        PLACE_SCOPES,
        { peers: staleAnchor },
        'country/KEN',
        undefined,
        new Set(),
        false,
        null,
        NOW,
    );

    assert.deepEqual(plan.lockFromPrefetch, []);
    assert.deepEqual(plan.dispatchNow.sort(), ['children', 'peers']);
});

test("planPlaceOptions treats a directional role's prefetch as unusable -- PlaceOptionsEvent is always observationAbout", () => {
    const plan = planPlaceOptions(
        ['peers'],
        { peers: kenPeers },
        'country/KEN',
        'origin',
        new Set(),
        false,
        null,
        NOW,
    );

    assert.deepEqual(plan.lockFromPrefetch, []);
    assert.deepEqual(plan.dispatchNow, ['peers']);
});

// --- buildPlaceOptionGroups -------------------------------------------------

const fulfilled = (options: PlaceOptionsEntry['options']): PlaceOptionScopeResult => ({
    status: 'fulfilled',
    value: { options, truncated: false },
});

const rejected = (message: string): PlaceOptionScopeResult => ({
    status: 'rejected',
    reason: Object.assign(new Error(message), { status: 422 }),
});

test('buildPlaceOptionGroups titles peers "Similar places" and children "Within", in scope order', () => {
    const results = new Map<'peers' | 'children', PlaceOptionScopeResult>([
        ['peers', fulfilled(kenPeers.options)],
        ['children', fulfilled(kenChildren.options)],
    ]);

    const { groups, anySucceeded, lastError } = buildPlaceOptionGroups(
        ['peers', 'children'],
        results,
    );

    assert.deepEqual(
        groups.map((g) => g.title),
        ['Similar places', 'Within'],
    );
    assert.equal(anySucceeded, true);
    assert.equal(lastError, null);
});

test('buildPlaceOptionGroups drops a scope with zero options but keeps it counted as succeeded', () => {
    const results = new Map<'peers' | 'children', PlaceOptionScopeResult>([
        ['peers', fulfilled([])],
        ['children', fulfilled(kenChildren.options)],
    ]);

    const { groups, anySucceeded } = buildPlaceOptionGroups(['peers', 'children'], results);

    assert.deepEqual(
        groups.map((g) => g.title),
        ['Within'],
    );
    assert.equal(anySucceeded, true);
});

test('buildPlaceOptionGroups keeps the surviving scope’s group when the other scope was refused', () => {
    const results = new Map<'peers' | 'children', PlaceOptionScopeResult>([
        ['peers', fulfilled(kenPeers.options)],
        ['children', rejected('children unsupported for this anchor')],
    ]);

    const { groups, anySucceeded, lastError } = buildPlaceOptionGroups(
        ['peers', 'children'],
        results,
    );

    assert.deepEqual(
        groups.map((g) => g.title),
        ['Similar places'],
    );
    assert.equal(anySucceeded, true);
    assert.equal((lastError as Error).message, 'children unsupported for this anchor');
});

test('buildPlaceOptionGroups reports failure only when every scope was refused', () => {
    const results = new Map<'peers' | 'children', PlaceOptionScopeResult>([
        ['peers', rejected('peers refused')],
        ['children', rejected('children refused')],
    ]);

    const { groups, anySucceeded, lastError } = buildPlaceOptionGroups(
        ['peers', 'children'],
        results,
    );

    assert.deepEqual(groups, []);
    assert.equal(anySucceeded, false);
    // The later scope's own refusal wins -- matches `scopes` order, not
    // which settled first (both are already settled by the time this runs).
    assert.equal((lastError as Error).message, 'children refused');
});

test('buildPlaceOptionGroups skips a scope with no settled result yet', () => {
    const results = new Map<'peers' | 'children', PlaceOptionScopeResult>([
        ['peers', fulfilled(kenPeers.options)],
    ]);

    const { groups, anySucceeded, lastError } = buildPlaceOptionGroups(
        ['peers', 'children'],
        results,
    );

    assert.deepEqual(
        groups.map((g) => g.title),
        ['Similar places'],
    );
    assert.equal(anySucceeded, true);
    assert.equal(lastError, null);
});

test('operationProgressText formats rows written against the estimate', () => {
    assert.equal(
        operationProgressText({ rows_written: 1_234, estimate_rows: 2_500_000 }),
        '1,234 of 2,500,000 rows written',
    );
});

test("a single-part entity_ambiguous plan routes its wording token to that wording's candidates", () => {
    const response = normalizeResponse(fixtures['world-bank-ambiguous']);
    const plan: SentenceToken[] = response.sentence_plan;
    const slots = plan.filter((token) => token.kind === 'slot');

    assert.equal(slots.length, 1);
    const [wording] = slots;
    const partIndex = tokenPart(wording, response.parts.length);

    assert.equal(partIndex, 0);
    assert.equal(wording.role, 'origin');
    assert.deepEqual(
        ambiguousWordingGroup(wording, response.parts[0].no_data)?.candidates.map((c) => c.dcid),
        ['InternationalBankForReconstructionAndDevelopment', 'InternationalDevelopmentAssociation'],
    );
});

test('ambiguousWordingGroup refuses the variable slot and an entity read-back', () => {
    const { no_data: noData } = normalizeResponse(fixtures['world-bank-ambiguous']).parts[0];
    const token: SentenceToken = {
        kind: 'slot',
        text: 'World Bank',
        segment: 'heading',
        role: 'origin',
    };

    assert.ok(ambiguousWordingGroup(token, noData));
    assert.equal(ambiguousWordingGroup({ ...token, axis: 'what' }, noData), null);
    assert.equal(ambiguousWordingGroup({ ...token, entity_refs: ['WorldBank'] }, noData), null);
    assert.equal(ambiguousWordingGroup({ ...token, kind: 'text' }, noData), null);
    assert.equal(ambiguousWordingGroup({ ...token, text: 'IFC' }, noData), null);
});

test("ambiguousEntityMenuTitle titles the menu by the ambiguous wording's role", () => {
    const part = normalizeResponse(fixtures['entity-ambiguous']).parts[0];
    const withRole = (roleText: string | null) => ({
        ...part,
        restatement: {
            ...part.restatement,
            entities: [
                { text: 'Congo', role_text: roleText },
                { text: 'France', role_text: 'from' },
            ],
        },
    });

    // "ODA to Congo": Congo is the recipient.
    assert.equal(ambiguousEntityMenuTitle(part), 'Select Recipient');
    assert.equal(ambiguousEntityMenuTitle(withRole('from')), 'Select Provider');
    assert.equal(ambiguousEntityMenuTitle(withRole(null)), 'Select Place');
    assert.equal(ambiguousEntityMenuTitle(null), 'Select Place');
});

test('ambiguousEntityMenuTitle names every ambiguous wording a shared menu offers', () => {
    const part = normalizeResponse(fixtures['entity-ambiguous']).parts[0];
    const [congo] = part.no_data.ambiguous_entities;
    const bothAmbiguous = {
        ...part,
        no_data: {
            ...part.no_data,
            ambiguous_entities: [
                { ...congo, text: 'World Bank' },
                { ...congo, text: 'Georgia' },
            ],
        },
        restatement: {
            ...part.restatement,
            entities: [
                { text: 'World Bank', role_text: 'from' },
                { text: 'Georgia', role_text: 'to' },
            ],
        },
    };

    assert.equal(ambiguousEntityMenuTitle(bothAmbiguous), 'Select Provider or Recipient');
});

test('ambiguousEntityMenuTitle reads a restatement whose entities are null', () => {
    const part = normalizeResponse(fixtures['entity-ambiguous']).parts[0];
    const withoutEntities = { ...part, restatement: { ...part.restatement, entities: null } };

    assert.equal(ambiguousEntityMenuTitle(withoutEntities), 'Select Place');
});

// --- rootGroups ------------------------------------------------------------

const levelOption = (dcid: string, relation: string, parent?: string) => ({
    value: { ref: { dcid, label: dcid } },
    relation,
    ...(parent ? { parent } : {}),
});

test('rootGroups puts each child under the root its parent names, in wire order', () => {
    const groups = rootGroups(
        partitionLevelOptions([
            levelOption('crsPurpose/100', 'root'),
            levelOption('crsPurpose/120', 'child', 'crsPurpose/100'),
            levelOption('crsPurpose/200', 'root'),
            levelOption('crsPurpose/110', 'child', 'crsPurpose/100'),
            levelOption('crsPurpose/210', 'child', 'crsPurpose/200'),
            levelOption('crsPurpose/300', 'root'),
        ]),
    );

    assert.deepEqual(
        groups.map(({ root, children }) => [
            root.value.ref.dcid,
            children.map((child) => child.value.ref.dcid),
        ]),
        [
            ['crsPurpose/100', ['crsPurpose/120', 'crsPurpose/110']],
            ['crsPurpose/200', ['crsPurpose/210']],
            ['crsPurpose/300', []],
        ],
    );
});

test('rootGroups leaves out a child whose parent is not among the roots', () => {
    const groups = rootGroups(
        partitionLevelOptions([
            levelOption('crsPurpose/100', 'root'),
            levelOption('crsPurpose/910', 'child', 'crsPurpose/900'),
            levelOption('crsPurpose/920', 'child'),
        ]),
    );

    assert.deepEqual(
        groups.map(({ children }) => children.length),
        [0],
    );
});

test('rootGroups reads a root whose one child serves the same rows as that child alone', () => {
    // Modality on "aid from Germany to Guatemala": "project-type
    // intervention (group)" and its one child serve the same rows; "core
    // contribution" splits over two children; "expert and other technical
    // assistance" has two.
    const { parts, optionsBySpec } = servedAnswer(servedAid);
    const { options } = optionsBySpec[parts[0].spec.spec_id]['how:crsCooperationModality'];

    assert.deepEqual(
        rootGroups(partitionLevelOptions(options)).map(({ root, children }) => [
            root.value.ref.label,
            root.served_rows,
            children.length,
        ]),
        [
            ['core contribution and pooled programme and fund', 255, 2],
            ['project-type intervention', 425, 0],
            ['expert and other technical assistance', 125, 2],
            ['scholarship and student cost in donor country', 36, 2],
            ['development awareness', 1, 0],
        ],
    );
});

// --- levelMenu ---------------------------------------------------------

const valueBinding = (dcid: string) => ({
    kind: 'value',
    value: { value_kind: 'taxonomy', ref: { dcid, label: dcid } },
});

const dcids = (options: { value: { ref: { dcid: string } } }[]) =>
    options.map((option) => option.value.ref.dcid);

const boundMenu = (binding: unknown, options: unknown[]) => {
    const menu = levelMenu(binding, options);

    assert.equal(menu.kind, 'bound');

    return menu as Extract<ReturnType<typeof levelMenu>, { kind: 'bound' }>;
};

test('levelMenu groups an unbound slot, or one bound to a set, by root', () => {
    const options = [
        levelOption('CRSPurposeCode100', 'root'),
        levelOption('CRSPurposeCode110', 'child', 'CRSPurposeCode100'),
        levelOption('CRSPurposeCode200', 'root'),
    ];

    for (const binding of [{ kind: 'unbound' }, { kind: 'set', values: [] }, undefined]) {
        const menu = levelMenu(binding, options);

        assert.equal(menu.kind, 'unbound');
        assert.deepEqual(
            menu.kind === 'unbound' &&
                menu.groups.map(({ root, children }) => [root.value.ref.dcid, dcids(children)]),
            [
                ['CRSPurposeCode100', ['CRSPurposeCode110']],
                ['CRSPurposeCode200', []],
            ],
        );
    }
});

test('levelMenu puts a bound non-root between its parent and its children', () => {
    const menu = boundMenu(valueBinding('CRSPurposeCode120'), [
        levelOption('CRSPurposeCode122', 'child', 'CRSPurposeCode120'),
        levelOption('CRSPurposeCode121', 'child', 'CRSPurposeCode120'),
        levelOption('CRSPurposeCode100', 'parent'),
    ]);

    assert.equal(menu.up?.value.ref.dcid, 'CRSPurposeCode100');
    assert.equal(menu.current.value.ref.dcid, 'CRSPurposeCode120');
    assert.deepEqual(dcids(menu.down), ['CRSPurposeCode122', 'CRSPurposeCode121']);
    assert.deepEqual(menu.sideways, []);
});

test('levelMenu keeps a bound root as the current pick, its children down and the other roots beside it', () => {
    const menu = boundMenu(valueBinding('CRSPurposeCode100'), [
        levelOption('CRSPurposeCode110', 'child', 'CRSPurposeCode100'),
        levelOption('CRSPurposeCode120', 'child', 'CRSPurposeCode100'),
        levelOption('CRSPurposeCode200', 'root'),
        levelOption('CRSPurposeCode300', 'root'),
    ]);

    assert.equal(menu.up, null);
    assert.equal(menu.current.value.ref.dcid, 'CRSPurposeCode100');
    assert.deepEqual(dcids(menu.down), ['CRSPurposeCode110', 'CRSPurposeCode120']);
    assert.deepEqual(
        menu.sideways.map(({ root, children }) => [root.value.ref.dcid, dcids(children)]),
        [
            ['CRSPurposeCode200', []],
            ['CRSPurposeCode300', []],
        ],
    );
});

test('levelMenu keeps a childless bound root as the current pick beside the other roots', () => {
    const menu = boundMenu(valueBinding('DAC2aAidType216'), [
        levelOption('DAC2aAidType206', 'root'),
        levelOption('DAC2aAidType207', 'root'),
    ]);

    assert.equal(menu.current.value.ref.dcid, 'DAC2aAidType216');
    assert.deepEqual(menu.down, []);
    assert.deepEqual(
        menu.sideways.map(({ root }) => root.value.ref.dcid),
        ['DAC2aAidType206', 'DAC2aAidType207'],
    );
});

test("levelMenu takes a flat code system's bound value from the list, with its row count", () => {
    const menu = boundMenu(valueBinding('crsTypeOfFlow/12'), [
        { ...levelOption('crsTypeOfFlow/11', 'root'), served_rows: 40 },
        { ...levelOption('crsTypeOfFlow/12', 'root'), served_rows: 7 },
    ]);

    assert.equal(menu.current.served_rows, 7);
    assert.deepEqual(
        menu.sideways.map(({ root }) => root.value.ref.dcid),
        ['crsTypeOfFlow/11'],
    );
});

test('levelMenu keeps every child reachable under its root for a binding the code index does not hold', () => {
    // The code index menus a dcid it does not hold as unbound: roots with
    // their own children, none of which sit under the bound value.
    const menu = boundMenu(valueBinding('CRSPurposeCode999'), [
        levelOption('CRSPurposeCode100', 'root'),
        levelOption('CRSPurposeCode110', 'child', 'CRSPurposeCode100'),
        levelOption('CRSPurposeCode200', 'root'),
        levelOption('CRSPurposeCode210', 'child', 'CRSPurposeCode200'),
    ]);

    assert.equal(menu.current.value.ref.dcid, 'CRSPurposeCode999');
    assert.deepEqual(menu.down, []);
    assert.deepEqual(
        menu.sideways.map(({ root, children }) => [root.value.ref.dcid, dcids(children)]),
        [
            ['CRSPurposeCode100', ['CRSPurposeCode110']],
            ['CRSPurposeCode200', ['CRSPurposeCode210']],
        ],
    );
});

test('slotOffersChoice offers a value binding its other options, and an unbound slot or a set a narrower pick from its union', () => {
    const health = servedAnswer(servedHealth, servedHealthEvents);
    const aid = servedAnswer(servedAid);
    const choice = ({ parts, optionsBySpec }: typeof aid, ref: string) => {
        const { spec } = parts[0];
        const slot = spec.slots.find(
            (candidate: { key: Parameters<typeof keyRef>[0] }) => keyRef(candidate.key) === ref,
        );

        return slotOffersChoice(slot, optionsBySpec[spec.spec_id][ref], spec);
    };

    assert.equal(choice(health, 'how:expenditureType'), false);
    // Flow is bound to ODA with two other served flows; sector is unbound.
    assert.equal(choice(aid, 'how:crsTypeOfFlow'), true);
    assert.equal(choice(aid, 'how:crsPurpose'), true);

    // An unbound slot with one option narrows only when that option is
    // counted and serves fewer rows than the answer downloads.
    const unbound = { key: { axis: 'how' }, binding: { kind: 'unbound' } };
    const spec = {
        coverage: { dimensions: [{ label: 'variables', count: 279 }] },
        download: { rows: 1284, rows_exact: true },
    };
    const one = (served_rows: number | null) => ({
        options: [{ value: { ref: { dcid: 'Net' } }, served_rows }],
        truncated: false,
    });

    assert.equal(slotOffersChoice(unbound, one(279), spec), true);
    assert.equal(slotOffersChoice(unbound, one(1284), spec), false);
    assert.equal(slotOffersChoice(unbound, one(null), spec), false);
    assert.equal(slotOffersChoice(unbound, one(279), { ...spec, download: { rows: null } }), false);

    // A slot bound to a set spans its members the way an unbound slot spans
    // every option: two members narrow, as does one counted member that
    // serves fewer rows than the answer. A set of one reads as a value.
    const set = (...dcids: string[]) => ({
        key: { axis: 'how' },
        binding: { kind: 'set', values: dcids.map((dcid) => ({ ref: { dcid } })) },
    });
    const members = (...dcids: string[]) => ({
        options: dcids.map((dcid) => ({ value: { ref: { dcid } }, served_rows: null })),
        truncated: false,
    });

    assert.equal(slotOffersChoice(set('Female', 'Male'), members('Female', 'Male'), spec), true);
    assert.equal(slotOffersChoice(set('Female', 'Male'), members('Female', 'Other'), spec), true);
    assert.equal(slotOffersChoice(set('Female', 'Male'), members('Female'), spec), false);
    assert.equal(slotOffersChoice(set('Net', 'Gross'), one(279), spec), true);
    assert.equal(slotOffersChoice(set('Net', 'Gross'), one(1284), spec), false);
    assert.equal(slotOffersChoice(set('Female'), members('Female'), spec), false);
});

test('rowsLabel reads a counted option, "up to" when inexact, and nothing for an uncounted one', () => {
    assert.equal(rowsLabel(1284, true), '1,284 rows');
    assert.equal(rowsLabel(1, true), '1 row');
    assert.equal(rowsLabel(113, false), 'up to 113 rows');
    assert.equal(rowsLabel(null, null), null);
    assert.equal(rowsLabel(undefined, undefined), null);
});
