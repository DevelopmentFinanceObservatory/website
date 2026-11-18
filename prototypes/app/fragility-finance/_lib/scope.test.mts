import assert from 'node:assert/strict';
import test from 'node:test';

import { context, PROFILES } from './fixture.mts';
import {
    comparisonGroup,
    groupContexts,
    groupLabel,
    matchContexts,
    scopeContexts,
    scopeGroup,
    toggleContext,
} from './scope.ts';

test('groups split the 62 into 20 extreme and 42 high', () => {
    assert.deepEqual(
        (['all', 'extreme', 'high'] as const).map((key) => groupLabel(PROFILES, key)),
        ['All 62', 'Extreme 20', 'High 42'],
    );
    assert.ok(groupContexts(PROFILES, 'high').every((c) => c.tier === 'high'));
});

test('a context scope covers the context and compares with its tier', () => {
    const contexts = [context(), context({ iso3: 'BBB', tier: 'high' })];

    assert.deepEqual(
        scopeContexts(contexts, { kind: 'context', iso3: 'BBB' }).map((c) => c.iso3),
        ['BBB'],
    );
    assert.deepEqual(scopeContexts(contexts, { kind: 'context', iso3: 'ZZZ' }), []);
    assert.equal(comparisonGroup(contexts[1]!), 'high');
    assert.equal(scopeGroup(contexts, { kind: 'context', iso3: 'AAA' }), 'extreme');
    assert.equal(scopeGroup(contexts, { kind: 'group', key: 'all' }), 'all');
});

test('toggleContext selects a context and a second click returns to the group', () => {
    const picked = toggleContext({ kind: 'group', key: 'high' }, 'MOZ', 'high');

    assert.deepEqual(picked, { kind: 'context', iso3: 'MOZ' });
    assert.deepEqual(toggleContext(picked, 'MOZ', 'high'), { kind: 'group', key: 'high' });
    assert.deepEqual(toggleContext(picked, 'SSD', 'high'), { kind: 'context', iso3: 'SSD' });
});

test('matchContexts lists extreme before high and folds accents', () => {
    const contexts = [
        context({ iso3: 'CIV', name: "Côte d'Ivoire", tier: 'high' }),
        context({ iso3: 'CAF', name: 'Central African Republic', tier: 'extreme' }),
        context({ iso3: 'COM', name: 'Comoros', tier: 'high' }),
    ];

    assert.deepEqual(
        matchContexts(contexts, '').map((c) => c.iso3),
        ['CAF', 'COM', 'CIV'],
    );
    assert.deepEqual(
        matchContexts(contexts, 'cote').map((c) => c.iso3),
        ['CIV'],
    );
    assert.deepEqual(
        matchContexts(contexts, 'ivoire').map((c) => c.iso3),
        ['CIV'],
    );
});
