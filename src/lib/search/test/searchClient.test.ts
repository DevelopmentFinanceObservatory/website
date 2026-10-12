import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyDoneEvent,
    artifactHref,
    entityOptions,
    fetchDatasetOptions,
    fetchDefinitionMembers,
    fetchVersionLink,
    flattenSpec,
    mergeLateWarnings,
    mintDataset,
    normalizeResponse,
    pinDownloadedVersion,
    placeOptionValues,
    resolveStream,
    type SearchEvent,
} from '../searchClient.ts';
import type { Warning } from '../types.ts';
import { fixtures } from './fixtures/index.ts';
import {
    currentEntityDcid,
    entitySlotOptions,
    isLevelScopedOptions,
    partitionLevelOptions,
    placeEditorScopes,
    primaryStatVarLabel,
    statVarsUnreadable,
} from '../view.ts';

// A minimal but wire-shaped WireSpec: the definition/resolved split contract
// v1 requires, with a well-formed `stat_vars`.
function wireSpec(statVars: unknown) {
    return {
        spec_id: 'spec-1',
        definition: {
            schema_version: 1,
            spec_id: 'spec-1',
            identity: { identity_version: 'spec1' },
        },
        resolved: {
            shape: {
                shape_id: 'shape-1',
                label: 'Development finance',
                slot_keys: [],
                member_count: 1,
            },
            slots: [],
            stat_vars: statVars,
            entities: [],
            coverage: { kind: 'bare', has_data: true },
            trace: {},
        },
    };
}

test('flattenSpec reads a well-formed stat_vars, with the counts as the wire sends them', () => {
    const flat = flattenSpec(
        wireSpec({ member_count: 42, member_count_exact: true, served_count: 3 }),
    );

    assert.equal(statVarsUnreadable(flat), false);
    assert.equal(flat.stat_vars.member_count, 42);
    assert.equal(flat.stat_vars.served_count, 3);
    assert.equal(
        statVarsUnreadable(
            flattenSpec(
                wireSpec({ member_count: 42, member_count_exact: false, served_count: null }),
            ),
        ),
        false,
        'a null served_count is an unsettled membership, not a broken shape',
    );
});

for (const [name, statVars] of [
    ['missing member_count', { member_count_exact: true, served_count: 1 }],
    ['missing member_count_exact', { member_count: 1, served_count: 1 }],
    [
        'a served_count that is not a number',
        { member_count: 1, member_count_exact: true, served_count: '1' },
    ],
    [
        'a data_date_range that is not an object',
        { member_count: 1, member_count_exact: true, served_count: 1, data_date_range: '2020' },
    ],
] as const) {
    test(`flattenSpec flags a stat_vars ${name} as unreadable`, () => {
        assert.equal(statVarsUnreadable(flattenSpec(wireSpec(statVars))), true);
    });
}

test('primaryStatVarLabel names the measure, then the shape', () => {
    const flat = flattenSpec(wireSpec({ member_count: 1, member_count_exact: true }));

    assert.equal(primaryStatVarLabel(flat), 'Development finance');
    assert.equal(primaryStatVarLabel({ ...flat, measure_label: 'GDP (nominal)' }), 'GDP (nominal)');
});

test('flattenSpec flags a flat pre-v1-shaped stat_vars array as unreadable', () => {
    const flat = flattenSpec(wireSpec(['dcid/GdpNominal', 'dcid/GdpPerCapita']));

    assert.equal(statVarsUnreadable(flat), true);
});

test('flattenSpec flags a null stat_vars as unreadable', () => {
    const flat = flattenSpec(wireSpec(null));

    assert.equal(statVarsUnreadable(flat), true);
});

test('flattenSpec flags a spec missing the definition/resolved split as unreadable, rather than passing it through as a flat pre-v1 body', () => {
    const flat = flattenSpec({
        spec_id: 'spec-1',
        stat_vars: ['dcid/GdpNominal'],
    });

    assert.equal(statVarsUnreadable(flat), true);
});

test('entityOptions posts no resolved_stat_var_dcids and asks for include_coverage', async (t) => {
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ options: { items: [], truncated: false } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
    );

    await entityOptions({
        identity: { identity_version: 'spec1' },
        scope: 'peers',
    });

    const [, init] = fetchMock.mock.calls[0].arguments as [unknown, RequestInit];
    const sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;

    assert.equal('resolved_stat_var_dcids' in sentBody, false);
    assert.equal(sentBody.include_coverage, true);
});

