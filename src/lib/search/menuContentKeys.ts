/** The DOM half of the menu keyboard mechanism menuFocusNav.ts decides:
 *  which elements are focus stops, and the capture-phase keydown handler a
 *  Radix menu's Content takes (SlotMenu.tsx, SearchSentence.tsx). */

import type { KeyboardEvent } from 'react';

import {
    filterRedirectIndex,
    isMenuFocusNavKey,
    nextMenuFocusIndex,
    type MenuFocusKind,
} from './menuFocusNav.ts';

const MENU_STOP_CANDIDATES = '[role="menuitem"], [role="menuitemcheckbox"], [data-menu-field]';

/** Whether the arrow keys visit a menu row or field. A disabled one takes
 *  no focus, so an arrow key passes over it to the next. */
const isMenuFocusStop = (element: Element): boolean =>
    element.getAttribute('aria-disabled') !== 'true' && !element.matches(':disabled');

const menuFocusKind = (stop: Element): MenuFocusKind => {
    const field = stop.getAttribute('data-menu-field');

    if (field === 'filter') return 'filter';

    return field ? 'field' : 'row';
};

/**
 * Makes a text field inside a Radix menu (a filter box, "Replace phrase")
 * reachable: Radix's roving focus only cycles menuitem rows, and its
 * typeahead search fires on any printable keydown, fighting a field the
 * user is typing into. Running in the capture phase lets this replace both
 * handlers for the keys it handles instead of racing them.
 *
 * `loop` must match whatever `loop` prop this same Content/SubContent
 * passes Radix, so a call site that doesn't loop there doesn't silently
 * gain looping here.
 */
export const onMenuContentKeyDownCapture =
    ({ loop = false }: { loop?: boolean } = {}) =>
    (event: KeyboardEvent<HTMLElement>): void => {
        const container = event.currentTarget;

        // React bubbles a portalled submenu's keys through this menu too.
        // The submenu runs its own handler.
        if (!container.contains(event.target as Node | null)) return;

        const stops = Array.from(
            container.querySelectorAll<HTMLElement>(MENU_STOP_CANDIDATES),
        ).filter(isMenuFocusStop);

        if (stops.length === 0) return;

        const active = container.ownerDocument.activeElement;
        const currentIndex = stops.findIndex((stop) => stop === active);
        const kinds = stops.map(menuFocusKind);

        if (isMenuFocusNavKey(event.key)) {
            const nextIndex = nextMenuFocusIndex(kinds, currentIndex, event.key, { loop });

            if (nextIndex == null) return;

            event.preventDefault();
            event.stopPropagation();
            stops[nextIndex]?.focus();
            return;
        }

        const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;

        if (isModifierKey || event.key.length !== 1) return;

        const filterIndex = filterRedirectIndex(kinds, currentIndex);

        if (filterIndex == null) return;

        // Moves focus to the filter and lets the keydown's default action
        // proceed, so the typed character lands there instead of on the
        // row. stopPropagation alone would leave it reaching the row's own
        // MenuItemImpl handler and Radix's typeahead.
        event.stopPropagation();

        const filter = stops[filterIndex] as HTMLInputElement;

        filter.focus();
        filter.setSelectionRange(filter.value.length, filter.value.length);
    };
