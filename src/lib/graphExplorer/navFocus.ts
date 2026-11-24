/**
 * Focus after navigation. A view replaces the one before it, so a focused
 * link inside the old view unmounts and focus falls back to the page. Each
 * move to a new view sends focus to that view's heading, so a screen reader
 * reads it out. The first view of a page load takes none. A search result
 * leaves focus in the search box, which sits outside the view, and the
 * heading takes it from there like any other move.
 */

export type Focusable = { focus(options?: FocusOptions): void };

/** The part of the view's element this module reads, so a test can stand in for the DOM. */
export type ViewRoot = { querySelector(selector: string): Focusable | null };

/** The part of `document` this module reads. */
export type FocusPage = { readonly activeElement: unknown };

/**
 * What a view offers for focus: its title, or the marked text of a screen with
 * none (a refusal, or a missing term). Only elements that can take focus match.
 */
export const VIEW_HEADING = 'h1[tabindex="-1"], [data-view-heading]';

/**
 * Focuses the view's heading inside `root`, scrolling it into view if it sits
 * off screen, as it can where the picture stacks. False while the view draws
 * none, as when it loads, or when focus did not move.
 */
export const focusViewHeading = (root: ViewRoot, page: FocusPage): boolean => {
    const target = root.querySelector(VIEW_HEADING);
    if (target === null) return false;
    target.focus();
    return page.activeElement === target;
};

/**
 * Tracks the view on show. `arrive` records its key and owes the view a focus
 * after a move; the first key of a page load owes none. `pay` takes the focus
 * the first time the view draws a heading and returns whether the debt is
 * still open. The move itself is the reader's input, so a view that draws at
 * once is focused wherever focus sat, in the search box included. A view that
 * loads first is focused only if the reader does nothing meanwhile: `cancel`,
 * called on the reader's next key or pointer press, drops the debt.
 */
export const navigationFocus = () => {
    let shown: string | null = null;
    let owed = false;
    return {
        arrive(key: string) {
            if (shown !== null && key !== shown) owed = true;
            shown = key;
        },
        pay(root: ViewRoot, page: FocusPage): boolean {
            if (owed && focusViewHeading(root, page)) owed = false;
            return owed;
        },
        cancel() {
            owed = false;
        },
    };
};