test('fetchDatasetOptions posts the definition to the options door, and reads its output_options and coverage', async (t) => {
    const outputOptions = { formats: [{ name: 'csv', state: 'available' }] };
    const coverage = {
        dimensions: [{ label: 'financingRecipient', count: 4, axis: 'destination' }],
    };
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ output_options: outputOptions, coverage }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
    );
    const definition = { schema_version: 1, spec_id: 'spec_1', identity: { shape_id: 'x' } };

    const options = await fetchDatasetOptions({ spec_id: 'spec_1', definition });

    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];

    assert.deepEqual(options, { output_options: outputOptions, coverage });
    assert.match(url, /\/api\/datasets\/spec_1\/options$/);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(String(init.body)), { schema_version: 1, definition });
});

test('fetchDefinitionMembers posts the definition to the members door and reads the served members', async (t) => {
    const members = [
        {
            ref: 'dcid:Count_Person_Female',
            label: 'Female population',
            roles: [],
            constraints: { gender: 'Female' },
        },
        { ref: 'dcid:Count_Person_Male', label: null, roles: [], constraints: { gender: 'Male' } },
    ];
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(
                JSON.stringify({
                    schema_version: 1,
                    spec_id: 'spec_1',
                    members,
                    served_count: 2,
                    family_member_count: 2,
                    family_member_digest: 'sha256:ab',
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
    );
    const definition = { schema_version: 1, spec_id: 'spec_1', identity: { shape_id: 'x' } };

    const answer = await fetchDefinitionMembers({ spec_id: 'spec_1', definition });
    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];

    assert.match(url, /\/api\/datasets\/spec_1\/members$/);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(String(init.body)), { schema_version: 1, definition });
    assert.deepEqual(answer.members, members);
    assert.equal(answer.served_count, 2);
});

test('fetchDefinitionMembers throws the door refusal with its code', async (t) => {
    t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ code: 'scope_too_broad', detail: 'too broad' }), {
                status: 422,
                headers: { 'content-type': 'application/problem+json' },
            }),
    );

    await assert.rejects(fetchDefinitionMembers({ spec_id: 'spec_1' }), {
        code: 'scope_too_broad',
    });
});

test('fetchDatasetOptions without a definition reads the registered spec through a GET', async (t) => {
    const outputOptions = { formats: [{ name: 'parquet', state: 'available' }] };
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () => new Response(JSON.stringify({ output_options: outputOptions })),
    );

    const options = await fetchDatasetOptions({ spec_id: 'spec_1' });
    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];

    assert.deepEqual(options?.output_options, outputOptions);
    assert.match(url, /\/api\/datasets\/spec_1\/options$/);
    assert.equal(init.method, undefined);
    assert.equal(init.body, undefined);
});

test('entityOptions sends observationAbout in for.role when role is omitted (a non-directional anchor)', async (t) => {
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ options: { items: [], truncated: false } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
    );

    await entityOptions({
        identity: { identity_version: 'spec1' },
        scope: 'peers',
    });

    const [, init] = fetchMock.mock.calls[0].arguments as [unknown, RequestInit];
    const sentBody = JSON.parse(String(init.body)) as { for: { role: string } };

    assert.equal(sentBody.for.role, 'observationAbout');
});

test('entityOptions sends a directional role verbatim in for.role: origin', async (t) => {
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ options: { items: [], truncated: false } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
    );

    await entityOptions({
        identity: { identity_version: 'spec1' },
        scope: 'peers',
        role: 'origin',
    });

    const [, init] = fetchMock.mock.calls[0].arguments as [unknown, RequestInit];
    const sentBody = JSON.parse(String(init.body)) as { for: { role: string } };

    assert.equal(sentBody.for.role, 'origin');
});

test('entityOptions sends a directional role verbatim in for.role: destination (the CRS recipient role the door was refusing as observationAbout)', async (t) => {
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ options: { items: [], truncated: false } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
    );

    await entityOptions({
        identity: { identity_version: 'spec1' },
        scope: 'children',
        role: 'destination',
    });

    const [, init] = fetchMock.mock.calls[0].arguments as [unknown, RequestInit];
    const sentBody = JSON.parse(String(init.body)) as { for: { role: string } };

    assert.equal(sentBody.for.role, 'destination');
});

test('placeEditorScopes asks for peers only on a directional role (the door ignores for.scope there, dfo-apis#879)', () => {
    assert.deepEqual(placeEditorScopes('origin'), ['peers']);
    assert.deepEqual(placeEditorScopes('destination'), ['peers']);
});

