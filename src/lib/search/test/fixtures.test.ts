/* eslint-disable @typescript-eslint/no-explicit-any -- these tests walk the raw wire envelope shape, pre-flatten (see searchClient.ts's own WireSpec) */
import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenSpec, normalizeResponse, unflattenSpec } from '../searchClient.ts';
import { primaryStatVarLabel, statVarsUnreadable } from '../view.ts';
import { fixtureNames, fixtures, specFixtureNames } from './fixtures/index.ts';

/**
 * Fixture-set invariant tests: real captured `/api/search/resolve`
 * responses (see fixtures/index.ts), run through the site's own
 * `normalizeResponse`/`flattenSpec`, checked against the invariants the
 * rest of src/lib/search depends on. This is the measure named in PR 24's
 * post-mortem as the one that would have caught the September break, where
 * the server's `resolved.stat_vars` went from an array to an object and the
 * site rendered empty cards in silence: these tests fail on that exact
 * shape, and nothing here pins a fixture's incidental label or count.
 */

/** Every raw wire spec inside one (pre-normalization) fixture body: the
 *  definite `spec`, each of `candidates.specs`, and `no_data.nearest_real`/
 *  `no_data.flagged_match`. */
function rawSpecsIn(body: any): any[] {
    const specs: any[] = [];
    for (const part of body?.parts ?? []) {
        if (part.spec) specs.push(part.spec);
        if (part.candidates?.specs) specs.push(...part.candidates.specs);
        if (part.no_data?.nearest_real) specs.push(...part.no_data.nearest_real);
        if (part.no_data?.flagged_match) specs.push(part.no_data.flagged_match);
    }
    return specs;
}

for (const name of fixtureNames) {
    const body = fixtures[name] as any;

    test(`${name}: carries a schema_version and a kind`, () => {
        assert.equal(typeof body.schema_version, 'number');
        assert.ok(['resolution', 'catalogue', 'declined'].includes(body.kind));
    });

    test(`${name}: only a resolution carries parts, and every normalized part carries operations`, () => {
        const normalized = normalizeResponse(body);

        if (body.kind !== 'resolution') {
            assert.equal(normalized.parts, undefined);
            return;
        }
        assert.ok(normalized.parts.length > 0);
        for (const part of normalized.parts) {
            assert.ok(Array.isArray(part.operations));
        }
    });
}

for (const name of specFixtureNames) {
    const body = fixtures[name];

    test(`${name}: every spec carries the definition/resolved split flattenSpec requires`, () => {
        const specs = rawSpecsIn(body);
        assert.ok(specs.length > 0, 'fixture carries at least one spec');
        for (const spec of specs) {
            assert.ok(spec.definition, `${spec.spec_id} has a definition`);
            assert.ok(spec.resolved, `${spec.spec_id} has a resolved`);
        }
    });

    test(`${name}: spec_ids are distinct`, () => {
        const ids = rawSpecsIn(body).map((spec) => spec.spec_id);
        assert.equal(new Set(ids).size, ids.length);
    });

    test(`${name}: resolved.stat_vars carries counts and a date range, the served count at most the family's`, () => {
        for (const spec of rawSpecsIn(body)) {
            const statVars = spec.resolved.stat_vars;

            assert.deepEqual(
                Object.keys(statVars).sort(),
                ['data_date_range', 'member_count', 'member_count_exact', 'served_count'],
                spec.spec_id,
            );
            assert.equal(typeof statVars.member_count, 'number');
            assert.equal(typeof statVars.member_count_exact, 'boolean');
            assert.ok(
                statVars.served_count === null ||
                    statVars.served_count <= statVars.member_count ||
                    !statVars.member_count_exact,
                `${spec.spec_id}: served_count exceeds an exact member_count`,
            );
        }
    });

    test(`${name}: resolved.entities[].role is a flat wire string, not a nested object`, () => {
        for (const spec of rawSpecsIn(body)) {
            for (const entity of spec.resolved.entities ?? []) {
                assert.equal(typeof entity.role, 'string');
                assert.ok(
                    ['observationAbout', 'origin', 'destination'].includes(entity.role),
                    `unexpected role ${entity.role}`,
                );
            }
        }
    });

    test(`${name}: every series facet is a sparse axis map of {ref, label}`, () => {
        for (const spec of rawSpecsIn(body)) {
            for (const series of spec.resolved.observations?.series ?? []) {
                assert.equal(typeof series.total_obs, 'number');
                for (const [axis, value] of Object.entries<any>(series.facet ?? {})) {
                    assert.ok(
                        ['provenance', 'measurementMethod', 'unit'].includes(axis),
                        `unexpected facet axis ${axis}`,
                    );
                    assert.equal(typeof value.ref, 'string');
                    assert.ok(
                        value.label === undefined ||
                            value.label === null ||
                            typeof value.label === 'string',
                    );
                }
            }
        }
    });

    test(`${name}: flattenSpec reads every spec without setting stat_vars_unreadable`, () => {
        const normalized = normalizeResponse(body);
        for (const part of normalized.parts) {
            const specs = [
                part.spec,
                ...(part.candidates?.specs ?? []),
                ...(part.no_data?.nearest_real ?? []),
                part.no_data?.flagged_match,
            ].filter(Boolean);

            assert.ok(specs.length > 0);
            for (const spec of specs) {
                assert.equal(
                    statVarsUnreadable(spec),
                    false,
                    `${spec.spec_id} should parse cleanly, this is the check the September break skipped`,
                );
                // Every parsed spec still names a readable primary StatVar label.
                assert.equal(typeof primaryStatVarLabel(spec), 'string');
            }
        }
    });

    test(`${name}: unflattenSpec gives back the wire spec flattenSpec was given`, () => {
        for (const spec of rawSpecsIn(body)) {
            assert.deepEqual(unflattenSpec(flattenSpec(spec)), spec);
        }
    });
}

