import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDatasetEntries, candidatePickEntry, sharedRefEntry } from '../datasetEntries.ts';
import { withEntityEdit } from '../promote.ts';
import { normalizeResponse, restorePlaceholderParts } from '../searchClient.ts';
import {
    type Assumption,
    type DatasetCandidatesEntry,
    type DatasetIdentityEntry,
    type DatasetParsedEntry,
    type HydratedPart,
    knownPart,
    type Part,
    type Resolution,
    type Spec,
} from '../types.ts';
import { fixtures, type FixtureName } from './fixtures/index.ts';

/** The fixture's normalized parts as a settled run holds them. */
function hydratedParts(name: FixtureName): HydratedPart[] {
    const parts: Part[] = normalizeResponse(fixtures[name]).parts;

    return parts.map((part, index) => {
        const known = knownPart(part);

        return {
            index,
            variableText: part.variable_text ?? null,
            part,
            hydratedSpec: known?.status === 'definite' ? known.spec : null,
            observationsPending: false,
            phase: 'done',
            editError: null,
        };
    });
}

/** The assumptions a known part carries; none for an unknown one. */
const assumptionsOf = (part: HydratedPart): Assumption[] | undefined =>
    knownPart(part.part)?.assumptions;

/** The specs of a candidates part. */
function candidateSpecs(part: HydratedPart): Spec[] {
    const known = knownPart(part.part);

    assert.ok(known?.status === 'candidates');
    return known.candidates.specs;
}

/** A `parsed` entry for `part`: its restatement with `dcid` pinned on the
 *  "Congo" wording, as an entity_ambiguous option posts it. */
