import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyRestatementEdit,
    buildAmbiguousPickPart,
    canPinEntityDcid,
    offersAmbiguousPicker,
    resolveTypedEdit,
    restatementTargetForToken,
} from '../parsedEdit.ts';
import {
    gdpOfCongoNoData,
    gdpOfCongoRestatement,
    odaToCongoNoData,
    odaToCongoRestatement,
} from './fixtures/ambiguous-congo.ts';
import type { ParsedPart, RoleAxis, SlotAxis } from '../types.ts';

// ---------------------------------------------------------------------------
// restatementTargetForToken / applyRestatementEdit: one restatement field per
// axis
// ---------------------------------------------------------------------------

test('restatementTargetForToken maps each edit token to its field, where alone carrying a role', () => {
    const cases: Array<[SlotAxis, RoleAxis | null, unknown]> = [
        ['what', null, { field: 'variable_text' }],
        ['when', null, { field: 'time_text' }],
        ['source', null, { field: 'source_text' }],
        ['where', 'destination', { field: 'entity', role: 'destination' }],
        ['where', null, { field: 'entity', role: null }],
        ['how', null, null], // how has no restatement field
    ];

    for (const [token, role, expected] of cases) {
        assert.deepEqual(restatementTargetForToken(token, role), expected, `${token}/${role}`);
    }
});

const restatement: ParsedPart = {
    variable_text: 'aid',
    entities: [
        { text: 'Kenya', role_text: 'to' },
        { text: 'France', role_text: 'from' },
    ],
    time_text: 'since 2015',
    unit_text: 'current US dollars',
    source_text: 'OECD',
};

test('applyRestatementEdit rewrites exactly the targeted field, leaving the rest untouched', () => {
    const cases = [
        {
            field: 'variable_text' as const,
            value: 'humanitarian aid',
            unchanged: 'entities' as const,
        },
        { field: 'time_text' as const, value: 'since 2018', unchanged: 'variable_text' as const },
        { field: 'source_text' as const, value: 'World Bank', unchanged: null },
    ];

    for (const { field, value, unchanged } of cases) {
        const edited = applyRestatementEdit(restatement, { field }, value);

        assert.equal(edited?.[field], value, field);
        if (unchanged) {
            assert.deepEqual(edited?.[unchanged], restatement[unchanged], `${field}: ${unchanged}`);
        }
    }
});

test('applyRestatementEdit rewrites the destination entity (role_text "to")', () => {
    const edited = applyRestatementEdit(
        restatement,
        { field: 'entity', role: 'destination' },
        'Ethiopia',
    );

    assert.deepEqual(edited?.entities, [
        { text: 'Ethiopia', role_text: 'to' },
        { text: 'France', role_text: 'from' },
    ]);
});

test('applyRestatementEdit rewrites the origin entity (role_text "from")', () => {
    const edited = applyRestatementEdit(
        restatement,
        { field: 'entity', role: 'origin' },
        'Germany',
    );

    assert.deepEqual(edited?.entities, [
        { text: 'Kenya', role_text: 'to' },
        { text: 'Germany', role_text: 'from' },
    ]);
});

test('applyRestatementEdit rewrites the subject entity (no role_text) when role is null', () => {
    const subject: ParsedPart = { variable_text: 'GDP', entities: [{ text: 'Kenya' }] };
    const edited = applyRestatementEdit(subject, { field: 'entity', role: null }, 'Ethiopia');

    assert.deepEqual(edited?.entities, [{ text: 'Ethiopia' }]);
});

test('applyRestatementEdit replaces every entity in the edited role, where one token renders them all', () => {
    const cases: [RoleAxis | null, ParsedPart['entities'], ParsedPart['entities']][] = [
        [
            'destination',
            [
                { text: 'Kenya', role_text: 'to', dcid: 'country/KEN' },
                { text: 'France', role_text: 'from' },
                { text: 'Ethiopia', role_text: 'to', dcid: 'country/ETH' },
            ],
            [
                { text: 'Uganda', role_text: 'to' },
                { text: 'France', role_text: 'from' },
            ],
        ],
        [null, [{ text: 'Kenya' }, { text: 'Ethiopia' }], [{ text: 'Uganda' }]],
    ];

    for (const [role, entities, expected] of cases) {
        const edited = applyRestatementEdit(
            { variable_text: 'ODA', entities },
            { field: 'entity', role },
            'Uganda',
        );

        assert.deepEqual(edited?.entities, expected, String(role));
    }
});

test('applyRestatementEdit drops a pinned dcid when the entity text is retyped', () => {
    const pinned: ParsedPart = {
        variable_text: 'aid',
        entities: [{ text: 'Congo [Republic]', role_text: 'to', dcid: 'country/COG' }],
    };

    const edited = applyRestatementEdit(
        pinned,
        { field: 'entity', role: 'destination' },
        'Ethiopia',
    );

    assert.deepEqual(edited?.entities, [{ text: 'Ethiopia', role_text: 'to' }]);
});

