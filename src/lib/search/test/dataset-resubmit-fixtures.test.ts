/* eslint-disable @typescript-eslint/no-explicit-any -- these tests walk the raw wire envelope shape, pre-flatten (see fixtures.test.ts's own disable) */
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeResponse } from '../searchClient.ts';
import { statVarsUnreadable } from '../view.ts';
import { noDataResponse, wireSpec } from './fixtures/no-data.ts';

/**
 * Coverage for the contract-mirror additions the fixtures above exercise: a
 * `no_data` outcome's `flagged_match`/`alternate_match` Specs. Not part of
 * fixtures.test.ts's own generic loop, since a bare no_data response carries
 * no spec of its own to satisfy that loop's invariants.
 */

test('a role_incompatible no_data normalizes with a readable flagged_match spec and no gate', () => {
    const response = noDataResponse('role_incompatible', null, {
        flagged_match: wireSpec('spec_flagged'),
    });
    const part = (normalizeResponse(response) as any).parts[0];

    assert.equal(part.status, 'no_data');
    assert.equal(part.no_data.gate, null);
    assert.equal(statVarsUnreadable(part.no_data.flagged_match), false);
    assert.equal(part.restatement, null);
});

test('an only_alternate_has_data no_data flattens alternate_match the way flagged_match flattens', () => {
    const response = noDataResponse('no_matching_slice', 'only_alternate_has_data', {
        alternate_match: wireSpec('spec_alternate'),
    });
    const part = (normalizeResponse(response) as any).parts[0];

    assert.equal(part.no_data.gate, 'only_alternate_has_data');
    assert.equal(part.no_data.alternate_match.spec_id, 'spec_alternate');
    // Flattened: stat_vars rides at the top level, not nested under .resolved.
    assert.ok(part.no_data.alternate_match.stat_vars);
    assert.equal(part.no_data.alternate_match.resolved, undefined);
});