function congoPick(part: HydratedPart, dcid: string): DatasetParsedEntry {
    const restatement = part.part?.restatement;

    assert.ok(restatement);

    const entities = (restatement.entities ?? []).map((entity) =>
        entity.text === 'Congo' ? { ...entity, dcid } : entity,
    );

    return { entry_kind: 'parsed', part: { ...restatement, entities } };
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

    const first = knownPart(merged.parts[0]);
    const base = knownPart(parts[0].part);

    assert.equal(merged.parts.length, 2);
    assert.ok(first?.status === 'definite' && base?.status === 'definite');
    assert.equal(first.spec.spec_id, base.spec.spec_id);
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

test("buildDatasetEntries posts a parsed entry's part unchanged, its own operations kept", () => {
    const parts = hydratedParts('definite-rank-operation');
    const picked: DatasetParsedEntry = {
        entry_kind: 'parsed',
        part: { variable_text: 'aid', operations: [] },
    };
    const [entry] = buildDatasetEntries(parts, { index: 0, entry: picked });

    assert.ok(parts[0].part?.operations?.length);
    assert.equal(entry, picked);
});

test("buildDatasetEntries echoes a part's assumptions on its identity entry, an edit's included", () => {
    const parts = hydratedParts('broad-truncated');
    const assumptions = assumptionsOf(parts[0]);
    const [own] = buildDatasetEntries(parts) as DatasetIdentityEntry[];
    const override: DatasetIdentityEntry = { ...own, assumptions: undefined };
    const [edited] = buildDatasetEntries(parts, { index: 0, entry: override });

    assert.ok(assumptions?.length);
    assert.deepEqual(own.assumptions, assumptions);
    assert.deepEqual((edited as DatasetIdentityEntry).assumptions, assumptions);
});

test("an edit that carries its own echo keeps it over the part's list", () => {
    const parts = hydratedParts('broad-truncated');
    const [own] = buildDatasetEntries(parts) as DatasetIdentityEntry[];
    const [replayed] = buildDatasetEntries(parts, {
        index: 0,
        entry: { ...own, assumptions: [] },
    }) as DatasetIdentityEntry[];

    assert.ok(assumptionsOf(parts[0])?.length);
    assert.deepEqual(replayed.assumptions, []);
});

test('buildDatasetEntries echoes an empty assumptions list, which states none', () => {
    const [part] = hydratedParts('definite-single');
    const stated: HydratedPart = { ...part, part: { ...part.part!, assumptions: [] } };
    const [entry] = buildDatasetEntries([stated]) as DatasetIdentityEntry[];

    assert.deepEqual(entry.assumptions, []);
});

test('an identity edit of a no_data part posts no echo, so the edit reads fresh', () => {
    const [own] = buildDatasetEntries(hydratedParts('definite-single')) as DatasetIdentityEntry[];
    const [refused] = hydratedParts('entity-ambiguous');
    const stated: HydratedPart = { ...refused, part: { ...refused.part!, assumptions: [] } };
    const override: DatasetIdentityEntry = { ...own, assumptions: undefined };
    const [entry] = buildDatasetEntries([stated], { index: 0, entry: override });

    assert.equal(stated.part?.status, 'no_data');
    assert.equal((entry as DatasetIdentityEntry).assumptions, undefined);
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

const everyPlace: Assumption = {
    kind: 'place_scope',
    binding_ref: 'where:',
    refs: [],
    text: 'every place',
};
const everyProvider: Assumption = {
    kind: 'open_role',
    binding_ref: 'origin:',
    refs: [],
    text: 'every provider',
};

/** The multi-candidate part with `reading_assumptions` as given. The first
 *  reading reads an open role the second lacks, so the part's own list holds
 *  only the place scope both share. */
function candidatesWithReadings(
    readings: (specIds: string[]) => Record<string, Assumption[]> | undefined,
): HydratedPart {
    const [part] = hydratedParts('multi-candidate');
    const specIds = candidateSpecs(part).map((spec) => spec.spec_id);

    return {
        ...part,
        part: {
            ...part.part!,
            assumptions: [everyPlace],
            reading_assumptions: readings(specIds),
        },
    };
}

const twoReadings = ([first, second]: string[]) => ({
    [first]: [everyProvider, everyPlace],
    [second]: [everyPlace],
});

test("a pick echoes the picked reading's own assumptions, not the readings' shared list", () => {
    const part = candidatesWithReadings(twoReadings);
    const [first, second] = candidateSpecs(part);

    for (const [spec, expected] of [
        [first, [everyProvider, everyPlace]],
        [second, [everyPlace]],
    ] as const) {
        const entry = candidatePickEntry(part, spec);
        const [posted] = buildDatasetEntries([part], { index: 0, entry });

        assert.equal(posted.entry_kind, 'identity');
        assert.deepEqual((posted as DatasetIdentityEntry).identity, spec.identity);
        assert.deepEqual((posted as DatasetIdentityEntry).assumptions, expected);
    }
});

test("a candidates entry echoes each reading's own assumptions on its candidate", () => {
    const [entry] = buildDatasetEntries([candidatesWithReadings(twoReadings)]);

    assert.equal(entry.entry_kind, 'candidates');
    assert.deepEqual(
        (entry as DatasetCandidatesEntry).candidates.map((candidate) => candidate.assumptions),
        [[everyProvider, everyPlace], [everyPlace]],
    );
});

test('a reading the response gives no list for posts no echo, on a pick or a candidate', () => {
    for (const part of [
        candidatesWithReadings(() => undefined),
        candidatesWithReadings(([first]) => ({ [first]: [] })),
    ]) {
        const specs = candidateSpecs(part);
        const pick = candidatePickEntry(part, specs[1]);
        const [posted] = buildDatasetEntries([part], { index: 0, entry: pick });
        const [entry] = buildDatasetEntries([part]) as DatasetCandidatesEntry[];

        assert.equal('assumptions' in posted, false);
        assert.equal('assumptions' in entry.candidates[1], false);
    }

    const stated = candidatesWithReadings(([first]) => ({ [first]: [] }));
    const [entry] = buildDatasetEntries([stated]) as DatasetCandidatesEntry[];

    assert.deepEqual(entry.candidates[0].assumptions, []);
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
    const candidatesPart = knownPart(candidates.part);

    assert.ok(candidatesPart?.status === 'candidates');

    const [first, ...others] = candidatesPart.candidates.specs;
    const parts: HydratedPart[] = [
        { ...definite, hydratedSpec: { ...definite.hydratedSpec!, entity_groups: eu } },
        {
            ...candidates,
            index: 1,
            part: {
                ...candidatesPart,
                candidates: {
                    ...candidatesPart.candidates,
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
    assert.deepEqual(rewritten.identity.entities?.origin, ['country/DEU']);
    assert.deepEqual(rewritten.entity_groups, eu);
});

test('a stored share part replays its groups beside the identity, and no member when it has none', () => {
    const identity = hydratedParts('definite-single')[0].hydratedSpec!.identity;
    const groups = {
        origin: { ref: 'africa', label: 'Africa', entity_type: 'Continent' },
    };
    const ref = {
        variableText: 'aid',
        identity,
        entityGroups: groups,
        operations: [],
        assumptions: null,
    };

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

test('a stored share part echoes its assumptions, [] included, and a share stored before them posts none', () => {
    const [part] = hydratedParts('broad-truncated');
    const identity = part.hydratedSpec!.identity;
    const assumptions = assumptionsOf(part)!;
    const ref = { variableText: 'aid', identity, entityGroups: null, operations: [] };

    assert.ok(assumptions.length);
    assert.deepEqual(sharedRefEntry({ ...ref, assumptions }).assumptions, assumptions);
    assert.deepEqual(sharedRefEntry({ ...ref, assumptions: [] }).assumptions, []);
    assert.equal('assumptions' in sharedRefEntry({ ...ref, assumptions: null }), false);
});
