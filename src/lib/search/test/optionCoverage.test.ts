import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageRichness, coverageState, partitionOptions } from '../optionCoverage.ts';
import type { CoverageAccessors } from '../optionCoverage.ts';
import type { Coverage } from '../types.ts';

// A minimal option shape mirroring the engine's SlotOption (types.ts): a
// label plus an optional Coverage.
type Opt = { label: string; dcid: string; coverage?: Coverage };

function opt(label: string, dcid: string, coverage?: Coverage): Opt {
    return { label, dcid, coverage };
}

function accessors(selected: Set<string> = new Set()): CoverageAccessors<Opt> {
    return {
        state: (o) => coverageState(o.coverage),
        richness: (o) => coverageRichness(o.coverage),
        label: (o) => o.label,
        isPinned: (o) => selected.has(o.dcid),
    };
}

test('coverageState is unknown for no coverage at all', () => {
    assert.equal(coverageState(null), 'unknown');
    assert.equal(coverageState(undefined), 'unknown');
});

test('coverageState is probed-zero when the probe ran and found nothing', () => {
    assert.equal(coverageState({ kind: 'bare', has_data: false }), 'probed-zero');
});

test('coverageState is observed when the probe found data', () => {
    assert.equal(coverageState({ kind: 'bare', has_data: true }), 'observed');
});

test('coverageRichness uses dimensions in their fixed [facet, obs] order when present', () => {
    assert.deepEqual(
        coverageRichness({
            kind: 'breadth',
            has_data: true,
            dimensions: [
                { label: 'donors', count: 18 },
                { label: 'years', count: 3 },
            ],
        }),
        [18, 3],
    );
});

test('coverageRichness falls back to observation_count when there are no dimensions', () => {
    assert.deepEqual(coverageRichness({ kind: 'exact', has_data: true, observation_count: 42 }), [42]);
});

test('coverageRichness falls back to 0 when neither dimensions nor observation_count is present (bare)', () => {
    assert.deepEqual(coverageRichness({ kind: 'bare', has_data: true }), [0]);
});

test('partitionOptions passes a list through unchanged when nothing carries a probed verdict', () => {
    const options = [opt('Germany', 'DEU'), opt('Kenya', 'KEN'), opt('Czech Republic', 'CZE')];
    const { main, hidden } = partitionOptions(options, accessors());

    assert.deepEqual(main, options); // same order, same array contents
    assert.deepEqual(hidden, []);
});

test('partitionOptions sorts observed options richest-first, then by richness dimensions, then label', () => {
    const options = [
        opt('Czech Republic', 'CZE', { kind: 'bare', has_data: false }),
        opt('Kenya', 'KEN', {
            kind: 'breadth',
            has_data: true,
            dimensions: [
                { label: 'facet', count: 18 },
                { label: 'obs', count: 3 },
            ],
        }),
        opt('Germany', 'DEU', {
            kind: 'breadth',
            has_data: true,
            dimensions: [
                { label: 'facet', count: 40 },
                { label: 'obs', count: 5 },
            ],
        }),
        opt('Nigeria', 'NGA', {
            kind: 'breadth',
            has_data: true,
            dimensions: [
                { label: 'facet', count: 18 },
                { label: 'obs', count: 7 },
            ],
        }),
    ];
    const { main } = partitionOptions(options, accessors());

    // Germany (40) > Nigeria and Kenya tie on the facet dim (18) but Nigeria's
    // second dimension (7) beats Kenya's (3).
    assert.deepEqual(
        main.map((o) => o.label),
        ['Germany', 'Nigeria', 'Kenya'],
    );
});

test('partitionOptions collapses probed-zero options into `hidden`, out of the main list', () => {
    const options = [
        opt('Germany', 'DEU', { kind: 'exact', has_data: true, observation_count: 18 }),
        opt('Czech Republic', 'CZE', { kind: 'bare', has_data: false }),
        opt('Latvia', 'LVA', { kind: 'bare', has_data: false }),
    ];
    const { main, hidden } = partitionOptions(options, accessors());

    assert.deepEqual(main.map((o) => o.label), ['Germany']);
    assert.deepEqual(
        hidden.map((o) => o.label).sort(),
        ['Czech Republic', 'Latvia'],
    );
});

test('partitionOptions keeps unprobed (unknown) options in main, after observed, in original relative order', () => {
    const options = [
        opt('Unprobed B', 'UB'), // no coverage field at all: unknown
        opt('Germany', 'DEU', { kind: 'exact', has_data: true, observation_count: 18 }),
        opt('Unprobed A', 'UA'),
        opt('Kenya', 'KEN', { kind: 'exact', has_data: true, observation_count: 5 }),
    ];
    const { main, hidden } = partitionOptions(options, accessors());

    assert.deepEqual(
        main.map((o) => o.label),
        ['Germany', 'Kenya', 'Unprobed B', 'Unprobed A'],
    );
    assert.deepEqual(hidden, []);
});

test('partitionOptions pins a selected option into main even when it is probed-zero', () => {
    const options = [
        opt('Germany', 'DEU', { kind: 'exact', has_data: true, observation_count: 18 }),
        opt('Czech Republic', 'CZE', { kind: 'bare', has_data: false }), // currently bound, but no data
        opt('Latvia', 'LVA', { kind: 'bare', has_data: false }),
    ];
    const { main, hidden } = partitionOptions(options, accessors(new Set(['CZE'])));

    assert.deepEqual(main.map((o) => o.label), ['Germany', 'Czech Republic']);
    assert.deepEqual(hidden.map((o) => o.label), ['Latvia']);
});
