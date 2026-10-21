import assert from 'node:assert/strict';
import test from 'node:test';

import { type SlotSharedEdit, sharedEditTouched, withSharedEdit } from '../sharedEdit.ts';
import type { HydratedPart, PartSpec, Spec } from '../types.ts';
import { definite, readable, resolution } from './fixtures/resolution.ts';
import { fixtures } from './fixtures/index.ts';

/** The definite-single part, settled, holding `spec` in place of its own. */
function partHolding(spec: (read: Spec) => PartSpec): HydratedPart {
    const part = definite(resolution(fixtures['definite-single']).parts[0]);
    const held = spec(readable(part.spec));

    return {
        index: 0,
        variableText: part.variable_text ?? null,
        part: { ...part, spec: held },
        hydratedSpec: held,
        observationsPending: false,
        phase: 'done',
        editError: null,
    };
}

const toGhana: SlotSharedEdit = {
    axis: 'where',
    binding: {
        kind: 'value',
        value: { value_kind: 'entity', ref: { ref: 'country/GHA', label: 'Ghana' } },
    },
    entityRole: 'observationAbout',
};

// A spec flagged unreadable still takes the edit when it carries the slots and identity the edit
// reads; one carrying neither has nothing to edit.
for (const [name, spec, touched] of [
    ['a readable spec', (read: Spec): PartSpec => read, true],
    [
        'an unreadable spec with its slots',
        (read: Spec): PartSpec => ({ ...read, stat_vars_unreadable: true }),
        true,
    ],
    [
        'an unreadable spec without its slots',
        (read: Spec): PartSpec => ({
            spec_id: read.spec_id,
            definition: read.definition,
            stat_vars_unreadable: true,
        }),
        false,
    ],
] as const) {
    test(`a shared where edit ${touched ? 'rewrites' : 'skips'} ${name}`, () => {
        const part = partHolding(spec);

        assert.deepEqual(sharedEditTouched([part], toGhana, {}), touched ? [0] : []);

        if (touched) {
            const { identity } = readable(
                definite(resolution(fixtures['definite-single']).parts[0]).spec,
            );

            assert.ok(identity && part.hydratedSpec);
            assert.deepEqual(withSharedEdit(identity, part.hydratedSpec, toGhana).entities, {
                observationAbout: ['country/GHA'],
            });
        }
    });
}