test('placeEditorScopes asks for both peers and children on the observationAbout path with one place bound', () => {
    assert.deepEqual(placeEditorScopes('observationAbout'), ['peers', 'children']);
    assert.deepEqual(placeEditorScopes(undefined), ['peers', 'children']);
});

test('placeEditorScopes drops children once more than one place is bound (children_anchor_ambiguous)', () => {
    assert.deepEqual(placeEditorScopes(undefined, 2), ['peers']);
    assert.deepEqual(placeEditorScopes('observationAbout', 2), ['peers']);
});

test("entityOptions reports the door's own truncated flag from the response", async (t) => {
    t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ options: { items: [], truncated: true } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
    );

    const result = await entityOptions({
        identity: { identity_version: 'spec1' },
        scope: 'peers',
    });

    assert.equal(result.truncated, true);
});

// --- placeOptionValues (the place_options SSE event's own "parse" step) --

// Shaped from dfo-apis events.py's PlaceOptionsEvent.options: list[SlotOption]
// (models/options.py's SlotOption -- value: SlotValue, coverage), SlotValue's
// own ref: GraphRef (models/grammar.py -- {dcid, label}). A captured
// place_options frame for "Population of Kenya" would carry Kenya's own
// peers this way, coverage populated (the event always sets include_coverage
// true).
const capturedPlaceOptionsEvent = {
    kind: 'place_options',
    spec_id: 'spec-1',
    role: 'observationAbout',
    scope: 'peers',
    anchor_ref: 'country/KEN',
    options: [
        {
            value: { ref: { dcid: 'country/GHA', label: 'Ghana' }, value_kind: 'entity' },
            coverage: { kind: 'exact', has_data: true, observation_count: 40 },
        },
        {
            value: { ref: { dcid: 'country/NGA', label: 'Nigeria' }, value_kind: 'entity' },
            coverage: { kind: 'exact', has_data: true, observation_count: 12 },
        },
        // A dcid the label lookup failed for: SlotOptions.options' own
        // contract drops these server-side, but a client-side defensive
        // filter should too, matching entityOptions()'s own behaviour.
        { value: { ref: { dcid: 'country/ZZZ', label: '' }, value_kind: 'entity' } },
    ],
    truncated: false,
};

test("placeOptionValues reshapes a captured place_options event's wire SlotOption[] to the flat EntityOption client shape", () => {
    const options = placeOptionValues(capturedPlaceOptionsEvent.options);

    assert.deepEqual(options, [
        {
            dcid: 'country/GHA',
            label: 'Ghana',
            coverage: { kind: 'exact', has_data: true, observation_count: 40 },
        },
        {
            dcid: 'country/NGA',
            label: 'Nigeria',
            coverage: { kind: 'exact', has_data: true, observation_count: 12 },
        },
    ]);
});

test('placeOptionValues drops an item missing a dcid or label rather than showing it half-filled', () => {
    const options = placeOptionValues([
        { value: { ref: { dcid: 'country/ZZZ', label: '' }, value_kind: 'entity' } },
        { value: { ref: null, value_kind: 'entity' } },
    ]);

    assert.deepEqual(options, []);
});

test('placeOptionValues returns an empty list for an empty/absent items array', () => {
    assert.deepEqual(placeOptionValues([]), []);
});

test('flattenSpec reads a SlotOptions payload carrying truncated (post-drift-correction shape)', () => {
    const wire = {
        spec_id: 'spec-1',
        definition: {
            schema_version: 1,
            spec_id: 'spec-1',
            identity: { identity_version: 'spec1' },
        },
        resolved: {
            shape: {
                shape_id: 'shape-1',
                label: 'Development finance',
                slot_keys: [],
                member_count: 1,
            },
            slots: [],
            slot_options: [
                {
                    key: {
                        axis: 'how',
                        property: { dcid: 'crsPurpose', label: 'purpose' },
                        label: 'purpose',
                    },
                    options: [{ value: { value_kind: 'enum_value' } }],
                    truncated: false,
                    source: 'seed',
                },
            ],
            stat_vars: { member_count: 1, member_count_exact: true, served_count: 1 },
            entities: [],
            coverage: { kind: 'bare', has_data: true },
            trace: {},
        },
    };

    const flat = flattenSpec(wire);

    assert.equal(flat.slot_options[0].truncated, false);
    assert.equal('complete' in flat.slot_options[0], false);
});

test('isLevelScopedOptions is true once relation is populated on the list', () => {
    assert.equal(
        isLevelScopedOptions([{ value: { ref: { dcid: 'x', label: 'X' } }, relation: 'root' }]),
        true,
    );
});

