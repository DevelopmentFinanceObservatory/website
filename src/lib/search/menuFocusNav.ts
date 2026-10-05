/** Pure "what comes next" half of the keyboard mechanism that
 *  onMenuContentKeyDownCapture (menuContentKeys.ts) applies to the DOM:
 *  Radix's roving focus only cycles menuitem rows, so a field the menu also
 *  renders (a filter box, "Replace phrase") is invisible to it, and its
 *  typeahead search fights a field the user is typing into. Kept pure over
 *  an ordered stop list so it's unit-testable without a real DOM. */

/** One focusable stop in DOM order. Only 'filter' is a typing-redirect and
 *  open-focus target. 'field' still joins the arrow-key loop. */
export type MenuFocusKind = 'row' | 'filter' | 'field';

const STEP_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

export function isMenuFocusNavKey(key: string): boolean {
    return STEP_KEYS.has(key);
}

/** loop matches whatever loop prop this menu's own Content/SubContent passes
 *  Radix. A non-looping menu's ArrowDown past the last stop is a no-op,
 *  matching Radix's own behavior. Home/End are a field's own business
 *  whenever one has focus. Only a row (or nothing, -1) hands them to this
 *  function. currentIndex of -1 treats ArrowDown as entering from above the
 *  first stop and ArrowUp as entering from below the last. */
export function nextMenuFocusIndex(
    kinds: MenuFocusKind[],
    currentIndex: number,
    key: string,
    { loop }: { loop: boolean },
): number | null {
    if (kinds.length === 0 || !isMenuFocusNavKey(key)) return null;

    const isHomeOrEnd = key === 'Home' || key === 'End';
    const currentKind = currentIndex >= 0 ? kinds[currentIndex] : null;

    if (isHomeOrEnd && currentKind !== null && currentKind !== 'row') return null;

    if (key === 'Home') return 0;
    if (key === 'End') return kinds.length - 1;

    if (currentIndex < 0) return key === 'ArrowDown' ? 0 : kinds.length - 1;

    const delta = key === 'ArrowDown' ? 1 : -1;
    const raw = currentIndex + delta;

    if (loop) return (raw + kinds.length) % kinds.length;

    return raw >= 0 && raw < kinds.length ? raw : null;
}

/** Typing a character while a ROW has focus redirects to the menu's filter
 *  instead of Radix's default typeahead. null leaves the keystroke alone
 *  when a field already has focus or the menu has no filter. */
export function filterRedirectIndex(kinds: MenuFocusKind[], currentIndex: number): number | null {
    if (currentIndex < 0 || kinds[currentIndex] !== 'row') return null;

    const filterIndex = kinds.indexOf('filter');

    return filterIndex === -1 ? null : filterIndex;
}
