import assert from 'node:assert/strict';
import test from 'node:test';

import { awaitingEntityOptions, awaitingSlotOptions, entityEditForPick } from '../menuState.ts';
import type { EntityOptionsEntry, SlotOptionsEntry } from '../view.ts';

const emptyOptionsEntry: SlotOptionsEntry = { options: [], truncated: false };

test('awaitingSlotOptions is true only when the frame is missing and the base stream is still open', () => {
    const bySpec: Record<string, Record<string, SlotOptionsEntry>> = {
        'spec-1': { 'how:crsPurpose': emptyOptionsEntry },
    };

    // No entry at all for this key yet, stream still open: waiting.
    assert.equal(awaitingSlotOptions(bySpec, 'spec-1', 'what:measure', true), true);
    // Same missing entry, stream closed: nothing more is coming.
    assert.equal(awaitingSlotOptions(bySpec, 'spec-1', 'what:measure', false), false);
    // A confirmed-empty entry already arrived: never "awaiting", even mid-stream.
    assert.equal(awaitingSlotOptions(bySpec, 'spec-1', 'how:crsPurpose', true), false);
});

test('awaitingEntityOptions distinguishes "not arrived" from "arrived empty"', () => {
    const arrivedEmpty: EntityOptionsEntry = { role: 'origin', options: [], truncated: false };

    assert.equal(awaitingEntityOptions(undefined, true), true);
    assert.equal(awaitingEntityOptions(undefined, false), false);
    assert.equal(awaitingEntityOptions(arrivedEmpty, true), false);
});

test('entityEditForPick binds a picked dcid with no removed accounting, single- or multi-select alike', () => {
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
        const fromSpec = {
            identity: {
                identity_version: 'spec1' as const,
                shape: {},
                slots: [],
                entities: baseEntities,
                requested_window: { kind: 'all' as const },
            },
            stat_vars: { items: [] },
        };

        const { identity, extra } = entityEditForPick(fromSpec, role, dcids);

        assert.deepEqual(identity.entities, expectedEntities, description);
        assert.equal('removed' in extra, false, description);
    }
});

test('an unbind edit -- dcid null or an empty Apply selection -- carries removed: {entities: [role]} for a base-bound role', () => {
    const cases = [
        { description: 'dcid null', selection: null },
        { description: 'an empty Apply selection ([])', selection: [] },
    ];

    for (const { description, selection } of cases) {
        const fromSpec = {
            identity: {
                identity_version: 'spec1' as const,
                shape: {},
                slots: [],
                entities: { origin: ['country/FRA'] },
                requested_window: { kind: 'all' as const },
            },
            stat_vars: { items: [] },
        };

        const { identity, extra } = entityEditForPick(fromSpec, 'origin', selection);

        assert.equal('origin' in identity.entities, false, description);
        assert.deepEqual(extra.removed, { entities: ['origin'] }, description);
    }
});

test('unbinding a role the base never had carries no removed accounting', () => {
    const fromSpec = {
        identity: {
            identity_version: 'spec1' as const,
            shape: {},
            slots: [],
            entities: {},
            requested_window: { kind: 'all' as const },
        },
        stat_vars: { items: [] },
    };

    const { extra } = entityEditForPick(fromSpec, 'destination', null);

    assert.equal('removed' in extra, false);
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
        const fromSpec = { identity: baseIdentity, stat_vars: { items: [] } };

        const { identity } = entityEditForPick(fromSpec, 'origin', selection);

        assert.deepEqual(identity.entity_groups, expectedGroups, description);
        assert.deepEqual(
            baseIdentity.entity_groups,
            { origin: eu, destination: kenya },
            description,
        );
    }
});