test('isLevelScopedOptions is false for a flat/seed option list (relation absent)', () => {
    assert.equal(isLevelScopedOptions([{ value: { ref: { dcid: 'x', label: 'X' } } }]), false);
});

test('isLevelScopedOptions is false for an empty option list', () => {
    assert.equal(isLevelScopedOptions([]), false);
});

test("partitionLevelOptions splits a bound node's neighbours into one parent and its children", () => {
    const parent = {
        value: { ref: { dcid: 'infectious', label: 'Infectious disease control' } },
        relation: 'parent',
        member_count: 1204,
    };
    const child = {
        value: { ref: { dcid: 'tb', label: 'Tuberculosis control' } },
        relation: 'child',
        member_count: 88,
    };

    const partition = partitionLevelOptions([parent, child]);

    assert.equal(partition.parent, parent);
    assert.deepEqual(partition.children, [child]);
    assert.deepEqual(partition.roots, []);
});

test('partitionLevelOptions reads every entry as a root when the slot is unbound or its code system is flat', () => {
    const roots = [
        { value: { ref: { dcid: 'a', label: 'A' } }, relation: 'root', member_count: 5 },
        { value: { ref: { dcid: 'b', label: 'B' } }, relation: 'root', member_count: 2 },
    ];

    const partition = partitionLevelOptions(roots);

    assert.equal(partition.parent, null);
    assert.deepEqual(partition.children, []);
    assert.deepEqual(partition.roots, roots);
});

test('entitySlotOptions reads the requested directional axis rather than assuming origin', () => {
    const options = [
        { value: { value_kind: 'entity' as const, ref: { dcid: 'donor-1', label: 'Donor' } } },
    ];
    const entries = {
        'spec-1': [
            { role: 'origin' as const, options, truncated: false },
            {
                role: 'destination' as const,
                options: [
                    {
                        value: {
                            value_kind: 'entity' as const,
                            ref: { dcid: 'country/KEN', label: 'Kenya' },
                        },
                    },
                ],
                truncated: true,
            },
        ],
    };

    assert.deepEqual(entitySlotOptions({ spec_id: 'spec-1' }, entries, 'origin'), options);
    assert.equal(
        entitySlotOptions({ spec_id: 'spec-1' }, entries, 'destination')[0]?.value.ref?.dcid,
        'country/KEN',
    );
});

test('entitySlotOptions returns nothing when the requested directional axis is absent', () => {
    assert.deepEqual(
        entitySlotOptions(
            { spec_id: 'spec-1' },
            {
                'spec-1': [
                    {
                        role: 'destination',
                        options: [],
                        truncated: false,
                    },
                ],
            },
            'origin',
        ),
        [],
    );
});

test("currentEntityDcid reads a ResolvedEntity's flat role string and bare-string ref", () => {
    assert.equal(
        currentEntityDcid({ entities: [{ ref: 'country/FRA', role: 'origin' }] }, 'origin'),
        'country/FRA',
    );
});

test('currentEntityDcid is undefined with no entity in the requested role', () => {
    assert.equal(
        currentEntityDcid(
            { entities: [{ ref: 'country/USA', role: 'observationAbout' }] },
            'origin',
        ),
        undefined,
    );
});

test('mergeLateWarnings attaches a done event warning to the definite part carrying its spec_id', () => {
    const response = normalizeResponse(fixtures['definite-single']);
    const specId = response.parts[0].spec.spec_id;

    const merged = mergeLateWarnings(response, [
        {
            code: 'observations_timed_out',
            severity: 'warn',
            message: 'observations deadline exceeded',
            spec_id: specId,
        },
    ]);

    assert.deepEqual(merged.parts[0].warnings, [
        {
            code: 'observations_timed_out',
            severity: 'warn',
            message: 'observations deadline exceeded',
            spec_id: specId,
        },
    ]);
    // The source response a late event merges onto is never mutated. A
    // stale closure over the pre-merge object must still see no warnings.
    assert.deepEqual(response.parts[0].warnings, []);
});

test('mergeLateWarnings attaches a late warning to a definite part whose warnings key is missing', () => {
    const response = normalizeResponse(fixtures['definite-single']);
    const specId = response.parts[0].spec.spec_id;
    // Part.warnings is typed as required, but the wire can leave the key off a
    // definite part. Deleting the key exercises that path. An empty array
    // would not.
    delete response.parts[0].warnings;
    const warning = {
        code: 'observations_timed_out',
        severity: 'warn' as const,
        message: 'observations deadline exceeded',
        spec_id: specId,
    };

    const merged = mergeLateWarnings(response, [warning]);

    assert.deepEqual(merged.parts[0].warnings, [warning]);
});

