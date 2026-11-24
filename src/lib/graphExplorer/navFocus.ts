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

/** Keys that move no focus and type nothing, such as the Ctrl a screen reader uses to stop speech. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
    'Shift',
    'Control',
    'Alt',
    'AltGraph',
    'Meta',
    'CapsLock',
]);

/** The part of a `keydown`, `pointerdown` or `focusin` event `input` reads. */
export type ReaderEvent = { readonly type: string; readonly key?: string };

/**
 * Tracks the view on show. `arrive` records its key and owes the view a focus
 * after a move; the first key of a page load owes none. `pay` takes the focus
 * the first time the view draws a heading and returns whether the debt is
 * still open. The move itself is the reader's input, so a view that draws at
 * once is focused wherever focus sat, in the search box included. A view that
 * loads first is focused only if the reader does nothing meanwhile: `input`,
 * called on each `keydown`, `pointerdown` and `focusin`, drops the debt and
 * returns true when the event is the reader taking over. A lone modifier key
 * moves nothing, and the focus `pay` makes itself is not the reader's.
 */
export const navigationFocus = () => {
    let shown: string | null = null;
    let owed = false;
    let paying = false;
    return {
        arrive(key: string) {
            if (shown !== null && key !== shown) owed = true;
            shown = key;
        },
        pay(root: ViewRoot, page: FocusPage): boolean {
            if (!owed) return false;
            paying = true;
            try {
                if (focusViewHeading(root, page)) owed = false;
            } finally {
                paying = false;
            }
            return owed;
        },
        input(event: ReaderEvent): boolean {
            if (!owed || paying) return false;
            if (event.type === 'keydown' && MODIFIER_KEYS.has(event.key ?? '')) return false;
            owed = false;
            return true;
        },
    };
};
