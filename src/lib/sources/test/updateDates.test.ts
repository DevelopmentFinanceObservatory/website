import assert from 'node:assert/strict';
import test from 'node:test';

import {
    localShortDateText,
    nextReleaseText,
    releaseOverdue,
    shortDateText,
    sourceDateText,
} from '../updateDates.ts';

const NOW = new Date('2026-10-11T09:00:00Z');

test('sourceDateText writes a month, a date and a timestamp at their own precision', () => {
    const cases: [string, string][] = [
        ['2026-09', 'September 2026'],
        ['2026-10-05', '5 October 2026'],
        ['2026-10-02T17:23:42Z', '2 October 2026'],
        ['2026-13', '2026-13'],
        ['2026-02-30', '2026-02-30'],
        ['Quarterly', 'Quarterly'],
    ];

    for (const [value, text] of cases) {
        assert.equal(sourceDateText(value), text, value);
    }
});

test('shortDateText spells September "Sep" whatever the ICU version, and reads in UTC', () => {
    assert.equal(shortDateText(new Date('2026-09-28T23:59:59Z')), '28 Sep 2026');
    assert.equal(shortDateText(new Date('2026-01-05T00:00:00Z')), '5 Jan 2026');
});

test("localShortDateText names the day on the reader's own clock", () => {
    assert.equal(localShortDateText(new Date(2026, 8, 28, 23, 59)), '28 Sep 2026');
    assert.equal(localShortDateText(new Date(2026, 8, 28, 0, 1)), '28 Sep 2026');
});

test('a release is overdue once its month precedes the current month', () => {
    const cases: [string, boolean][] = [
        ['2026-09', true],
        ['2025-12', true],
        ['2026-10', false],
        ['2026-11', false],
        ['2026-09-30', true],
        ['2026-10-01T00:00:00Z', false],
        ['2026-09-30T23:59:59Z', true],
        ['Quarterly', false],
    ];

    for (const [value, overdue] of cases) {
        assert.equal(releaseOverdue(value, NOW), overdue, value);
    }
});

test('the next release reads in words and is marked once overdue', () => {
    assert.equal(nextReleaseText('2026-09', NOW), 'September 2026 (overdue)');
    assert.equal(nextReleaseText('2026-10', NOW), 'October 2026');
});