test("mergeLateWarnings keeps a part's existing warnings and appends the late one to them", () => {
    const response = normalizeResponse(fixtures['broad-truncated']);
    const specId = response.parts[0].spec.spec_id;
    const before = response.parts[0].warnings.length;

    const merged = mergeLateWarnings(response, [
        { code: 'observations_timed_out', severity: 'warn', message: 'late', spec_id: specId },
    ]);

    assert.equal(merged.parts[0].warnings.length, before + 1);
    assert.ok(
        merged.parts[0].warnings.some(
            (warning) => warning.code === 'observations_series_truncated',
        ),
        'the warning already on the part survives the merge',
    );
    assert.ok(
        merged.parts[0].warnings.some((warning) => warning.code === 'observations_timed_out'),
        'the late warning is appended',
    );
});

test('mergeLateWarnings dedupes a done warning identical (code + message + spec_id) to one the part already carries', () => {
    const response = normalizeResponse(fixtures['broad-truncated']);
    const specId = response.parts[0].spec.spec_id;
    const before: Warning[] = response.parts[0].warnings;
    const shipped = before.find((warning) => warning.code === 'observations_series_truncated');

    assert.ok(shipped, 'the part ships an observations_series_truncated warning');

    const merged = mergeLateWarnings(response, [{ ...shipped, spec_id: specId }]);

    assert.equal(merged.parts[0].warnings.length, before.length);
    assert.deepEqual(merged.parts[0].warnings, before);
});

test('mergeLateWarnings still appends a done warning sharing a code with one already on the part, when its message differs', () => {
    const response = normalizeResponse(fixtures['broad-truncated']);
    const specId = response.parts[0].spec.spec_id;
    const before = response.parts[0].warnings.length;

    const merged = mergeLateWarnings(response, [
        {
            code: 'observations_series_truncated',
            severity: 'warn',
            message: 'a distinct observations_series_truncated warning for a different reason',
            spec_id: specId,
        },
    ]);

    assert.equal(merged.parts[0].warnings.length, before + 1);
    assert.ok(
        merged.parts[0].warnings.some(
            (warning) =>
                warning.code === 'observations_series_truncated' &&
                warning.message ===
                    'a distinct observations_series_truncated warning for a different reason',
        ),
    );
});

test('mergeLateWarnings drops a warning naming a spec_id no definite part carries (a candidates part, here)', () => {
    const response = normalizeResponse(fixtures['multi-candidate']);

    const merged = mergeLateWarnings(response, [
        {
            code: 'observations_timed_out',
            severity: 'warn',
            message: 'late',
            spec_id: 'spec_no_such_definite_part',
        },
    ]);

    assert.deepEqual(merged, response);
});

test('mergeLateWarnings dedupes two structurally identical warnings arriving in the same done batch', () => {
    const response = normalizeResponse(fixtures['definite-single']);
    const specId = response.parts[0].spec.spec_id;
    const warning = {
        code: 'observations_timed_out',
        severity: 'warn' as const,
        message: 'observations deadline exceeded',
        spec_id: specId,
    };

    const merged = mergeLateWarnings(response, [warning, { ...warning }]);

    assert.deepEqual(merged.parts[0].warnings, [warning]);
});

test('mergeLateWarnings is a no-op, returning the same response instance, when no warning carries a spec_id', () => {
    const response = normalizeResponse(fixtures['definite-single']);

    const merged = mergeLateWarnings(response, [
        { code: 'run_level_signal', severity: 'info', message: 'no spec_id here' },
    ]);

    assert.equal(merged, response);
});

test('mergeLateWarnings keeps two warnings distinct whose code/message boundary would collide under a space separator', () => {
    const response = normalizeResponse(fixtures['definite-single']);
    const specId = response.parts[0].spec.spec_id;
    // Under a single-space separator both identities would be "a b c <specId>":
    // first_pair = "a" + " " + "b c", second_pair = "a b" + " " + "c". The real
    // separator is `\u0000`, so the two stay distinct.
    const first = { code: 'a', severity: 'info' as const, message: 'b c', spec_id: specId };
    const second = { code: 'a b', severity: 'info' as const, message: 'c', spec_id: specId };

    const merged = mergeLateWarnings(response, [first, second]);

    assert.equal(merged.parts[0].warnings.length, 2);
    assert.deepEqual(merged.parts[0].warnings, [first, second]);
});

