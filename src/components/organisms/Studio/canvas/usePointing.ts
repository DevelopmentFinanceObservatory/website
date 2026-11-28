'use client';

import { useCallback, useEffect, useRef } from 'react';

// Pointing names a card once the pointer or focus has rested on it this
// long, so the marks it drives do not flicker as the pointer crosses cards.
export const POINT_REST_MS = 150;

/**
 * The card the pointer or keyboard focus rests on, reported through
 * `onPoint` POINT_REST_MS after it comes to rest and cleared at once when it
 * leaves. Also tracks which cards have a menu open: nothing is pointed at
 * while one is, and opening one clears the pointed card.
 */
export const usePointing = (onPoint: ((id: string | null) => void) | undefined) => {
    const timer = useRef(0);
    const pointed = useRef<string | null>(null);
    const openMenus = useRef(new Set<string>());

    useEffect(() => () => window.clearTimeout(timer.current), []);

    // Clears the pointed card; with an id, only when it is that card.
    const unpoint = useCallback(
        (id?: string) => {
            window.clearTimeout(timer.current);

            if (pointed.current !== null && (id === undefined || pointed.current === id)) {
                pointed.current = null;
                onPoint?.(null);
            }
        },
        [onPoint],
    );

    // Starts, or restarts, the rest on card `id`.
    const pointLater = useCallback(
        (id: string) => {
            if (!onPoint || openMenus.current.size > 0 || pointed.current === id) {
                return;
            }

            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => {
                pointed.current = id;
                onPoint(id);
            }, POINT_REST_MS);
        },
        [onPoint],
    );

    const menuOpenChange = useCallback(
        (id: string, open: boolean) => {
            if (open) {
                openMenus.current.add(id);
                unpoint();
            } else {
                openMenus.current.delete(id);
            }
        },
        [unpoint],
    );

    const menuOpen = useCallback(() => openMenus.current.size > 0, []);

    // The card pointed at now, for a check after the sheet changes.
    const pointedId = useCallback(() => pointed.current, []);

    return { pointLater, unpoint, menuOpenChange, menuOpen, pointedId };
};
