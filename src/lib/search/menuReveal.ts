/** Brings a heading menu's anchor (a sentence token, or the Refine button)
 *  into view before the menu opens, so a fact's Change in "About this
 *  answer" opens the menu against a visible trigger. Radix positions the
 *  menu against its trigger, and a trigger scrolled off the top of the page
 *  draws the menu clipped above the viewport. */

/** The `data-menu-anchor` key of the heading token at plan index `index`. */
export const tokenAnchor = (index: number): string => `token-${index}`;

/** The `data-menu-anchor` key of the Refine button. */
export const REFINE_ANCHOR = 'refine';

/** How long a scroll goes without a frame before it counts as settled, for
 *  a browser without `scrollend` and for a scroll that never moves. */
const QUIET_MS = 150;

/** The longest wait before the menu opens, whatever the scroll does. */
const SETTLE_CAP_MS = 1000;

/** Events by which the user takes over while the page scrolls. */
const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** Whether an anchor at `rect` sits wholly between the top clearance (its
 *  `scroll-margin-top`, which clears the fixed site header) and the bottom
 *  of the viewport. */
export function anchorInView(
    rect: { top: number; bottom: number },
    clearance: number,
    viewportHeight: number,
): boolean {
    return rect.top >= clearance && rect.bottom <= viewportHeight;
}

/** Calls `run` once a scroll on `target` settles: at `scrollend`, after
 *  QUIET_MS with no `scroll` event, or at SETTLE_CAP_MS, whichever comes
 *  first. `run` never fires after `signal` aborts, and a wheel, touch,
 *  pointer press, or key press on `target` aborts the wait. */
export function afterScrollSettles(
    target: EventTarget,
    signal: AbortSignal,
    run: () => void,
    { quietMs = QUIET_MS, capMs = SETTLE_CAP_MS } = {},
): void {
    if (signal.aborted) return;

    const listening = new AbortController();
    const options = { capture: true, passive: true, signal: listening.signal };
    let quiet = setTimeout(() => finish(true), quietMs);
    const cap = setTimeout(() => finish(true), capMs);

    function finish(open: boolean) {
        clearTimeout(quiet);
        clearTimeout(cap);
        listening.abort();
        if (open && !signal.aborted) run();
    }

    signal.addEventListener('abort', () => finish(false), { signal: listening.signal });
    target.addEventListener('scrollend', () => finish(true), options);
    target.addEventListener(
        'scroll',
        () => {
            clearTimeout(quiet);
            quiet = setTimeout(() => finish(true), quietMs);
        },
        options,
    );

    for (const type of TAKEOVER_EVENTS) {
        target.addEventListener(type, () => finish(false), options);
    }
}

/** Opens a heading menu through `open`, first scrolling its anchor under
 *  the site header when any of it is out of view. The scroll is smooth
 *  unless `reduced` (prefers-reduced-motion), and the menu opens once it
 *  settles, unless `signal` aborts first. With no anchor on the page the
 *  menu opens at once. */
export function revealThenOpen(
    anchorKey: string,
    open: () => void,
    { signal, reduced }: { signal: AbortSignal; reduced: boolean },
): void {
    const anchor = document.querySelector(`[data-menu-anchor="${anchorKey}"]`);

    if (
        !anchor ||
        anchorInView(
            anchor.getBoundingClientRect(),
            parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0,
            window.innerHeight,
        )
    ) {
        open();

        return;
    }

    afterScrollSettles(window, signal, open);
    anchor.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
}
