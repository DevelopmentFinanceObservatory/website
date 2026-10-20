import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDatasetEntries, sharedRefEntry } from '../datasetEntries.ts';
import { buildAmbiguousPickPart } from '../parsedEdit.ts';
import { withEntityEdit } from '../promote.ts';
import { normalizeResponse, restorePlaceholderParts } from '../searchClient.ts';
import type {
    DatasetIdentityEntry,
    DatasetParsedEntry,
    HydratedPart,
    Part,
    Resolution,
} from '../types.ts';
import { fixtures, type FixtureName } from './fixtures/index.ts';

/** The fixture's normalized parts as a settled run holds them. */
function hydratedParts(name: FixtureName): HydratedPart[] {
    const parts: Part[] = normalizeResponse(fixtures[name]).parts;

    return parts.map((part, index) => ({
        index,
        variableText: part.variable_text ?? null,
        part,
        hydratedSpec: part.status === 'definite' ? (part.spec ?? null) : null,
        observationsPending: false,
        phase: 'done',
        editError: null,
    }));
}

/** The `parsed` entry an entity_ambiguous pick posts for `part`: its
 *  restatement with `dcid` pinned on the "Congo" wording. */
function congoPick(part: HydratedPart, dcid: string): DatasetParsedEntry {
    const restatement = part.part?.restatement;
    const candidate = part.part?.no_data?.ambiguous_entities
        ?.find((group) => group.text === 'Congo')
        ?.candidates.find((option) => option.ref === dcid);

    assert.ok(restatement && candidate);

    const picked = buildAmbiguousPickPart(restatement, 'Congo', candidate);

    assert.ok(picked);
    return { entry_kind: 'parsed', part: picked };
}

test('buildDatasetEntries posts the pick as the parsed entry at its part', () => {
    const parts = hydratedParts('entity-ambiguous');
    const entry = congoPick(parts[0], 'country/COD');

    assert.deepEqual(buildDatasetEntries(parts, { index: 0, entry }), [entry]);
});

test('a pick on part 1 of two posts the parsed entry there and keeps part 0 as its own entry', () => {
    const parts = hydratedParts('two-part-ambiguous');
    const entry = congoPick(parts[1], 'country/COD');
    const entries = buildDatasetEntries(parts, { index: 1, entry });

    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0], buildDatasetEntries(parts)[0]);
    assert.equal(entries[0].entry_kind, 'identity');
    assert.deepEqual(entries[1], entry);
});

test("the pick's answer lands at part 1 and part 0 keeps its dataset", () => {
    const parts = hydratedParts('two-part-ambiguous');
    const [pick] = normalizeResponse(fixtures['definite-rank-operation']).parts;
    const answer: Resolution = normalizeResponse(fixtures['two-part-ambiguous']);
    // The door's answer: part 0 re-resolved from its identity entry, part 1
    // resolved from the pinned parsed entry.
    const posted: Resolution = { ...answer, parts: [answer.parts[0], pick] };

    const merged = restorePlaceholderParts(
        posted,
        parts.map((part) => part.part),
        2,
    );

    assert.equal(merged.parts.length, 2);
    assert.equal(merged.parts[0].spec?.spec_id, parts[0].part?.spec?.spec_id);
    assert.equal(merged.parts[1], pick);
    assert.equal(merged.status, 'definite');
});

test("buildDatasetEntries carries a part's operations on its own entry", () => {
    const parts = hydratedParts('definite-rank-operation');
    const [entry] = buildDatasetEntries(parts);

    assert.equal(entry.entry_kind, 'identity');
    assert.deepEqual((entry as DatasetIdentityEntry).operations, [
        { verb: 'rank', phrase: 'top 5 donors', over: 'origin' },
    ]);
});

test("buildDatasetEntries carries a part's operations on an edit's override entry", () => {
    const parts = hydratedParts('definite-rank-operation');
    const [base] = buildDatasetEntries(parts) as DatasetIdentityEntry[];
    const override: DatasetIdentityEntry = { ...base, operations: undefined };
    const [entry] = buildDatasetEntries(parts, { index: 0, entry: override });

    assert.deepEqual((entry as DatasetIdentityEntry).operations, parts[0].part?.operations);
});