const modelledLate = {
    code: 'modelled_values' as const,
    binding_ref: null,
    text: 'Some of these values are modelled estimates.',
};

test('applyDoneEvent folds late warnings into the definite part carrying the spec_id and sets its late departures', () => {
    const response = normalizeResponse(fixtures['definite-single']);
    const specId = response.parts[0].spec.spec_id;
    const warning = {
        code: 'observations_timed_out',
        severity: 'warn' as const,
        message: 'observations deadline exceeded',
        spec_id: specId,
    };

    const merged = applyDoneEvent(response, {
        warnings: [warning],
        late_departures: [{ part_index: 0, spec_id: specId, departures: [modelledLate] }],
    });

    assert.deepEqual(merged.parts[0].departures, [modelledLate]);
    assert.deepEqual(merged.parts[0].warnings, [warning]);
    assert.deepEqual(response.parts[0].departures, []);
});

test('applyDoneEvent replaces the shipped departures with the late list, whole', () => {
    const single = normalizeResponse(fixtures['definite-single']);
    const specId = single.parts[0].spec.spec_id;
    const shipped = {
        code: 'entity_unavailable' as const,
        binding_ref: null,
        text: 'No data for one place.',
    };
    const response = { ...single, parts: [{ ...single.parts[0], departures: [shipped] }] };

    const merged = applyDoneEvent(response, {
        warnings: [],
        late_departures: [{ part_index: 0, spec_id: specId, departures: [modelledLate] }],
    });

    assert.deepEqual(merged.parts[0].departures, [modelledLate]);
    assert.deepEqual(response.parts[0].departures, [shipped]);
});

test('applyDoneEvent gives each part sharing a spec_id its own late list', () => {
    const single = normalizeResponse(fixtures['definite-single']);
    const response = { ...single, parts: [single.parts[0], { ...single.parts[0] }] };
    const specId = single.parts[0].spec.spec_id;
    const unavailable = {
        code: 'entity_unavailable' as const,
        binding_ref: null,
        text: 'No data for one place.',
    };

    const merged = applyDoneEvent(response, {
        warnings: [],
        late_departures: [
            { part_index: 0, spec_id: specId, departures: [modelledLate] },
            { part_index: 1, spec_id: specId, departures: [unavailable] },
        ],
    });

    assert.deepEqual(
        merged.parts.map((part) => part.departures),
        [[modelledLate], [unavailable]],
    );
});

test('applyDoneEvent touches only the part at part_index when parts share a spec_id', () => {
    const single = normalizeResponse(fixtures['definite-single']);
    const response = { ...single, parts: [single.parts[0], { ...single.parts[0] }] };

    const merged = applyDoneEvent(response, {
        warnings: [],
        late_departures: [
            { part_index: 1, spec_id: single.parts[0].spec.spec_id, departures: [modelledLate] },
        ],
    });

    assert.equal(merged.parts[0], response.parts[0]);
    assert.deepEqual(merged.parts[1].departures, [modelledLate]);
});

test('applyDoneEvent returns the same response when no late departure names a definite part', () => {
    const response = normalizeResponse(fixtures['definite-single']);

    assert.equal(applyDoneEvent(response, { warnings: [] }), response);
    assert.equal(
        applyDoneEvent(response, {
            warnings: [],
            late_departures: [
                { part_index: 0, spec_id: 'spec_elsewhere', departures: [modelledLate] },
                {
                    part_index: 5,
                    spec_id: response.parts[0].spec.spec_id,
                    departures: [modelledLate],
                },
            ],
        }),
        response,
    );
});

test('mintDataset returns the artifacts/manifest of a synchronous 200 unchanged', async (t) => {
    t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(
                JSON.stringify({
                    content_version: 'cv_sync',
                    artifacts: [{ url: 'https://x/sync' }],
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
    );

    const { artifacts, manifest } = await mintDataset({ spec_id: 'spec_1', format: 'csv' });

    assert.deepEqual(artifacts, [{ url: 'https://x/sync' }]);
    assert.equal(manifest.content_version, 'cv_sync');
});

test('mintDataset repeats a mint the Datasets API refused as busy and retryable', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        fetchMock.mock.callCount() === 0
            ? new Response(JSON.stringify({ code: 'service_unavailable', retryable: true }), {
                  status: 503,
                  headers: { 'content-type': 'application/problem+json', 'retry-after': '0' },
              })
            : new Response(JSON.stringify({ content_version: 'cv_sync', artifacts: [] }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
              }),
    );

    const { manifest } = await mintDataset({ spec_id: 'spec_1', format: 'csv' });

    assert.equal(manifest.content_version, 'cv_sync');
    assert.equal(fetchMock.mock.callCount(), 2);
});

