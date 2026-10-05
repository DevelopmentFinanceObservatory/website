import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FILTER_VISIBLE_THRESHOLD,
    dcidSetsEqual,
    entityOptionDcid,
    filterOptionsByQuery,
    mergeEntitySeedWithFetch,
    multiSelectApplyLabel,
    optionCoverageRankingBlocked,
    shouldShowOptionFilter,
    toEntityOption,
    toggleDcid,
} from '../pickerState.ts';
import type { EntityOption } from '../searchClient.ts';

test('shouldShowOptionFilter is false at and below the threshold, true past it', () => {
    assert.equal(shouldShowOptionFilter(FILTER_VISIBLE_THRESHOLD), false);
    assert.equal(shouldShowOptionFilter(FILTER_VISIBLE_THRESHOLD + 1), true);
    assert.equal(shouldShowOptionFilter(0), false);
});

test('filterOptionsByQuery matches case-insensitively against the caller label', () => {
    const options = ['Kenya', 'Ethiopia', 'Germany'];
    const getLabel = (o: string) => o;

    assert.deepEqual(filterOptionsByQuery(options, 'ken', getLabel), ['Kenya']);
    assert.deepEqual(filterOptionsByQuery(options, 'KEN', getLabel), ['Kenya']);
    assert.deepEqual(filterOptionsByQuery(options, '', getLabel), options);
    assert.deepEqual(filterOptionsByQuery(options, '   ', getLabel), options);
    assert.deepEqual(filterOptionsByQuery(options, 'zzz', getLabel), []);
});

test('entityOptionDcid reads the nested SlotOption shape and the flat EntityOption shape', () => {
    assert.equal(entityOptionDcid({ value: { ref: { dcid: 'country/KEN' } } }), 'country/KEN');
    assert.equal(entityOptionDcid({ dcid: 'country/ETH', label: 'Ethiopia' }), 'country/ETH');
    assert.equal(entityOptionDcid({}), undefined);
});

test('toEntityOption normalizes either shape, dropping an option with no dcid or label', () => {
    assert.deepEqual(
        toEntityOption({
            value: { ref: { dcid: 'country/KEN', label: 'Kenya' } },
            coverage: { kind: 'bare', has_data: true },
        }),
        { dcid: 'country/KEN', label: 'Kenya', coverage: { kind: 'bare', has_data: true } },
    );
    assert.deepEqual(toEntityOption({ dcid: 'country/ETH', label: 'Ethiopia' }), {
        dcid: 'country/ETH',
        label: 'Ethiopia',
        coverage: undefined,
    });
    assert.equal(toEntityOption({ value: { ref: { dcid: 'country/KEN' } } }), null);
    assert.equal(toEntityOption({ label: 'No dcid' }), null);
});

test('mergeEntitySeedWithFetch renders the normalized seed alone while the fetch is in flight', () => {
    const seed = [{ value: { ref: { dcid: 'country/KEN', label: 'Kenya' } } }];

    assert.deepEqual(mergeEntitySeedWithFetch(seed, null), [
        { dcid: 'country/KEN', label: 'Kenya', coverage: undefined },
    ]);
});

test('mergeEntitySeedWithFetch prefers the fetched entry for a shared dcid, dedupes it once, and appends seed-only extras', () => {
    const seed = [
        { value: { ref: { dcid: 'country/KEN', label: 'Kenya (stale)' } } },
        { value: { ref: { dcid: 'country/ETH', label: 'Ethiopia' } } },
    ];
    const fetched: EntityOption[] = [
        { dcid: 'country/KEN', label: 'Kenya', coverage: { kind: 'bare', has_data: true } },
        { dcid: 'country/GHA', label: 'Ghana', coverage: undefined },
    ];

    assert.deepEqual(mergeEntitySeedWithFetch(seed, fetched), [
        { dcid: 'country/KEN', label: 'Kenya', coverage: { kind: 'bare', has_data: true } },
        { dcid: 'country/GHA', label: 'Ghana', coverage: undefined },
        { dcid: 'country/ETH', label: 'Ethiopia', coverage: undefined },
    ]);
});

test('optionCoverageRankingBlocked is false with no warnings, no spec id, or an unrelated spec/code', () => {
    assert.equal(optionCoverageRankingBlocked(undefined, 'spec-1'), false);
    assert.equal(optionCoverageRankingBlocked([], 'spec-1'), false);
    assert.equal(
        optionCoverageRankingBlocked(
            [{ code: 'option_coverage_probe_failed', spec_id: 'spec-1' }],
            undefined,
        ),
        false,
    );
    assert.equal(
        optionCoverageRankingBlocked(
            [{ code: 'option_coverage_probe_failed', spec_id: 'spec-2' }],
            'spec-1',
        ),
        false,
    );
    assert.equal(
        optionCoverageRankingBlocked([{ code: 'some_other_warning', spec_id: 'spec-1' }], 'spec-1'),
        false,
    );
});

test('optionCoverageRankingBlocked is true for either cap-warning code naming this spec', () => {
    assert.equal(
        optionCoverageRankingBlocked(
            [{ code: 'option_coverage_probe_failed', spec_id: 'spec-1' }],
            'spec-1',
        ),
        true,
    );
    assert.equal(
        optionCoverageRankingBlocked(
            [{ code: 'option_coverage_timed_out', spec_id: 'spec-1' }],
            'spec-1',
        ),
        true,
    );
});

test('toggleDcid adds an absent dcid and drops a present one, without mutating the input set', () => {
    const selected = new Set(['country/FRA']);

    const added = toggleDcid(selected, 'country/DEU');
    assert.deepEqual([...added].sort(), ['country/DEU', 'country/FRA']);
    assert.deepEqual([...selected], ['country/FRA']);

    const removed = toggleDcid(added, 'country/FRA');
    assert.deepEqual([...removed], ['country/DEU']);
});

test('dcidSetsEqual compares membership, not size alone or insertion order', () => {
    assert.equal(dcidSetsEqual(new Set(['a', 'b']), new Set(['b', 'a'])), true);
    assert.equal(dcidSetsEqual(new Set(['a', 'b']), new Set(['a'])), false);
    assert.equal(dcidSetsEqual(new Set(['a', 'b']), new Set(['a', 'c'])), false);
    assert.equal(dcidSetsEqual(new Set(), new Set()), true);
});

test('multiSelectApplyLabel counts a pending selection and drops the count for Any', () => {
    assert.equal(multiSelectApplyLabel(3, false), 'Apply (3)');
    assert.equal(multiSelectApplyLabel(3, true), 'Apply');
    assert.equal(multiSelectApplyLabel(0, false), 'Apply');
});