test('applyRestatementEdit returns null when the restatement carries no matching-role entity', () => {
    const oneWay: ParsedPart = {
        variable_text: 'aid',
        entities: [{ text: 'Kenya', role_text: 'to' }],
    };

    assert.equal(
        applyRestatementEdit(oneWay, { field: 'entity', role: 'origin' }, 'Germany'),
        null,
    );
});

test('applyRestatementEdit returns null for a subject edit when every entity is directional', () => {
    assert.equal(applyRestatementEdit(restatement, { field: 'entity', role: null }, 'x'), null);
});

// ---------------------------------------------------------------------------
// resolveTypedEdit: PhraseEditor's own apply -> parsed part, or null (fall
// back to refineAt)
// ---------------------------------------------------------------------------

test('resolveTypedEdit builds the edited part for a what token with a restatement', () => {
    const edited = resolveTypedEdit(restatement, 'what', null, 'humanitarian aid');

    assert.equal(edited?.variable_text, 'humanitarian aid');
});

test('resolveTypedEdit is null with no restatement -- the no-restatement fallback', () => {
    assert.equal(resolveTypedEdit(null, 'what', null, 'humanitarian aid'), null);
    assert.equal(resolveTypedEdit(undefined, 'what', null, 'humanitarian aid'), null);
});

test('resolveTypedEdit is null for a how token even with a restatement present', () => {
    assert.equal(resolveTypedEdit(restatement, 'how', null, 'grants only'), null);
});

// ---------------------------------------------------------------------------
// canPinEntityDcid: the gating rule
// ---------------------------------------------------------------------------

test('canPinEntityDcid is true when the response carried ambiguous_entities', () => {
    assert.equal(canPinEntityDcid(odaToCongoNoData), true);
});

test('canPinEntityDcid is false with no ambiguous_entities, absent or empty', () => {
    assert.equal(canPinEntityDcid(undefined), false);
    assert.equal(canPinEntityDcid(null), false);
    assert.equal(canPinEntityDcid({ reason: 'no_observations' }), false);
    assert.equal(canPinEntityDcid({ reason: 'entity_ambiguous', ambiguous_entities: [] }), false);
});

// ---------------------------------------------------------------------------
// offersAmbiguousPicker: SearchCards and studioHandoffParts' shared gate for
// whether a no_data part gets the "Choose a Match" picker rather than the
// generic Studio hand-off panel
// ---------------------------------------------------------------------------

test('offersAmbiguousPicker is true for the real ODA-to-Congo capture (restatement present)', () => {
    assert.equal(
        offersAmbiguousPicker({
            no_data: odaToCongoNoData,
            restatement: odaToCongoRestatement,
        }),
        true,
    );
});

test('offersAmbiguousPicker is false for the real GDP-of-Congo capture (restatement null)', () => {
    assert.equal(
        offersAmbiguousPicker({
            no_data: gdpOfCongoNoData,
            restatement: gdpOfCongoRestatement,
        }),
        false,
    );
});

test('offersAmbiguousPicker is false with no ambiguous_entities, absent or empty', () => {
    assert.equal(
        offersAmbiguousPicker({
            no_data: { reason: 'entity_ambiguous', ambiguous_entities: [] },
            restatement: odaToCongoRestatement,
        }),
        false,
    );
});

test('offersAmbiguousPicker is false for a non-object part, undefined, or null', () => {
    assert.equal(offersAmbiguousPicker(undefined), false);
    assert.equal(offersAmbiguousPicker(null), false);
    assert.equal(offersAmbiguousPicker('no_data'), false);
});

// ---------------------------------------------------------------------------
// buildAmbiguousPickPart: a pick's own parsed part, built from the fixtures
// captured for "GDP of Congo" and "official development assistance to the
// Congo" (ambiguous_entities added by hand -- see the fixture's own doc
// comment)
// ---------------------------------------------------------------------------

test('buildAmbiguousPickPart pins either candidate onto the matching restatement entity (ODA to the Congo)', () => {
    const group = odaToCongoNoData.ambiguous_entities![0];
    const cases = [
        {
            candidateIndex: 0, // Congo [DRC]
            entities: [{ text: 'Congo [DRC]', role_text: 'to', dcid: 'country/COD' }],
        },
        {
            candidateIndex: 1, // Congo [Republic]
            entities: [{ text: 'Congo [Republic]', role_text: 'to', dcid: 'country/COG' }],
        },
    ];

    for (const { candidateIndex, entities } of cases) {
        const candidate = group.candidates[candidateIndex];
        const part = buildAmbiguousPickPart(odaToCongoRestatement, group.text, candidate);

        assert.deepEqual(part, { variable_text: 'official development assistance', entities });
    }
});

test('buildAmbiguousPickPart returns null (nothing to post) when no entity text matches the group', () => {
    const group = odaToCongoNoData.ambiguous_entities![0];
    const candidate = group.candidates[0];
    const mismatched: ParsedPart = { variable_text: 'aid', entities: [{ text: 'Kenya' }] };

    const part = buildAmbiguousPickPart(mismatched, group.text, candidate);

    assert.equal(part, null);
});
