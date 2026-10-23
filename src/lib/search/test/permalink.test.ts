import assert from 'node:assert/strict';
import test from 'node:test';

import { decodePermalinkState, encodePermalinkState, encodeSearchState } from '../permalink.ts';
import type { PermalinkEdit, PermalinkState } from '../permalink.ts';
import type { Assumption } from '../types.ts';

const declaredDefault: Assumption = {
    kind: 'declared_default',
    binding_ref: 'how:typeofflow',
    refs: ['TypeOfFlow_ODA'],
    text: 'official development assistance',
};

const openProviders: Assumption = {
    kind: 'open_role',
    binding_ref: 'origin:',
    refs: [],
    text: 'every provider',
};

const identityEdit: PermalinkEdit = {
    part: 0,
    variableText: 'ODA disbursements',
    entry: {
        entry_kind: 'identity',
        variable_text: 'ODA disbursements',
        identity: {
            identity_version: 'spec1',
            shape: { kind: 'statvar_schema' },
            slots: [],
            entities: { origin: ['country/FRA'] },
            requested_window: { kind: 'all' },
        },
        entity_groups: { origin: { ref: null, label: 'G7 countries' } },
    },
};

const parsedEdit: PermalinkEdit = {
    part: 0,
    variableText: 'donor spending',
    entry: {
        entry_kind: 'parsed',
        part: {
            variable_text: 'donor spending',
            entities: [{ text: 'France', role_text: 'donor' }],
        },
    },
};

// A multi-select Apply's own identity edit: several dcids for one role.
const multiEntityEdit: PermalinkEdit = {
    part: 0,
    variableText: 'ODA to recipients',
    entry: {
        entry_kind: 'identity',
        variable_text: 'ODA to recipients',
        identity: {
            identity_version: 'spec1',
            shape: { kind: 'statvar_schema' },
            slots: [],
            entities: { origin: ['country/FRA'], destination: ['country/KEN', 'country/ETH'] },
            requested_window: { kind: 'all' },
        },
    },
};

test('a PermalinkState round-trips through encode/decode -- a multi-dcid identity edit, a parsed-only edit, and an old identity-only ?s= payload alike', async () => {
    const cases = [
        {
            description: 'a multi-dcid identity edit (a multi-select Apply)',
            query: 'ODA to recipients',
            edit: multiEntityEdit,
        },
        { description: 'a parsed-only edit', query: 'donor spending', edit: parsedEdit },
        {
            description: "a reloaded pick's assumptions echo",
            query: 'ODA disbursements',
            edit: {
                ...identityEdit,
                entry: { ...identityEdit.entry, assumptions: [declaredDefault, openProviders] },
            } as PermalinkEdit,
        },
        {
            description: 'an empty assumptions echo, which states no default',
            query: 'ODA disbursements',
            edit: {
                ...identityEdit,
                entry: { ...identityEdit.entry, assumptions: [] },
            } as PermalinkEdit,
        },
        {
            description: 'an old identity-only ?s= payload',
            query: 'ODA disbursements',
            edit: identityEdit,
        },
    ];

    for (const { description, query, edit } of cases) {
        const state: PermalinkState = { query, edits: [edit] };
        const encoded = await encodePermalinkState(state);
        const decoded = await decodePermalinkState(encoded);

        assert.deepEqual(decoded, state, description);
    }
});

test('an unknown entry_kind is dropped, not decoded', async () => {
    // Deliberately malformed for this one case (an entry_kind this decoder
    // doesn't know how to replay): built through the untyped
    // `encodeSearchState` rather than `encodePermalinkState`/`PermalinkState`.
    const rawState = {
        query: 'donor spending',
        edits: [
            identityEdit,
            {
                part: 1,
                variableText: 'recipient spending',
                entry: { entry_kind: 'candidates', variable_text: 'recipient spending' },
            },
        ],
    };
    const encoded = await encodeSearchState(rawState);
    const decoded = await decodePermalinkState(encoded);

    assert.deepEqual(decoded, { query: rawState.query, edits: [identityEdit] });
});

test('an identity edit stored with its base and StatVars decodes to the identity alone', async () => {
    const stored = {
        query: 'ODA disbursements',
        edits: [
            {
                ...identityEdit,
                entry: {
                    ...identityEdit.entry,
                    base_spec_id: 'spec_0f1e',
                    base_identity: { identity_version: 'spec1' },
                    removed: { entities: ['destination'] },
                    resolved_stat_var_dcids: ['Count_Person'],
                },
            },
        ],
    };
    const decoded = await decodePermalinkState(await encodeSearchState(stored));

    assert.deepEqual(decoded, { query: stored.query, edits: [identityEdit] });
});

test('an assumptions echo Search would refuse is dropped and the edit still replays', async () => {
    const tooMany = Array.from({ length: 68 }, () => declaredDefault);
    const refused = [
        { description: 'an unknown kind', echo: [{ ...declaredDefault, kind: 'guess' }] },
        { description: 'a missing text', echo: [{ ...declaredDefault, text: '' }] },
        { description: 'an extra member', echo: [{ ...declaredDefault, extra: 1 }] },
        { description: 'a list past the cap', echo: tooMany },
        { description: 'a list that is not an array', echo: declaredDefault },
        { description: 'a null echo', echo: null },
    ];

    for (const { description, echo } of refused) {
        const stored = {
            query: 'ODA disbursements',
            edits: [{ ...identityEdit, entry: { ...identityEdit.entry, assumptions: echo } }],
        };
        const decoded = await decodePermalinkState(await encodeSearchState(stored));

        assert.deepEqual(decoded, { query: stored.query, edits: [identityEdit] }, description);
    }
});
