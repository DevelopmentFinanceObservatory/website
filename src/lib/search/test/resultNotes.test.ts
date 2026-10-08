import assert from 'node:assert/strict';
import test from 'node:test';

import {
    aboutAnswerNotes,
    collapsedCandidatesNote,
    downloadNote,
    progressSuffix,
    resolvedPartCount,
    snapshotLiveNote,
    tableCaptionNotes,
    unSystemFailedReads,
    stepPhrase,
    noDataCardParts,
    studioHandoffParts,
} from '../resultNotes.ts';
import {
    gdpOfCongoNoData,
    gdpOfCongoRestatement,
    odaToCongoNoData,
    odaToCongoRestatement,
} from './fixtures/ambiguous-congo.ts';
import type { Warning } from '../types.ts';

// ---------------------------------------------------------------------------
// The warning lines the page draws, by place
// ---------------------------------------------------------------------------

// Humanitarian aid from Germany on the dev API, with observations: three
// warnings and the 20-series preview cap.
const humanitarianSpec = {
    spec_id: 'spec_880',
    slots: [],
    headline: {
        year: 2024,
        year_named: false,
        observations: 155,
        series: 155,
        role_counts: { financingProvider: 1, financingRecipient: 61 },
    },
    entities: [{ ref: 'country/DEU', label: 'Germany', role: 'origin' }],
    entity_options: [{ role: 'destination', options: [], truncated: true }],
    coverage: {
        kind: 'breadth',
        dimensions: [
            { label: 'recipients', count: 145 },
            { label: 'sources', count: 1 },
            { label: 'variables', count: 39 },
        ],
    },
    observations: { series: Array.from({ length: 20 }, (_, index) => ({ index })) },
};
const humanitarianWarnings: Warning[] = [
    {
        code: 'retrieval_score_weak',
        severity: 'info',
        message:
            "the chosen reading's match to the query is weak; treat it with less confidence than a strong match.",
    },
    {
        code: 'role_scope_defaulted',
        severity: 'warn',
        message:
            'no recipient was named; the answer was resolved across the 145 recipients with data from Germany.',
    },
    {
        code: 'observations_series_truncated',
        severity: 'warn',
        message:
            'showing 20 of 927 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.',
        spec_id: 'spec_880',
        params: { shown: 20, total: 927 },
    },
];

// dfo-apis src/search/engine/region/un_system.py un_unavailable_warning, for
// a record holding one refused place and one failed read of two variables,
// with each variable's label in `variable_labels`.
const unSystemWarning = (variableLabels: string[]): Warning => ({
    code: 'un_system_unavailable',
    severity: 'warn',
    message:
        'The UN System Data Commons refused reads for country/PRK; the answer holds no UN data there. ' +
        'The UN System Data Commons read for sdg/SH_STA_MORT, sdg/SH_DYN_MORT at country/KEN, country/UGA failed; the answer holds no UN data for them.',
    params: {
        places: ['country/PRK'],
        variables: ['sdg/SH_STA_MORT', 'sdg/SH_DYN_MORT'],
        variable_labels: variableLabels,
    },
});

test('aboutAnswerNotes holds the coverage sentence and assumptions -- humanitarian aid from Germany', () => {
    assert.deepEqual(aboutAnswerNotes(humanitarianSpec, humanitarianWarnings, {}), {
        coverage:
            '2024 is the latest year with data, with 155 values for 61 of the 145 recipients that have data from Germany.',
        assumptions: [
            'No recipient was named, so every recipient with data from Germany is included.',
            'No year was named, so the counts are for 2024, the latest year with data.',
        ],
        variance: [],
        unavailable: [],
    });
});

for (const [name, labels, line] of [
    [
        'by label',
        ['Maternal mortality ratio', 'Under-five mortality rate'],
        'The UN System Data Commons could not be read for Maternal mortality ratio and Under-five mortality rate, so the answer holds no UN data for them.',
    ],
    [
        'by label, counting a variable with none',
        ['Maternal mortality ratio', ''],
        'The UN System Data Commons could not be read for Maternal mortality ratio and 1 other variable, so the answer holds no UN data for them.',
    ],
    [
        'by count when the warning labels none',
        [],
        'The UN System Data Commons could not be read for 2 variables, so the answer holds no UN data for them.',
    ],
] as const) {
    test(`aboutAnswerNotes names the failed UN reads ${name}, and leaves the refused places to the departure`, () => {
        assert.deepEqual(
            aboutAnswerNotes(humanitarianSpec, [unSystemWarning([...labels])], {}).unavailable,
            [line],
        );
    });
}

test('unSystemFailedReads states an unavailable UN search when the warning carries no params', () => {
    const bare: Warning = { ...unSystemWarning([]), params: null };

    assert.deepEqual(unSystemFailedReads([bare]), [
        'The UN System Data Commons could not be searched, so the answer holds no UN data.',
    ]);
});

