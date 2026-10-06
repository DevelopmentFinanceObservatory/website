import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReplayPlan, nextEditsByPart } from '../permalinkEdits.ts';
import type { PermalinkEdit } from '../permalink.ts';
import type { DatasetResubmitEntry, Part } from '../types.ts';

const identity: DatasetResubmitEntry = {
    entry_kind: 'identity',
    variable_text: 'ODA disbursements',
    identity: {
        identity_version: 'spec1',
        shape: {},
        slots: [],
        entities: { origin: ['country/FRA'] },
        requested_window: { kind: 'all' },
    },
};

const parsed: DatasetResubmitEntry = {
    entry_kind: 'parsed',
    part: {
        variable_text: 'donor spending',
        entities: [{ text: 'France', role_text: 'donor' }],
    },
};

// A typed `what` edit: `applyRestatementEdit` (parsedEdit.ts) rewrites the
// posted parsed entry's own `variable_text` to the newly typed phrase, so it
// reads differently from the base run's own text ("population growth").
const measureEdit: DatasetResubmitEntry = {
    entry_kind: 'parsed',
    part: {
        variable_text: 'GDP growth',
        entities: [],
    },
};

// A year edit posted after `measureEdit` landed: editWindow's identity entry
// carries the part's now-current `variable_text` ('GDP growth', the first
// edit's own rewrite), same as any identity entry does. See
// `identityEntryFor`, datasetEntries.ts.
const yearEdit: DatasetResubmitEntry = {
    entry_kind: 'identity',
    variable_text: 'GDP growth',
    identity: {
        identity_version: 'spec1',
        shape: {},
        slots: [],
        entities: {},
        requested_window: { kind: 'range', start_year: 2010 },
    },
};

const candidates: DatasetResubmitEntry = {
    entry_kind: 'candidates',
    variable_text: 'ODA disbursements',
    ordering: 'broadest_first',
    truncated: false,
    candidates: [],
};

function part(variableText: string): Part {
    return {
        variable_text: variableText,
        warnings: [],
        restatement: null,
        operations: [],
        departures: [],
        status: 'definite',
    };
}

test('nextEditsByPart records only the parsed edit when identity then parsed land on the same part', () => {
    const afterIdentity = nextEditsByPart({}, [identity], [0], ['ODA disbursements']);
    assert.equal(afterIdentity[0].entry.entry_kind, 'identity');

    const afterParsed = nextEditsByPart(afterIdentity, [parsed], [0], ['ODA disbursements']);

    assert.equal(Object.keys(afterParsed).length, 1);
    assert.equal(afterParsed[0].entry.entry_kind, 'parsed');
});

test('nextEditsByPart deletes the index when a touched part lands as a non-replayable kind', () => {
    const afterIdentity = nextEditsByPart({}, [identity], [0], ['ODA disbursements']);
    const afterCandidates = nextEditsByPart(
        afterIdentity,
        [candidates],
        [0],
        ['ODA disbursements'],
    );

    assert.equal(afterCandidates[0], undefined);
});

test("nextEditsByPart records the base run's phrase, not a typed edit's own rewritten one", () => {
    const afterEdit = nextEditsByPart({}, [measureEdit], [0], ['population growth']);

    assert.equal(afterEdit[0].variableText, 'population growth');
    assert.equal(afterEdit[0].entry.entry_kind, 'parsed');
    assert.equal((afterEdit[0].entry as typeof measureEdit).part.variable_text, 'GDP growth');
});

test("nextEditsByPart keeps the base run's phrase across a second edit on the same part", () => {
    // The base run asked 'population growth'. A typed measure edit lands
    // 'GDP growth' on the part itself, then a year edit posts next. Its own
    // entry carries 'GDP growth' (the part's now-current text), but the
    // recorded guard must stay the ORIGINAL base phrase throughout, or a
    // reload (which only ever reproduces 'population growth') would mark
    // the chained edit stale.
    const afterMeasure = nextEditsByPart({}, [measureEdit], [0], ['population growth']);
    assert.equal(afterMeasure[0].variableText, 'population growth');

    const afterYear = nextEditsByPart(afterMeasure, [yearEdit], [0], ['population growth']);

    assert.equal(afterYear[0].variableText, 'population growth');
    assert.equal(afterYear[0].entry, yearEdit);
});

test('buildReplayPlan replays an edit through the {index, entry} override the identity path uses -- a parsed edit or a typed measure-phrase edit alike', () => {
    const cases: Array<{ description: string; edit: PermalinkEdit; currentPhrase: string }> = [
        {
            description: 'a parsed edit',
            edit: { part: 0, variableText: 'donor spending', entry: parsed },
            currentPhrase: 'donor spending',
        },
        {
            // recordEdits stores the phrase the base run asked ('population
            // growth'), even though the posted entry's own text is the
            // edited one ('GDP growth'). A reload's fresh base run
            // re-derives the same part, still asking 'population growth'
            // (the raw query never changed), so the guard matches and the
            // edit (GDP growth) replays.
            description: 'a typed measure-phrase edit, guarded by the base run phrase',
            edit: { part: 0, variableText: 'population growth', entry: measureEdit },
            currentPhrase: 'population growth',
        },
    ];

    for (const { description, edit, currentPhrase } of cases) {
        const plan = buildReplayPlan([edit], [part(currentPhrase)]);

        assert.deepEqual(plan.overrides, [{ index: 0, entry: edit.entry }], description);
        assert.deepEqual(plan.touched, [0], description);
        assert.deepEqual(plan.stale, [], description);
    }
});

test('a typed measure edit followed by a year edit on the same part both replay after reload, keeping the latest', () => {
    const afterMeasure = nextEditsByPart({}, [measureEdit], [0], ['population growth']);
    const afterYear = nextEditsByPart(afterMeasure, [yearEdit], [0], ['population growth']);

    const edits = Object.values(afterYear).sort((a, b) => a.part - b.part);
    const plan = buildReplayPlan(edits, [part('population growth')]);

    assert.deepEqual(plan.overrides, [{ index: 0, entry: yearEdit }]);
    assert.deepEqual(plan.touched, [0]);
    assert.deepEqual(plan.stale, []);
});

test('buildReplayPlan reports a stale edit whose part no longer asks the same variable', () => {
    const edit: PermalinkEdit = { part: 0, variableText: 'donor spending', entry: parsed };
    const plan = buildReplayPlan([edit], [part('recipient spending')]);

    assert.deepEqual(plan.overrides, []);
    assert.deepEqual(plan.stale, [0]);
});
