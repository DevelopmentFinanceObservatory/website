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
export type ViewRoot = {
    querySelector(selector: string): Focusable | null;
    contains(other: unknown): boolean;
};

/** The part of `document` this module reads. */
export type FocusPage = { readonly activeElement: unknown; readonly body: unknown };

/**
 * What a view offers for focus: its title, or the marked text of a screen with
 * none (a refusal, or a missing term). Only elements that can take focus match.
 */
export const VIEW_HEADING = 'h1[tabindex="-1"], [data-view-heading]';

/**
 * Focuses the view's heading inside `root`. False while the view draws none,
 * as when it loads, or when focus did not move.
 */
export const focusViewHeading = (root: ViewRoot, page: FocusPage): boolean => {
    const target = root.querySelector(VIEW_HEADING);
    if (target === null) return false;
    target.focus({ preventScroll: true });
    return page.activeElement === target;
};

/**
 * Whether the reader has left focus alone since the move: on the page itself
 * (the body, which is where focus falls when its element unmounts) or inside
 * the view. Focus anywhere else belongs to what the reader chose.
 */
const focusIsLoose = (root: ViewRoot, page: FocusPage) =>
    page.activeElement === null ||
    page.activeElement === page.body ||
    root.contains(page.activeElement);

/**
 * Tracks the view on show. `arrive` records its key and owes the view a focus
 * after a move; the first key of a page load owes none. `pay` takes the focus
 * the first time the view draws a heading and returns whether the debt is
 * still open. A debt the reader's own focus has outrun is dropped.
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
            if (!owed) return false;
            if (!focusIsLoose(root, page)) {
                owed = false;
                return false;
            }
            if (focusViewHeading(root, page)) owed = false;
            return owed;
        },
    };
};