test("buildDatasetEntries echoes a part's assumptions on its identity entry, an edit's included", () => {
    const parts = hydratedParts('broad-truncated');
    const assumptions = parts[0].part?.assumptions;
    const [own] = buildDatasetEntries(parts) as DatasetIdentityEntry[];
    const override: DatasetIdentityEntry = { ...own, assumptions: undefined };
    const [edited] = buildDatasetEntries(parts, { index: 0, entry: override });

    assert.ok(assumptions?.length);
    assert.deepEqual(own.assumptions, assumptions);
    assert.deepEqual((edited as DatasetIdentityEntry).assumptions, assumptions);
});

test('buildDatasetEntries echoes an empty assumptions list, which states none', () => {
    const [part] = hydratedParts('definite-single');
    const stated: HydratedPart = { ...part, part: { ...part.part!, assumptions: [] } };
    const [entry] = buildDatasetEntries([stated]) as DatasetIdentityEntry[];

    assert.deepEqual(entry.assumptions, []);
});

test('buildDatasetEntries leaves assumptions off a response without them and off every other entry kind', () => {
    const [definite] = buildDatasetEntries(hydratedParts('definite-single'));
    const [candidates] = hydratedParts('multi-candidate');
    const assumed: HydratedPart = {
        ...candidates,
        part: {
            ...candidates.part!,
            assumptions: [
                { kind: 'place_scope', binding_ref: 'where:', refs: [], text: 'every place' },
            ],
        },
    };

    assert.equal('assumptions' in definite, false);
    assert.equal('assumptions' in buildDatasetEntries([assumed])[0], false);
});

test('buildDatasetEntries leaves operations off a part that has none', () => {
    const [entry] = buildDatasetEntries(hydratedParts('definite-single'));

    assert.equal('operations' in entry, false);
});

test("an identity entry and each candidate post their own Spec's groups beside the identity", () => {
    const eu = {
        origin: { ref: 'africa', label: 'Africa', entity_type: 'Continent' },
    };
    const g7 = { origin: { ref: null, label: 'G7 countries' } };
    const [definite] = hydratedParts('definite-single');
    const [candidates] = hydratedParts('multi-candidate');
    const [first, ...others] = candidates.part!.candidates!.specs;
    const parts: HydratedPart[] = [
        { ...definite, hydratedSpec: { ...definite.hydratedSpec!, entity_groups: eu } },
        {
            ...candidates,
            index: 1,
            part: {
                ...candidates.part!,
                candidates: {
                    ...candidates.part!.candidates!,
                    specs: [{ ...first, entity_groups: g7 }, ...others],
                },
            },
        },
    ];
    const [identityEntry, candidatesEntry] = buildDatasetEntries(parts);

    assert.ok(
        identityEntry.entry_kind === 'identity' && candidatesEntry.entry_kind === 'candidates',
    );
    assert.deepEqual(identityEntry.entity_groups, eu);
    assert.equal('entity_groups' in identityEntry.identity, false);
    assert.deepEqual(candidatesEntry.candidates[0], {
        identity: first.identity,
        entity_groups: g7,
    });
    assert.deepEqual(candidatesEntry.candidates[1], { identity: others[0].identity });

    // A fan-out edit rewrites the identity and leaves the entry's groups as posted.
    const [rewritten] = buildDatasetEntries(parts, {
        rewriteIdentity: (identity) => withEntityEdit(identity, 'origin', ['country/DEU']),
    });

    assert.ok(rewritten.entry_kind === 'identity');
    assert.deepEqual(rewritten.identity.entities.origin, ['country/DEU']);
    assert.deepEqual(rewritten.entity_groups, eu);
});

test('a stored share part replays its groups beside the identity, and no member when it has none', () => {
    const identity = hydratedParts('definite-single')[0].hydratedSpec!.identity;
    const groups = {
        origin: { ref: 'africa', label: 'Africa', entity_type: 'Continent' },
    };
    const ref = { variableText: 'aid', identity, entityGroups: groups, operations: [] };

    assert.deepEqual(sharedRefEntry(ref), {
        entry_kind: 'identity',
        variable_text: 'aid',
        identity,
        entity_groups: groups,
    });
    assert.deepEqual(sharedRefEntry({ ...ref, variableText: null, entityGroups: null }), {
        entry_kind: 'identity',
        variable_text: '',
        identity,
    });

    const [operation] = hydratedParts('definite-rank-operation')[0].part!.operations!;

    assert.deepEqual(sharedRefEntry({ ...ref, operations: [operation] }), {
        entry_kind: 'identity',
        variable_text: 'aid',
        identity,
        entity_groups: groups,
        operations: [operation],
    });
});
