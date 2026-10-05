import assert from 'node:assert/strict';
import test from 'node:test';

import { promoteFromSpec, withEntityEdit, withResolvedSlotEdit } from '../promote.ts';
import type { BaseIdentity, Spec } from '../types.ts';

const identity: BaseIdentity = {
    identity_version: 'spec1',
    shape: {},
    slots: [],
    entities: { origin: ['country/FRA'] },
    requested_window: { kind: 'all' },
};

const whereSpec = {
    identity,
    slots: [
        {
            key: { axis: 'where' as const, property: null, label: 'recipient' },
            binding: { kind: 'unbound' as const },
        },
    ],
};

test('an open destination selection writes identity.entities.destination for resubmit', () => {
    const edit = withResolvedSlotEdit(
        whereSpec,
        0,
        {
            kind: 'value',
            value: { value_kind: 'entity', ref: { dcid: 'country/KEN', label: 'Kenya' } },
        },
        'destination',
    );

    assert.deepEqual(edit.identity.entities, {
        origin: ['country/FRA'],
        destination: ['country/KEN'],
    });
    assert.equal('observationAbout' in edit.identity.entities, false);
});

test('a non-directional where selection still writes observationAbout', () => {
    const edit = withResolvedSlotEdit(whereSpec, 0, {
        kind: 'value',
        value: { value_kind: 'entity', ref: { dcid: 'country/GHA', label: 'Ghana' } },
    });

    assert.deepEqual(edit.identity.entities, {
        origin: ['country/FRA'],
        observationAbout: ['country/GHA'],
    });
});

test('withEntityEdit keeps the open-origin Add Criteria route on origin', () => {
    const edit = withEntityEdit(identity, 'origin', ['country/USA']);

    assert.deepEqual(edit.identity.entities, { origin: ['country/USA'] });
});

test("a multi-select Apply's set binding writes every dcid to the where slot's role", () => {
    const edit = withResolvedSlotEdit(
        whereSpec,
        0,
        {
            kind: 'set',
            values: [
                { value_kind: 'entity', ref: { dcid: 'country/KEN', label: 'Kenya' } },
                { value_kind: 'entity', ref: { dcid: 'country/ETH', label: 'Ethiopia' } },
            ],
        },
        'destination',
    );

    assert.deepEqual(edit.identity.entities, {
        origin: ['country/FRA'],
        destination: ['country/KEN', 'country/ETH'],
    });
});

test('an unbound where binding drops a base-bound role, acknowledged in removed.entities', () => {
    const edit = withResolvedSlotEdit(
        { ...whereSpec, identity: { ...identity, entities: { destination: ['country/KEN'] } } },
        0,
        { kind: 'unbound' },
        'destination',
    );

    assert.equal('destination' in edit.identity.entities, false);
    assert.deepEqual(edit.removed, { entities: ['destination'] });
});

test('unbinding a role that was never bound in the base identity reports no removed entry', () => {
    const edit = withResolvedSlotEdit(
        { ...whereSpec, identity: { ...identity, entities: {} } },
        0,
        { kind: 'unbound' },
        'destination',
    );

    assert.equal('destination' in edit.identity.entities, false);
    assert.equal(edit.removed, undefined);
});

test('promoteFromSpec seeds resolved_stat_var_dcids from stat_vars.items, not the trace', () => {
    const spec = {
        stat_vars: {
            items: [
                { ref: 'sdg/FP_CPI_TOTL_ZG', slot_values: [] },
                { ref: 'sdg/FP_CPI_TOTL', slot_values: [] },
            ],
            member_count: 2,
            member_count_exact: true,
            truncated: false,
        },
        resolution: { resolved_stat_vars: [{ dcid: 'Count_Person', label: 'Population' }] },
    } as unknown as Spec;

    assert.deepEqual(promoteFromSpec(spec), {
        resolved_stat_var_dcids: ['sdg/FP_CPI_TOTL_ZG', 'sdg/FP_CPI_TOTL'],
    });
    assert.deepEqual(promoteFromSpec({ ...spec, stat_vars: undefined } as unknown as Spec), {});
});
