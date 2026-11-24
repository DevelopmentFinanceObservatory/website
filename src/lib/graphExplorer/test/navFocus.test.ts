/**
 * `navFocus.ts`: focus follows each move to a new view, waits for a view that
 * is still loading, and stays put on the first view of a page load.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { navigationFocus, type HeadingScope } from '../navFocus.ts';

/** A view's DOM as the heading lookup sees it: which selectors match, and what has focus. */
const view = (matches: Partial<Record<'h1' | '[tabindex="-1"]', string>>, focused: string[]) =>
    ({
        querySelector: (selector: string) => {
            const name = matches[selector as 'h1' | '[tabindex="-1"]'];
            return name === undefined ? null : { focus: () => void focused.push(name) };
        },
    }) satisfies HeadingScope;

test('the first view of a page load takes no focus', () => {
    const focused: string[] = [];
    navigationFocus().settle('start', view({ h1: 'start' }, focused));
    assert.deepEqual(focused, []);
});

test('each move focuses the new view heading once, after term links, results and history alike', () => {
    const focused: string[] = [];
    const nav = navigationFocus();
    nav.settle('start', view({ h1: 'start' }, focused));
    nav.settle('node:A', view({ h1: 'A' }, focused));
    nav.settle('node:A', view({ h1: 'A' }, focused));
    nav.settle('start', view({ h1: 'start' }, focused));
    assert.deepEqual(focused, ['A', 'start']);
});

test('a view that draws no heading yet is focused when its heading lands', () => {
    const focused: string[] = [];
    const nav = navigationFocus();
    nav.settle('start', view({ h1: 'start' }, focused));
    nav.settle('node:B', view({}, focused));
    assert.deepEqual(focused, []);
    nav.settle('node:B', view({ h1: 'B' }, focused));
    assert.deepEqual(focused, ['B']);
});

test('a refusal with no title takes focus on its text', () => {
    const focused: string[] = [];
    const nav = navigationFocus();
    nav.settle('start', view({ h1: 'start' }, focused));
    nav.settle('node:C', view({ '[tabindex="-1"]': 'refusal' }, focused));
    assert.deepEqual(focused, ['refusal']);
});
