import assert from 'node:assert/strict';
import test from 'node:test';

import { withEntityEdit, withResolvedSlotEdit } from '../promote.ts';
import type { BaseIdentity } from '../types.ts';

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
    const edited = withResolvedSlotEdit(
        whereSpec,
        0,
        {
            kind: 'value',
            value: { value_kind: 'entity', ref: { dcid: 'country/KEN', label: 'Kenya' } },
        },
        'destination',
    );

    assert.deepEqual(edited.entities, {
        origin: ['country/FRA'],
        destination: ['country/KEN'],
    });
    assert.equal('observationAbout' in edited.entities, false);
});

test('a non-directional where selection still writes observationAbout', () => {
    const edited = withResolvedSlotEdit(whereSpec, 0, {
        kind: 'value',
        value: { value_kind: 'entity', ref: { dcid: 'country/GHA', label: 'Ghana' } },
    });

    assert.deepEqual(edited.entities, {
        origin: ['country/FRA'],
        observationAbout: ['country/GHA'],
    });
});

test('withEntityEdit keeps the open-origin Add Criteria route on origin', () => {
    const edited = withEntityEdit(identity, 'origin', ['country/USA']);

    assert.deepEqual(edited.entities, { origin: ['country/USA'] });
});

test("a multi-select Apply's set binding writes every dcid to the where slot's role", () => {
    const edited = withResolvedSlotEdit(
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

    assert.deepEqual(edited.entities, {
        origin: ['country/FRA'],
        destination: ['country/KEN', 'country/ETH'],
    });
});

test('an unbound where binding drops the role from the posted identity', () => {
    const edited = withResolvedSlotEdit(
        { ...whereSpec, identity: { ...identity, entities: { destination: ['country/KEN'] } } },
        0,
        { kind: 'unbound' },
        'destination',
    );

    assert.equal('destination' in edited.entities, false);
});

test('withEntityEdit binds a picked dcid, single- or multi-select alike', () => {
    const cases: Array<{
        description: string;
        role: 'origin' | 'destination';
        baseEntities: Record<string, string[]>;
        dcids: string[];
        expectedEntities: Record<string, string[]>;
    }> = [
        {
            description: 'a single picked dcid',
            role: 'origin',
            baseEntities: {},
            dcids: ['country/KEN'],
            expectedEntities: { origin: ['country/KEN'] },
        },
        {
            description: 'a multi-select Apply set in one identity edit',
            role: 'destination',
            baseEntities: { destination: ['country/KEN'] },
            dcids: ['country/KEN', 'country/ETH'],
            expectedEntities: { destination: ['country/KEN', 'country/ETH'] },
        },
    ];

    for (const { description, role, baseEntities, dcids, expectedEntities } of cases) {
        const edited = withEntityEdit({ ...identity, entities: baseEntities }, role, dcids);

        assert.deepEqual(edited.entities, expectedEntities, description);
    }
});

test('an unbind edit -- dcid null or an empty Apply selection -- drops the role', () => {
    const cases = [
        { description: 'dcid null', selection: null },
        { description: 'an empty Apply selection ([])', selection: [] },
    ];

    for (const { description, selection } of cases) {
        const edited = withEntityEdit(identity, 'origin', selection);

        assert.equal('origin' in edited.entities, false, description);
    }
});

test("an edit that changes a grouped role's members drops that role's group and leaves the base identity grouped", () => {
    const eu = { dcid: 'EuropeanUnion', label: 'European Union' };
    const kenya = { dcid: 'country/KEN', label: 'Kenya' };
    const cases = [
        {
            description: 'Any donor clears the role',
            selection: null,
            expectedGroups: { destination: kenya },
        },
        {
            description: 'a single donor replaces the group',
            selection: ['country/DEU'],
            expectedGroups: { destination: kenya },
        },
        {
            description: 'the same members re-applied',
            selection: ['country/FRA', 'country/DEU'],
            expectedGroups: { origin: eu, destination: kenya },
        },
        {
            description: 'the same members in a new order',
            selection: ['country/DEU', 'country/FRA'],
            expectedGroups: { origin: eu, destination: kenya },
        },
        {
            description: 'one member added',
            selection: ['country/FRA', 'country/DEU', 'country/ITA'],
            expectedGroups: { destination: kenya },
        },
        {
            description: 'one member swapped for another',
            selection: ['country/FRA', 'country/ITA'],
            expectedGroups: { destination: kenya },
        },
        {
            description: 'one member removed',
            selection: ['country/FRA'],
            expectedGroups: { destination: kenya },
        },
    ];

    for (const { description, selection, expectedGroups } of cases) {
        const baseIdentity = {
            identity_version: 'spec1' as const,
            shape: {},
            slots: [],
            entities: { origin: ['country/FRA', 'country/DEU'], destination: ['country/KEN'] },
            requested_window: { kind: 'all' as const },
            entity_groups: { origin: eu, destination: kenya },
        };
        const identity = withEntityEdit(baseIdentity, 'origin', selection);

        assert.deepEqual(identity.entity_groups, expectedGroups, description);
        assert.deepEqual(
            baseIdentity.entity_groups,
            { origin: eu, destination: kenya },
            description,
        );
    }
});