test('unSystemFailedReads is empty when the warning names only refused places', () => {
    assert.deepEqual(
        unSystemFailedReads([
            {
                ...unSystemWarning([]),
                params: { places: ['country/PRK'], variables: [], variable_labels: [] },
            },
        ]),
        [],
    );
});

test('tableCaptionNotes counts the preview and states the other caption codes once per part, labelled by part', () => {
    const clamp: Warning = {
        code: 'variables_clamped',
        severity: 'warn',
        message: 'only the first 50 child places were read',
    };

    assert.deepEqual(
        tableCaptionNotes([
            {
                variableText: 'humanitarian aid',
                spec: humanitarianSpec,
                warnings: [...humanitarianWarnings, clamp, clamp],
            },
        ]),
        [
            'Showing 20 of 927 series, in no particular order',
            'Only the first 50 child places were read.',
        ],
    );
    assert.deepEqual(
        tableCaptionNotes([
            { variableText: 'GDP', spec: null, warnings: [clamp] },
            { variableText: 'population', spec: null, warnings: [] },
        ]),
        ['GDP: Only the first 50 child places were read.'],
    );
});

test('downloadNote states membership_unverified from the warnings it is given', () => {
    const sentence =
        'The search could not confirm every series behind this answer, so a download may hold different series from the ones shown.';

    assert.equal(downloadNote([{ code: 'membership_unverified' }]), sentence);
    assert.equal(downloadNote(humanitarianWarnings), null);
    assert.equal(downloadNote(undefined), null);
});

test('collapsedCandidatesNote reports an edit that left no data', () => {
    assert.equal(
        collapsedCandidatesNote([{ code: 'candidates_collapsed_no_data' }]),
        'The candidates from that edit no longer return data. See the options below, or start a new search.',
    );
    assert.equal(collapsedCandidatesNote(humanitarianWarnings), null);
});

test('no warning a part states as a departure, or the API keeps internal, reaches any line', () => {
    // Every other warning code the recorded panel carries, and the codes
    // whose facts the API states as departures.
    const codes = [
        'retrieval_score_weak',
        'elected_shape_no_data',
        'direction_discarded',
        'near_neighbor_ambiguous',
        'query_qualifier_dropped',
        'redundant_binding_dropped',
        'role_declaration_unverified',
        'binding_folded',
        'constraint_filter_fell_back',
        'deflator_projected',
        'currency_unmapped_omitted',
        'withheld_by_registry',
        'slot_defaulted',
        'family_total_absent',
        'date_coverage_partial',
    ];
    const warnings: Warning[] = codes.map((code) => ({
        code,
        severity: 'warn',
        message: `${code} happened.`,
    }));
    const spec = { spec_id: 'spec_x', slots: [] };

    assert.deepEqual(tableCaptionNotes([{ variableText: 'x', spec, warnings }]), []);
    assert.equal(downloadNote(warnings), null);
    assert.equal(collapsedCandidatesNote(warnings), null);
    assert.deepEqual(aboutAnswerNotes(spec, warnings, {}), {
        coverage: null,
        assumptions: [],
        variance: [],
        unavailable: [],
    });
});

// ---------------------------------------------------------------------------
// noDataCardParts: which no_data parts render below the sentence
// ---------------------------------------------------------------------------

test('noDataCardParts leaves a slotted part to its inline picker only when the picker can render', () => {
    const parts = [
        // "ODA to the Congo": a restatement to pin onto, so the inline picker renders.
        {
            index: 0,
            part: {
                status: 'no_data',
                no_data: odaToCongoNoData,
                restatement: odaToCongoRestatement,
            },
        },
        // "GDP of Congo": the real capture carries no restatement, so the picker refuses it.
        {
            index: 1,
            part: {
                status: 'no_data',
                no_data: gdpOfCongoNoData,
                restatement: gdpOfCongoRestatement,
            },
        },
        {
            index: 2,
            part: {
                status: 'no_data',
                no_data: odaToCongoNoData,
                restatement: odaToCongoRestatement,
            },
        },
        { index: 3, part: { status: 'definite' } },
    ];
    const slotted = new Set([0, 1]);

    const kept = noDataCardParts(parts, (index) => slotted.has(index));

    assert.deepEqual(
        kept.map((p) => p.index),
        [1, 2],
    );
});

// ---------------------------------------------------------------------------
// studioHandoffParts: one hand-off panel for a multi-part failure
// ---------------------------------------------------------------------------

const studioPart = { index: 0, part: { status: 'no_data', no_data: { nearest_real: [] } } };
const flaggedPart = {
    index: 1,
    part: {
        status: 'no_data',
        no_data: {
            nearest_real: [],
            flagged_match: { spec_id: 's1' },
            gate: 'no_member_has_data_at_place',
        },
    },
};

test('studioHandoffParts keeps only the first of several identical studio hand-offs', () => {
    const parts = [studioPart, { ...studioPart, index: 1 }, { ...studioPart, index: 2 }];

    const kept = studioHandoffParts(parts);

    assert.deepEqual(
        kept.map((p) => p.index),
        [0],
    );
});

