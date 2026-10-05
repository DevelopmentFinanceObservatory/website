import assert from 'node:assert/strict';
import test from 'node:test';

import type { KeyboardEvent } from 'react';

import { onMenuContentKeyDownCapture } from '../menuContentKeys.ts';

/** A menu row or field as the handler reads it, with a browser's focus
 *  rule: a disabled element takes no focus. */
type FakeStop = {
    name: string;
    disabled: boolean;
    attributes: Record<string, string>;
    getAttribute: (name: string) => string | null;
    matches: (selector: string) => boolean;
    focus: () => void;
};

/** A menu panel holding `stops` in DOM order, each named by its label. A
 *  stop is a row unless its spec names a field kind. */
const menuPanel = (stops: { name: string; field?: string; disabled?: boolean }[]) => {
    const document: { activeElement: FakeStop | null } = { activeElement: null };
    const elements = stops.map(({ name, field, disabled = false }) => {
        const attributes: Record<string, string> = field
            ? { 'data-menu-field': field }
            : { role: 'menuitem' };
        const element: FakeStop = {
            name,
            disabled,
            attributes,
            getAttribute: (key) => attributes[key] ?? null,
            matches: (selector) => {
                if (selector !== ':disabled') throw new Error(`unsupported selector ${selector}`);

                return element.disabled;
            },
            focus: () => {
                if (!element.disabled) document.activeElement = element;
            },
        };

        return element;
    });
    const container = {
        ownerDocument: document,
        contains: (node: unknown) => elements.includes(node as FakeStop),
        querySelectorAll: () => elements,
    };
    const byName = (name: string) => elements.find((element) => element.name === name)!;
    const press = (key: string) => {
        const event = {
            key,
            currentTarget: container,
            target: document.activeElement,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
            preventDefault: () => {},
            stopPropagation: () => {},
        };

        onMenuContentKeyDownCapture({ loop: true })(event as unknown as KeyboardEvent<HTMLElement>);
    };

    return {
        focus: (name: string) => byName(name).focus(),
        press,
        focused: () => document.activeElement?.name ?? null,
    };
};

// The unit picker (UnitPicker.tsx) on a constant-price answer: the preset
// rows, the price switch, the base year with its Apply, and the currency
// search.
const unitPanel = ({ applyDisabled = false, currentDisabled = false } = {}) =>
    menuPanel([
        { name: 'US dollars' },
        { name: 'Euros' },
        { name: 'Current', field: 'field', disabled: currentDisabled },
        { name: 'Constant', field: 'field' },
        { name: 'Base year', field: 'field' },
        { name: 'Apply', field: 'field', disabled: applyDisabled },
        { name: 'Other currency', field: 'field' },
    ]);

test('ArrowDown from the base year passes a disabled Apply to the currency search', () => {
    const panel = unitPanel({ applyDisabled: true });

    panel.focus('Base year');
    panel.press('ArrowDown');
    assert.equal(panel.focused(), 'Other currency');
    panel.press('ArrowUp');
    assert.equal(panel.focused(), 'Base year');

    const enabled = unitPanel();

    enabled.focus('Base year');
    enabled.press('ArrowDown');
    assert.equal(enabled.focused(), 'Apply');
});

test('the arrow keys pass a price basis the currency does not convert at', () => {
    const panel = unitPanel({ currentDisabled: true });

    panel.focus('Euros');
    panel.press('ArrowDown');
    assert.equal(panel.focused(), 'Constant');
    panel.press('ArrowUp');
    assert.equal(panel.focused(), 'Euros');
});
