import assert from 'node:assert/strict';
import test from 'node:test';

import {
    filterRedirectIndex,
    isMenuFocusNavKey,
    nextMenuFocusIndex,
    type MenuFocusKind,
} from '../menuFocusNav.ts';

const ROWS_ONLY: MenuFocusKind[] = ['row', 'row', 'row'];
const FILTER_ABOVE_ROWS: MenuFocusKind[] = ['filter', 'row', 'row', 'row'];
const FILTER_ROWS_AND_FIELD: MenuFocusKind[] = ['filter', 'row', 'row', 'field'];
// An editor with no filter box, its option rows, and a trailing Apply
// button (WindowEditor/PhraseEditor, editors.tsx). Apply reaches keyboard
// focus only because it carries its own `data-menu-field`.
const ROWS_AND_APPLY_FIELD: MenuFocusKind[] = ['row', 'row', 'field'];

test('isMenuFocusNavKey is true only for the four step keys', () => {
    assert.equal(isMenuFocusNavKey('ArrowDown'), true);
    assert.equal(isMenuFocusNavKey('ArrowUp'), true);
    assert.equal(isMenuFocusNavKey('Home'), true);
    assert.equal(isMenuFocusNavKey('End'), true);
    assert.equal(isMenuFocusNavKey('ArrowLeft'), false);
    assert.equal(isMenuFocusNavKey('Enter'), false);
    assert.equal(isMenuFocusNavKey('a'), false);
});

const LOOP = { loop: true };
const NO_LOOP = { loop: false };

test('nextMenuFocusIndex is null for an empty list or an unhandled key', () => {
    assert.equal(nextMenuFocusIndex([], 0, 'ArrowDown', LOOP), null);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 0, 'ArrowLeft', LOOP), null);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 0, 'Enter', LOOP), null);
});

test('nextMenuFocusIndex steps by one and loops past either end when loop is true', () => {
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 0, 'ArrowDown', LOOP), 1);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 2, 'ArrowDown', LOOP), 0);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 0, 'ArrowUp', LOOP), 2);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 1, 'ArrowUp', LOOP), 0);
});

test('nextMenuFocusIndex is a no-op past either end when loop is false', () => {
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 2, 'ArrowDown', NO_LOOP), null);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 0, 'ArrowUp', NO_LOOP), null);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 0, 'ArrowDown', NO_LOOP), 1);
    assert.equal(nextMenuFocusIndex(ROWS_ONLY, 2, 'ArrowUp', NO_LOOP), 1);
});

test('nextMenuFocusIndex treats a field the same as a row for stepping', () => {
    // filter(0) row(1) row(2) field(3) — ArrowDown off the last field loops
    // to the filter; ArrowUp off the filter loops to the field.
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 3, 'ArrowDown', LOOP), 0);
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 0, 'ArrowUp', LOOP), 3);
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 1, 'ArrowDown', LOOP), 2);
});

test('nextMenuFocusIndex enters from the correct end when nothing in the list has focus, loop or not', () => {
    assert.equal(nextMenuFocusIndex(FILTER_ABOVE_ROWS, -1, 'ArrowDown', LOOP), 0);
    assert.equal(nextMenuFocusIndex(FILTER_ABOVE_ROWS, -1, 'ArrowUp', LOOP), 3);
    assert.equal(nextMenuFocusIndex(FILTER_ABOVE_ROWS, -1, 'ArrowDown', NO_LOOP), 0);
    assert.equal(nextMenuFocusIndex(FILTER_ABOVE_ROWS, -1, 'ArrowUp', NO_LOOP), 3);
});

test('nextMenuFocusIndex Home/End land on the first/last stop from a row or nothing focused', () => {
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 2, 'Home', NO_LOOP), 0);
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 2, 'End', NO_LOOP), 3);
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, -1, 'Home', LOOP), 0);
});

test('nextMenuFocusIndex leaves Home/End alone (null) when a field or the filter has focus', () => {
    // filter(0) row(1) row(2) field(3)
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 0, 'Home', LOOP), null);
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 0, 'End', LOOP), null);
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 3, 'Home', LOOP), null);
    assert.equal(nextMenuFocusIndex(FILTER_ROWS_AND_FIELD, 3, 'End', LOOP), null);
});

test('nextMenuFocusIndex reaches a trailing Apply button after its rows, non-looping', () => {
    assert.equal(nextMenuFocusIndex(ROWS_AND_APPLY_FIELD, 1, 'ArrowDown', NO_LOOP), 2);
    assert.equal(nextMenuFocusIndex(ROWS_AND_APPLY_FIELD, 2, 'ArrowUp', NO_LOOP), 1);
    assert.equal(nextMenuFocusIndex(ROWS_AND_APPLY_FIELD, 2, 'ArrowDown', NO_LOOP), null);
});

test('filterRedirectIndex finds the filter only when the current stop is a row', () => {
    assert.equal(filterRedirectIndex(FILTER_ABOVE_ROWS, 1), 0);
    assert.equal(filterRedirectIndex(FILTER_ABOVE_ROWS, 3), 0);
});

test('filterRedirectIndex is null with no current stop, a field already focused, or no filter at all', () => {
    assert.equal(filterRedirectIndex(FILTER_ABOVE_ROWS, -1), null);
    assert.equal(filterRedirectIndex(FILTER_ROWS_AND_FIELD, 3), null);
    assert.equal(filterRedirectIndex(ROWS_ONLY, 0), null);
});