test('crs-hierarchical-purpose: the bound crsPurpose leaf carries a parent relation and no children', () => {
    const [spec] = rawSpecsIn(fixtures['crs-hierarchical-purpose']);
    const crsPurpose = spec.resolved.slot_options.find(
        (entry: any) => entry.key.property.dcid === 'crsPurpose',
    );

    assert.ok(crsPurpose, 'fixture carries a crsPurpose slot_options entry');
    assert.equal(crsPurpose.options.length, 1);
    assert.equal(crsPurpose.options[0].relation, 'parent');
});

test('declined-out-of-scope: normalizes to the same body, reason and empty scope intact', () => {
    const body = fixtures['declined-out-of-scope'] as any;
    const normalized = normalizeResponse(body);

    assert.equal(normalized, body);
    assert.equal(normalized.kind, 'declined');
    assert.equal(normalized.reason, 'out_of_scope');
    assert.deepEqual(normalized.scope, { place: null });
});

test('catalogue-kenya: normalizes to the same body, scoped to the confirmed country', () => {
    const body = fixtures['catalogue-kenya'] as any;
    const normalized = normalizeResponse(body);

    assert.equal(normalized, body);
    assert.equal(normalized.kind, 'catalogue');
    assert.deepEqual(normalized.scope.place, { dcid: 'country/KEN', label: 'Kenya' });
});

test('definite-rank-operation: the definite part keeps its rank operation and flattens its spec', () => {
    const normalized = normalizeResponse(fixtures['definite-rank-operation']);
    const [part] = normalized.parts;

    assert.equal(part.status, 'definite');
    assert.deepEqual(part.operations, [{ verb: 'rank', phrase: 'top 5 donors', over: 'origin' }]);
    assert.equal(part.spec.resolved, undefined, 'flattenSpec spreads `resolved` flat');
    assert.ok(part.spec.identity, 'flattenSpec keeps the definition identity');
});

test('entity-ambiguous: operations default to empty and data_query rides through', () => {
    const normalized = normalizeResponse(fixtures['entity-ambiguous']);
    const [part] = normalized.parts;

    assert.deepEqual(part.operations, []);
    assert.equal(part.no_data.reason, 'entity_ambiguous');
    assert.deepEqual(
        part.no_data.data_query.parts[0].entities.map((entity: any) => entity.dcid ?? null),
        [null, 'country/FRA'],
    );
    assert.deepEqual(
        part.no_data.ambiguous_entities[0].candidates.map((candidate: any) => candidate.dcid),
        ['country/COD', 'country/COG'],
    );
});
