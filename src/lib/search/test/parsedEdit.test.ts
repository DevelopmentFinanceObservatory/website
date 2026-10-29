import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyRestatementEdit,
    entityChoiceGroups,
    entityChoiceLabels,
    entityChoicePart,
    offersAmbiguousPicker,
    resolveTypedEdit,
    restatementTargetForToken,
} from '../parsedEdit.ts';
import {
    congoToCongoNoData,
    gdpOfCongoNoData,
    gdpOfCongoRestatement,
    odaToCongoNoData,
    odaToCongoRestatement,
} from './fixtures/ambiguous-congo.ts';
import { resolution } from './fixtures/resolution.ts';
import { fixtures } from './fixtures/index.ts';
import type { NoData, ParsedPart, RoleAxis, SlotAxis } from '../types.ts';

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

test('applyRestatementEdit keeps `members` on an entity it leaves alone and drops it from the edited one', () => {
    const africa = { text: 'Africa', role_text: 'to', dcid: 'africa', members: true };
    const kenya = { text: 'Kenya', role_text: 'from', members: true };
    const part: ParsedPart = { variable_text: 'GDP', entities: [africa, kenya] };

    const timeEdit = applyRestatementEdit(part, { field: 'time_text' }, 'since 2015');

    assert.deepEqual(timeEdit?.entities, [africa, kenya]);

    const entityEdit = applyRestatementEdit(part, { field: 'entity', role: 'destination' }, 'Asia');

    assert.deepEqual(entityEdit?.entities, [{ text: 'Asia', role_text: 'to' }, kenya]);
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
// entityChoiceGroups / entityChoicePart: the refusal's own options, by wording
// ---------------------------------------------------------------------------

const congoPart = () => {
    const [part] = resolution(fixtures['entity-ambiguous']).parts;

    return part as { no_data: NoData; restatement: ParsedPart };
};

test("entityChoiceGroups groups the refusal's options by the wording each settles", () => {
    const { no_data: noData } = congoPart();
    const groups = entityChoiceGroups(noData);

    assert.deepEqual(
        groups.map(({ text, options }) => [text, options.map((option) => option.label)]),
        [['Congo', ['Congo [DRC]', 'Congo [Republic]']]],
    );
    // Each choice posts its option's one part unchanged, the resolved entity pinned too.
    const [, republic] = groups[0].options;

    assert.equal(entityChoicePart(republic), noData.options![1].data_query.parts[0]);
    assert.deepEqual(
        entityChoicePart(republic)?.entities?.map((entity) => entity.dcid),
        ['country/COG', 'country/FRA'],
    );
});

test("a members option posts the group's registered name, no dcid pinned, unchanged", () => {
    const { no_data: noData } = congoPart();
    const members = {
        mentions: ['Congo'],
        label: 'Congo basin',
        data_query: {
            kind: 'parsed' as const,
            parts: [
                {
                    variable_text: 'ODA',
                    entities: [{ text: 'Congo basin', role_text: 'to', members: true }],
                },
            ],
        },
    };
    const [group] = entityChoiceGroups({ ...noData, options: [members] });

    assert.equal(entityChoicePart(group.options[0]), members.data_query.parts[0]);
});

test('entityChoiceGroups lists a wording per mention, in the order the options come', () => {
    const option = (mentions: string[], label: string) => ({
        mentions,
        label,
        data_query: { kind: 'parsed' as const, parts: [{ variable_text: 'aid' }] },
    });
    const noData: NoData = {
        reason: 'entity_ambiguous',
        options: [
            option(['World Bank'], 'IBRD'),
            option(['Georgia'], 'Georgia (country)'),
            option(['World Bank'], 'IDA'),
        ],
    };

    assert.deepEqual(
        entityChoiceGroups(noData).map(({ text, options }) => [
            text,
            options.map((choice) => choice.label),
        ]),
        [
            ['World Bank', ['IBRD', 'IDA']],
            ['Georgia', ['Georgia (country)']],
        ],
    );
    assert.deepEqual(entityChoiceGroups({ ...noData, reason: 'source_ambiguous' }), []);
    assert.deepEqual(entityChoiceGroups(null), []);
});

test('entityChoiceGroups keeps one group per entity_choice, two written alike apart', () => {
    assert.deepEqual(
        entityChoiceGroups(congoToCongoNoData).map(({ key, text, options }) => [
            key,
            text,
            options.map((option) => option.entity_choice),
        ]),
        [
            [0, 'Congo', [0, 0]],
            [1, 'Congo', [1, 1]],
        ],
    );
});

test('entityChoiceLabels numbers groups that share a wording, in menu order', () => {
    const groups = entityChoiceGroups(congoToCongoNoData);
    const [first, second] = congoToCongoNoData.options ?? [];

    assert.ok(first && second);
    assert.deepEqual(entityChoiceLabels(groups), ['Congo (1)', 'Congo (2)']);
    // One option settles its group by entity_choice, the other by mention:
    // two keys of different kinds, one wording.
    const mixed = entityChoiceGroups({
        ...congoToCongoNoData,
        options: [first, { ...second, entity_choice: null, mentions: ['Congo'] }],
    });

    assert.deepEqual(
        mixed.map((group) => group.key),
        [0, 'Congo'],
    );
    assert.deepEqual(entityChoiceLabels(mixed), ['Congo (1)', 'Congo (2)']);
    // A wording no other group shares keeps its own text.
    assert.deepEqual(entityChoiceLabels(entityChoiceGroups(odaToCongoNoData)), ['Congo']);
});

// ---------------------------------------------------------------------------
// offersAmbiguousPicker: SearchCards and studioHandoffParts' shared gate for
// whether a no_data part gets the "Choose a Match" picker rather than the
// generic Studio hand-off panel
// ---------------------------------------------------------------------------

test('offersAmbiguousPicker is true for an entity_ambiguous refusal with options', () => {
    assert.equal(
        offersAmbiguousPicker({
            no_data: odaToCongoNoData,
            restatement: odaToCongoRestatement,
        }),
        true,
    );
});

test('offersAmbiguousPicker is false for the real GDP-of-Congo capture (no options)', () => {
    assert.equal(
        offersAmbiguousPicker({
            no_data: gdpOfCongoNoData,
            restatement: gdpOfCongoRestatement,
        }),
        false,
    );
});

test('offersAmbiguousPicker is false with options absent or empty', () => {
    for (const options of [undefined, []]) {
        assert.equal(offersAmbiguousPicker({ no_data: { ...odaToCongoNoData, options } }), false);
    }
});

test('offersAmbiguousPicker is false for a non-object part, undefined, or null', () => {
    assert.equal(offersAmbiguousPicker(undefined), false);
    assert.equal(offersAmbiguousPicker(null), false);
    assert.equal(offersAmbiguousPicker('no_data'), false);
});
