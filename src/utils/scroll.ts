// -1..1: 0 when the element's center sits at the viewport center.
export function centeredProgress(rect: DOMRect, viewport: number): number {
    return (rect.top + rect.height / 2 - viewport / 2) / (rect.height / 2 + viewport / 2);
}

// 0..1 as the element's top travels from `from`×viewport up to `to`×viewport.
// Elements near the document's end can never reach `to` — for those the window
// shrinks so the progress still completes exactly at max scroll.
export function travelProgress(rect: DOMRect, viewport: number, from = 0.92, to = 0.28): number {
    const start = viewport * from;
    const reachableTop =
        viewport - (document.documentElement.scrollHeight - (rect.top + window.scrollY));
    const end = Math.max(viewport * to, Math.min(reachableTop, start - 1));

    return Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
}

// 0..1 as the element scrolls in from below until fully entered.
export function enterProgress(rect: DOMRect, viewport: number): number {
    return Math.min(1, Math.max(0, (viewport - rect.top) / rect.height));
}

// Strong parallax only makes sense on the desktop layout.
export function isDesktopViewport(): boolean {
    return window.innerWidth >= 1024;
}
