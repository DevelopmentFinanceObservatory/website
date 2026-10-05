'use client';

import { type RefObject, useEffect, useRef } from 'react';

/**
 * Scroll an element into view AFTER a state change has rendered: call the
 * returned `request()` right before the state update, and once `deps`
 * change the element scrolls (smoothly, to its top) on the next frame — so
 * it lands on what's actually there, not on the previous content.
 */
export const usePendingScroll = (ref: RefObject<HTMLElement | null>, deps: unknown[]) => {
    const pending = useRef(false);

    useEffect(() => {
        if (!pending.current) {
            return;
        }

        pending.current = false;

        const frame = requestAnimationFrame(() => {
            ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        return () => cancelAnimationFrame(frame);
        // The caller's deps are the trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return () => {
        pending.current = true;
    };
};