test('studioHandoffParts keeps every flagged/alternate callout -- each carries its own part-specific text', () => {
    const parts = [flaggedPart, { ...flaggedPart, index: 2 }];

    assert.deepEqual(
        studioHandoffParts(parts).map((p) => p.index),
        [1, 2],
    );
});

test('studioHandoffParts keeps one studio panel alongside every flagged callout, in order', () => {
    const parts = [flaggedPart, studioPart, { ...studioPart, index: 2 }];

    assert.deepEqual(
        studioHandoffParts(parts).map((p) => p.index),
        [1, 0],
    );
});

test('studioHandoffParts keeps a generic studio part and a picker-offering entity_ambiguous part, in order', () => {
    const pickerPart = {
        index: 1,
        part: {
            status: 'no_data',
            no_data: odaToCongoNoData,
            restatement: odaToCongoRestatement,
        },
    };
    const parts = [studioPart, pickerPart];

    assert.deepEqual(
        studioHandoffParts(parts).map((p) => p.index),
        [0, 1],
    );
});

test('studioHandoffParts collapses an entity_ambiguous part with no restatement into the earlier studio panel', () => {
    // The real GDP-of-Congo capture: entity_ambiguous but restatement null,
    // so it can't offer its own picker and falls through to the same
    // generic Studio callout as studioPart -- not the picker-offering case
    // above.
    const noPickerPart = {
        index: 1,
        part: {
            status: 'no_data',
            no_data: gdpOfCongoNoData,
            restatement: gdpOfCongoRestatement,
        },
    };
    const parts = [studioPart, noPickerPart];

    assert.deepEqual(
        studioHandoffParts(parts).map((p) => p.index),
        [0],
    );
});

// ---------------------------------------------------------------------------
// progress: "N of M parts resolved" / a single part's own step names
// ---------------------------------------------------------------------------

test('resolvedPartCount counts only the parts whose own steps reached answer', () => {
    const partSteps = [
        ['recall', 'shape', 'bind', 'materialise', 'answer'],
        ['recall', 'shape'],
        [],
    ];

    assert.equal(resolvedPartCount(partSteps, 3), 1);
});

test('progressSuffix names N of M for two or more expected parts', () => {
    const partSteps = [['recall', 'shape', 'bind', 'materialise', 'answer'], ['recall']];

    assert.equal(progressSuffix([], partSteps, 2), '1 of 2 parts resolved');
});

test("progressSuffix names a single part's latest step as a reader phrase", () => {
    const partSteps = [['recall', 'shape']];

    assert.equal(progressSuffix(['extract'], partSteps, 1), 'Finding the measure');
});

test('progressSuffix is empty before anything has arrived', () => {
    assert.equal(progressSuffix([], [], 1), '');
});

// ---------------------------------------------------------------------------
// stepPhrase
// ---------------------------------------------------------------------------

test('stepPhrase names the latest step, not an earlier one', () => {
    assert.equal(stepPhrase(['extract', 'recall', 'shape']), 'Finding the measure');
});

test('stepPhrase maps recall, shape, and bind to the same phrase', () => {
    assert.equal(stepPhrase(['recall']), 'Finding the measure');
    assert.equal(stepPhrase(['shape']), 'Finding the measure');
    assert.equal(stepPhrase(['bind']), 'Finding the measure');
});

test('stepPhrase maps materialise and answer to their own phrases', () => {
    assert.equal(stepPhrase(['bind', 'materialise']), 'Fetching data');
    assert.equal(stepPhrase(['materialise', 'answer']), 'Preparing the answer');
});

test('stepPhrase is null before any step has run, or for an unmapped step', () => {
    assert.equal(stepPhrase([]), null);
    assert.equal(stepPhrase(['options']), null);
});

// ---------------------------------------------------------------------------
// snapshotLiveNote
// ---------------------------------------------------------------------------

const snapshotDatasets = [
    { specId: 'spec_oda', name: 'ODA' },
    { specId: 'spec_gdp', name: 'GDP' },
    { specId: 'spec_pop', name: 'Population' },
];

for (const [unreadable, expected] of [
    [[], null],
    [
        ['spec_gdp'],
        { text: 'GDP shows live data because its snapshot could not be loaded.', allLive: false },
    ],
    [
        ['spec_oda', 'spec_pop'],
        {
            text: 'ODA and Population show live data because their snapshots could not be loaded.',
            allLive: false,
        },
    ],
    [
        ['spec_oda', 'spec_gdp', 'spec_pop'],
        {
            text: 'The frozen snapshot could not be loaded. These figures are live data.',
            allLive: true,
        },
    ],
] as const) {
    test(`snapshotLiveNote names the live datasets when [${unreadable.join(', ')}] failed`, () => {
        assert.deepEqual(snapshotLiveNote(snapshotDatasets, new Set(unreadable)), expected);
    });
}
