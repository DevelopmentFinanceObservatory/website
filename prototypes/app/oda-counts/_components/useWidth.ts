import { useLayoutEffect, useRef, useState } from 'react';

/** How long after the first draw or a resize a chart keeps its transitions off. */
const STILL_MS = 200;

/** Marks `element` still for a moment, so its redraw does not glide (_motion.scss). */
const settle = (element: HTMLElement, timer: { id: number }) => {
    element.dataset.still = '';
    window.clearTimeout(timer.id);
    timer.id = window.setTimeout(() => delete element.dataset.still, STILL_MS);
};

/**
 * A ref whose element carries `data-still` for a moment after the first draw, so
 * nothing on it animates into place. For charts sized in percentages.
 */
export const useStill = <TElement extends HTMLElement = HTMLDivElement>() => {
    const ref = useRef<TElement>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        const timer = { id: 0 };

        if (element !== null) {
            settle(element, timer);
        }

        return () => window.clearTimeout(timer.id);
    }, []);

    return ref;
};

/**
 * The element's content width in whole pixels, re-measured on resize; 0 until measured.
 * While the width settles (first draw, resize) the element carries `data-still`, which
 * turns its transitions off, so only changes of data glide.
 */
export const useWidth = <TElement extends HTMLElement = HTMLDivElement>() => {
    const ref = useRef<TElement>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const element = ref.current;
        const timer = { id: 0 };

        if (element === null) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            const measured = Math.floor(entry?.contentRect.width ?? 0);

            if (measured > 0) {
                settle(element, timer);
                setWidth(measured);
            }
        });

        observer.observe(element);

        return () => {
            window.clearTimeout(timer.id);
            observer.disconnect();
        };
    }, []);

    return [ref, width] as const;
};
