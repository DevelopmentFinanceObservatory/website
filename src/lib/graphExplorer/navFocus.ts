/**
 * Focus after navigation. A view replaces the one before it, so the focused
 * link or search result unmounts and focus falls back to the page. Each move
 * to a new view sends focus to that view's heading, so a screen reader reads
 * it out. The first view of a page load takes none.
 */

export type Focusable = { focus(options?: FocusOptions): void };

/** The part of an element `focusViewHeading` reads, so a test can stand in for the DOM. */
export type HeadingScope = { querySelector(selector: string): Focusable | null };

/** A view's title, else the text a refusal or missing screen offers for focus. */
const HEADING_SELECTORS = ['h1', '[tabindex="-1"]'] as const;

/** Focuses the view's heading inside `root`. False while the view draws none, as when it loads. */
export const focusViewHeading = (root: HeadingScope): boolean => {
    for (const selector of HEADING_SELECTORS) {
        const target = root.querySelector(selector);
        if (target !== null) {
            target.focus({ preventScroll: true });
            return true;
        }
    }
    return false;
};

/**
 * Tracks the view on show. `settle` runs after every render with the view's
 * key and the element holding it. It records the first key without moving
 * focus. A later key owes the new view a focus, paid at the first render that
 * draws a heading, so a view that loads first is announced when it lands.
 */
export const navigationFocus = () => {
    let shown: string | null = null;
    let owed = false;
    return {
        settle(key: string, root: HeadingScope | null) {
            if (shown !== null && key !== shown) owed = true;
            shown = key;
            if (owed && root !== null && focusViewHeading(root)) owed = false;
        },
    };
};