test("mintDataset polls an over-budget mint's 202 through to the done manifest, reporting progress along the way", async (t) => {
    const responses = [
        new Response(
            JSON.stringify({
                operation: {
                    operation_id: 'op_1',
                    status: 'running',
                    poll: '/api/datasets/operations/op_1',
                    retry_after_ms: 0,
                    progress: { rows_written: 0, estimate_rows: 2_500_000 },
                },
            }),
            { status: 202, headers: { 'content-type': 'application/json' } },
        ),
        new Response(
            JSON.stringify({
                operation: {
                    operation_id: 'op_1',
                    status: 'running',
                    poll: '/api/datasets/operations/op_1',
                    retry_after_ms: 0,
                    progress: { rows_written: 900_000, estimate_rows: 2_500_000 },
                },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ),
        new Response(
            JSON.stringify({
                operation: { operation_id: 'op_1', status: 'done' },
                manifest: { content_version: 'cv_async', artifacts: [{ url: 'https://x/async' }] },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ];

    t.mock.method(globalThis, 'fetch', async () => responses.shift()!);

    const progress: unknown[] = [];
    const { artifacts, manifest } = await mintDataset(
        { spec_id: 'spec_1', format: 'parquet' },
        undefined,
        (p) => progress.push(p),
    );

    assert.deepEqual(artifacts, [{ url: 'https://x/async' }]);
    assert.equal((manifest as { content_version?: string }).content_version, 'cv_async');
    assert.deepEqual(progress, [
        { rows_written: 0, estimate_rows: 2_500_000 },
        { rows_written: 900_000, estimate_rows: 2_500_000 },
    ]);
});

test('mintDataset threads its own signal into the poll it starts for a 202 response', async (t) => {
    const controller = new AbortController();
    const seenSignals: (AbortSignal | undefined)[] = [];
    const responses = [
        new Response(
            JSON.stringify({
                operation: {
                    operation_id: 'op_thread',
                    status: 'running',
                    poll: '/api/datasets/operations/op_thread',
                    retry_after_ms: 0,
                },
            }),
            { status: 202, headers: { 'content-type': 'application/json' } },
        ),
        new Response(
            JSON.stringify({
                operation: { operation_id: 'op_thread', status: 'done' },
                manifest: {
                    content_version: 'cv_thread',
                    artifacts: [{ url: 'https://x/thread' }],
                },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ];

    t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
        seenSignals.push(init?.signal ?? undefined);
        return responses.shift()!;
    });

    const { manifest } = await mintDataset({ spec_id: 'spec_1', format: 'csv' }, controller.signal);

    assert.equal((manifest as { content_version?: string }).content_version, 'cv_thread');
    // Both the mint POST and the poll it started for the 202 carry the same
    // signal — a caller that aborts mid-download stops the poll as well as
    // the initial request.
    assert.deepEqual(seenSignals, [controller.signal, controller.signal]);
});

test('normalizeResponse refuses a body with no kind, an unknown kind, or a resolution with no parts', () => {
    assert.throws(
        () => normalizeResponse({ schema_version: 1, parts: [] }),
        /answered with no kind, which this site does not read/,
    );
    assert.throws(
        () => normalizeResponse({ schema_version: 1, kind: 'clarify', scope: { place: null } }),
        /answered with kind "clarify", which this site does not read/,
    );
    assert.throws(
        () => normalizeResponse({ schema_version: 1, kind: 'resolution' }),
        /a resolution that has no parts/,
    );
});

/** Every event resolveStream emits for a stream of one `response` frame
 *  carrying `body`, then a `done` frame, in one chunk. `before` frames come
 *  first. */
async function streamEvents(body: unknown, before: SearchEvent[] = []): Promise<SearchEvent[]> {
    const realFetch = globalThis.fetch;
    const frames = [
        ...before.map((event) => `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`),
        `event: response\ndata: ${JSON.stringify({ kind: 'response', response: body })}\n\n`,
        `event: done\ndata: ${JSON.stringify({ kind: 'done', warnings: [] })}\n\n`,
    ].join('');
    globalThis.fetch = async () =>
        new Response(frames, { headers: { 'content-type': 'text/event-stream' } });
    try {
        const events: SearchEvent[] = [];
        await resolveStream({}, (event) => events.push(event));
        return events;
    } finally {
        globalThis.fetch = realFetch;
    }
}

test('resolveStream ends on the run error for a response with an unknown kind', async () => {
    const events = await streamEvents({
        schema_version: 1,
        kind: 'clarify',
        scope: { place: null },
    });

    assert.deepEqual(events, [
        {
            kind: 'error',
            detail: 'The search API answered with kind "clarify", which this site does not read.',
            code: 'UNREADABLE_RESPONSE',
        },
    ]);
});

test('resolveStream passes a known kind through as a response', async () => {
    const declined = fixtures['declined-out-of-scope'];
    const events = await streamEvents(declined);

    assert.deepEqual(events, [
        { kind: 'response', response: declined },
        { kind: 'done', warnings: [] },
    ]);
});

// The order the engine streams a partless answer in (`step(extract)`,
// `response`, `done`): useSearchRun appends the shared step, settles the
// answer on `response` and the phase on `done`, with no part to size.
for (const name of ['catalogue-kenya', 'declined-out-of-scope'] as const) {
    test(`resolveStream keeps the shared extract step before a partless ${name} answer`, async () => {
        const body = fixtures[name];
        const step: SearchEvent = {
            kind: 'step',
            variable_index: null,
            step: 'extract',
            ran: true,
            ms: 12,
        };
        const events = await streamEvents(body, [step]);

        assert.deepEqual(events, [
            step,
            { kind: 'response', response: body },
            { kind: 'done', warnings: [] },
        ]);
        assert.notEqual((events[1] as { response: { kind: string } }).response.kind, 'resolution');
    });
}

test('mintDataset posts the spec id and definition and no StatVar list', async (t) => {
    const spec = normalizeResponse(fixtures['definite-single']).parts[0].spec;
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ artifacts: [] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
    );

    await mintDataset({ spec_id: spec.spec_id, definition: spec.definition, format: 'csv' });

    const [, init] = fetchMock.mock.calls[0].arguments as [unknown, RequestInit];
    const sentBody = JSON.parse(String(init.body)) as { input: Record<string, unknown> };

    assert.deepEqual(sentBody.input, {
        kind: 'spec_id',
        spec_id: spec.spec_id,
        definition: spec.definition,
    });
});

const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

test('fetchVersionLink reads a version from its manifest and the latest data from the options door', async (t) => {
    const urls: string[] = [];

    t.mock.method(globalThis, 'fetch', async (url: string) => {
        urls.push(url);

        return jsonResponse(200, {
            definition: { spec_id: 'spec_a1', identity: { identity_version: 'spec1' } },
        });
    });

    const version = await fetchVersionLink({ specId: 'spec_a1', contentVersion: 'cv_b2' });
    const latest = await fetchVersionLink({ specId: 'spec_a1', contentVersion: null });

    assert.deepEqual(urls, ['/api/datasets/spec_a1/cv_b2', '/api/datasets/spec_a1/options']);
    assert.equal(version.kind === 'opened' && version.shared.mode, 'snapshot');
    assert.equal(latest.kind === 'opened' && latest.shared.mode, 'live');
});

for (const [status, kind] of [
    [404, 'gone'],
    [410, 'gone'],
    [500, 'failed'],
] as const) {
    test(`fetchVersionLink answers ${kind} for a ${status}`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () =>
            jsonResponse(status, { code: 'artifact_expired' }),
        );

        assert.deepEqual(await fetchVersionLink({ specId: 'spec_a1', contentVersion: 'cv_b2' }), {
            kind,
        });
    });
}

test('pinDownloadedVersion posts the downloaded version to the site pin route and logs a failure', async (t) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const warn = t.mock.method(console, 'warn', () => {});

    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        throw new Error('offline');
    });

    const req = {
        specId: 'spec_a1',
        contentVersion: 'cv_b2',
        definition: { spec_id: 'spec_a1' },
    };

    assert.equal(pinDownloadedVersion(req), undefined);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls.length, 1);
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(calls[0]!.url, '/api/download-pin');
    assert.equal(calls[0]!.init.method, 'POST');
    assert.equal(calls[0]!.init.keepalive, undefined);
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
        specId: 'spec_a1',
        contentVersion: 'cv_b2',
        definition: { spec_id: 'spec_a1' },
    });
});

test('artifactHref prefixes the Datasets API origin onto a root-relative artifact link', () => {
    const url = '/api/datasets/spec_a1/cv_b2/files/sha256:abc';

    assert.equal(artifactHref(url), url);
    assert.equal(artifactHref(url, 'https://apis.example.org'), `https://apis.example.org${url}`);
});
