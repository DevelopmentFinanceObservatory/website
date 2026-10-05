import assert from 'node:assert/strict';
import test from 'node:test';

import {
    allYearsApplyValue,
    buildRangeApplyValue,
    isAllYearsWindow,
    seedWindowYears,
    windowApplyValueUnchanged,
} from '../windowState.ts';

test('seedWindowYears seeds "since 2015" as start 2015 and an open end, not 2015-2015', () => {
    const seed = seedWindowYears({
        requestedWindow: { kind: 'range', start_year: 2015 },
        coverageWindow: undefined,
        label: 'since 2015',
        observationYears: [],
    });

    assert.deepEqual(seed, { start: '2015', end: '' });
});

test('seedWindowYears reads a closed range independently per field', () => {
    const seed = seedWindowYears({
        requestedWindow: { kind: 'range', start_year: 2010, end_year: 2020 },
        coverageWindow: undefined,
        label: '2010-2020',
        observationYears: [],
    });

    assert.deepEqual(seed, { start: '2010', end: '2020' });
});

test('seedWindowYears never patches a range field from the label, even when only one bound is set', () => {
    // An open start with a set end — the label carries just the end year,
    // which must not leak into seeding the (deliberately open) start.
    const seed = seedWindowYears({
        requestedWindow: { kind: 'range', end_year: 2020 },
        coverageWindow: undefined,
        label: 'through 2020',
        observationYears: [1990, 1995],
    });

    assert.deepEqual(seed, { start: '', end: '2020' });
});

test('seedWindowYears prefers the resolved coverage window over the requested range', () => {
    const seed = seedWindowYears({
        requestedWindow: { kind: 'range', start_year: 2015 },
        coverageWindow: { start_year: 2016, end_year: 2019 },
        label: 'since 2015',
        observationYears: [],
    });

    assert.deepEqual(seed, { start: '2016', end: '2019' });
});

test('seedWindowYears falls back to the label year, then observations, for a non-range request', () => {
    const fromLabel = seedWindowYears({
        requestedWindow: { kind: 'all' },
        coverageWindow: undefined,
        label: 'in 2018',
        observationYears: [2000, 2010],
    });

    assert.deepEqual(fromLabel, { start: '2018', end: '2018' });

    const fromObservations = seedWindowYears({
        requestedWindow: { kind: 'all' },
        coverageWindow: undefined,
        label: 'over time',
        observationYears: [2000, 2010, 2005],
    });

    assert.deepEqual(fromObservations, { start: '2000', end: '2010' });
});

test('seedWindowYears falls back the same way with no identity at all', () => {
    const seed = seedWindowYears({
        requestedWindow: undefined,
        coverageWindow: undefined,
        label: 'since 2015',
        observationYears: [],
    });

    assert.deepEqual(seed, { start: '2015', end: '2015' });
});

test('isAllYearsWindow reads only an explicit {kind: "all"} request', () => {
    assert.equal(isAllYearsWindow({ kind: 'all' }), true);
    assert.equal(isAllYearsWindow({ kind: 'range', start_year: 2015 }), false);
    assert.equal(isAllYearsWindow({ kind: 'latest' }), false);
    assert.equal(isAllYearsWindow(undefined), false);
});

test('All years posts {kind: "all"}', () => {
    assert.deepEqual(allYearsApplyValue(), { kind: 'all' });
});

test('buildRangeApplyValue omits an untouched bound rather than mirroring the other one', () => {
    assert.deepEqual(buildRangeApplyValue('2015', ''), {
        kind: 'range',
        start_year: 2015,
        end_year: undefined,
    });
    assert.deepEqual(buildRangeApplyValue('', '2020'), {
        kind: 'range',
        start_year: undefined,
        end_year: 2020,
    });
});

test('buildRangeApplyValue swaps a reversed range back into order', () => {
    assert.deepEqual(buildRangeApplyValue('2020', '2010'), {
        kind: 'range',
        start_year: 2010,
        end_year: 2020,
    });
});

test('buildRangeApplyValue returns null when neither field carries a year', () => {
    assert.equal(buildRangeApplyValue('', ''), null);
    assert.equal(buildRangeApplyValue('abc', ''), null);
});

test('windowApplyValueUnchanged detects a dead resubmit of the current window', () => {
    const requestedWindow = { kind: 'range' as const, start_year: 2015, end_year: undefined };

    assert.equal(
        windowApplyValueUnchanged(
            { kind: 'range', start_year: 2015, end_year: undefined },
            requestedWindow,
        ),
        true,
    );
    assert.equal(
        windowApplyValueUnchanged(
            { kind: 'range', start_year: 2015, end_year: 2020 },
            requestedWindow,
        ),
        false,
    );
    assert.equal(windowApplyValueUnchanged({ kind: 'all' }, requestedWindow), false);
    assert.equal(windowApplyValueUnchanged({ kind: 'all' }, { kind: 'all' }), true);
});
