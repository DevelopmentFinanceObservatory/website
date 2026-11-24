/**
 * `navFocus.ts` over a stand-in DOM whose elements are attribute maps and
 * whose selector lookup evaluates the real `VIEW_HEADING` selector: focus
 * follows each move to a new view, waits for a view that is still loading,
 * leaves focus the reader moved elsewhere, and stays put on the first view of
 * a page load.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { navigationFocus } from '../navFocus.ts';

type Attributes = Readonly<Record<string, string>>;

type Element = {
    readonly tag: string;
    readonly attributes: Attributes;
    /** Focus on it does nothing, as on a hidden or disabled element. */
    readonly inert?: true;
};

/** One compound selector such as `h1[tabindex="-1"]` or `[data-view-heading]`, against an element. */
const matches = (element: Element, compound: string): boolean => {
    const [, tag = '', rest = ''] = /^([a-z0-9]*)(.*)$/.exec(compound) ?? [];
    if (tag !== '' && tag !== element.tag) return false;
    return [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, name = '', value]) =>
        value === undefined ? name in element.attributes : element.attributes[name] === value,
    );
};

/** The page: the view's elements in document order, the focused one, and what `focus()` does. */
const page = (views: readonly Element[], options: { onFocus?: () => void } = {}) => {
    const state = { active: null as Element | null };
    const body = { tag: 'body', attributes: {} };
    // The DOM hands out one object per element, so focus compares by identity.
    const handles = new Map(
        views.map((element) => [
            element,
            {
                element,
                focus: () => {
                    if ('tabindex' in element.attributes && element.inert !== true) {
                        state.active = element;
                        options.onFocus?.();
                    }
                },
            },
        ]),
    );
    const root = {
        querySelector: (selector: string) => {
            const found = views.find((element) =>
                selector.split(',').some((part) => matches(element, part.trim())),
            );
            return found === undefined ? null : (handles.get(found) ?? null);
        },
    };
    return {
        root,
        document: {
            get activeElement() {
                const active = state.active;
                return active === null ? body : (handles.get(active) ?? active);
            },
            body,
        },
        focused: () => state.active,
        // The reader moves focus to something outside the view, such as the search box.
        focusOutside: (element: Element) => {
            state.active = element;
        },
    };
};

const h1 = (text: string): Element => ({ tag: 'h1', attributes: { tabindex: '-1', text } });
const refusal: Element = { tag: 'p', attributes: { tabindex: '-1', 'data-view-heading': '' } };
const input: Element = { tag: 'input', attributes: {} };

test('the first view of a page load takes no focus', () => {
    const nav = navigationFocus();
    const start = page([h1('start')]);
    nav.arrive('start');
    assert.equal(nav.pay(start.root, start.document), false);
    assert.equal(start.focused(), null);
});

test('a move focuses the new view heading once', () => {
    const nav = navigationFocus();
    nav.arrive('start');
    const next = page([h1('A')]);
    nav.arrive('node:A');
    assert.equal(nav.pay(next.root, next.document), false);
    assert.equal(next.focused()?.attributes.text, 'A');
});

test('a loading view is focused when its heading lands', () => {
    const nav = navigationFocus();
    nav.arrive('start');
    nav.arrive('node:B');
    const loading = page([{ tag: 'div', attributes: {} }]);
    assert.equal(nav.pay(loading.root, loading.document), true);
    const landed = page([h1('B')]);
    assert.equal(nav.pay(landed.root, landed.document), false);
    assert.equal(landed.focused()?.attributes.text, 'B');
});

test('a search-result pick focuses the new heading although focus sat in the search box', () => {
    const nav = navigationFocus();
    nav.arrive('start');
    nav.arrive('node:S');
    const drawn = page([h1('S')]);
    drawn.focusOutside(input);
    assert.equal(nav.pay(drawn.root, drawn.document), false);
    assert.equal(drawn.focused()?.attributes.text, 'S');
});

test('a key, press or focus move during a load cancels the deferred focus', () => {
    for (const event of [
        { type: 'keydown', key: 'Tab' },
        { type: 'pointerdown' },
        { type: 'focusin' },
    ]) {
        const nav = navigationFocus();
        nav.arrive('start');
        nav.arrive('node:B');
        const loading = page([{ tag: 'div', attributes: {} }]);
        assert.equal(nav.pay(loading.root, loading.document), true);
        loading.focusOutside(input);
        assert.equal(nav.input(event), true, event.type);
        const landed = page([h1('B')]);
        landed.focusOutside(input);
        assert.equal(nav.pay(landed.root, landed.document), false);
        assert.equal(landed.focused(), input, event.type);
    }
});

test('a lone modifier key keeps the deferred focus', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock']) {
        const nav = navigationFocus();
        nav.arrive('start');
        nav.arrive('node:B');
        const loading = page([{ tag: 'div', attributes: {} }]);
        assert.equal(nav.pay(loading.root, loading.document), true);
        assert.equal(nav.input({ type: 'keydown', key }), false, key);
        const landed = page([h1('B')]);
        assert.equal(nav.pay(landed.root, landed.document), false);
        assert.equal(landed.focused()?.attributes.text, 'B', key);
    }
});

test('the focus the explorer makes itself is not the reader taking over', () => {
    const nav = navigationFocus();
    nav.arrive('start');
    nav.arrive('node:B');
    const landed = page([h1('B')], { onFocus: () => nav.input({ type: 'focusin' }) });
    assert.equal(nav.pay(landed.root, landed.document), false);
    assert.equal(landed.focused()?.attributes.text, 'B');
});

test('an element whose focus does not move leaves the debt open', () => {
    const nav = navigationFocus();
    nav.arrive('start');
    nav.arrive('node:C');
    const failed = page([{ tag: 'h1', attributes: { tabindex: '-1' }, inert: true }]);
    assert.equal(nav.pay(failed.root, failed.document), true);
    assert.equal(failed.focused(), null);
});

test('an h1 without tabindex gives way to the marked text after it', () => {
    const nav = navigationFocus();
    nav.arrive('start');
    nav.arrive('node:C');
    const failed = page([{ tag: 'h1', attributes: {} }, refusal]);
    assert.equal(nav.pay(failed.root, failed.document), false);
    assert.equal(failed.focused(), refusal);
});

test('a refusal with no title takes focus on its marked text', () => {
    const nav = navigationFocus();
    nav.arrive('start');
    nav.arrive('node:D');
    const refused = page([refusal]);
    assert.equal(nav.pay(refused.root, refused.document), false);
    assert.equal(refused.focused(), refusal);
});
