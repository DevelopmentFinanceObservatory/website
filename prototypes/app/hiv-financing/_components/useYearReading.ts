import { useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * The year a chart's key reads: the hovered or tapped one, or the one the arrow keys
 * move to, falling back to `fallback` (usually the latest year) when none is read.
 * `toIndex` maps a pointer's x in the SVG to a year's index.
 */
export const useYearReading = (count: number, fallback: number, toIndex: (x: number) => number) => {
    const [index, setIndex] = useState<number | null>(null);
    const last = count - 1;
    const clamp = (value: number) => Math.max(0, Math.min(last, value));

    const onPointer = (event: PointerEvent<SVGElement>) => {
        const svg =
            event.currentTarget instanceof SVGSVGElement
                ? event.currentTarget
                : event.currentTarget.ownerSVGElement;
        const box = svg?.getBoundingClientRect();

        if (box !== undefined) {
            setIndex(clamp(toIndex(event.clientX - box.left)));
        }
    };

    const onPointerLeave = (event: PointerEvent<SVGElement>) => {
        // On touch the reading stays until the next tap.
        if (event.pointerType === 'mouse') {
            setIndex(null);
        }
    };

    const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const step = event.key === 'ArrowLeft' ? -1 : 1;

            setIndex((current) => clamp((current ?? fallback) + step));
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setIndex(event.key === 'Home' ? 0 : last);
        } else if (event.key === 'Escape') {
            setIndex(null);
        }
    };

    return {
        /** The year being read, or null when the key shows the fallback. */
        reading: index,
        shown: index ?? fallback,
        onPointer,
        onPointerLeave,
        onKeyDown,
        clear: () => setIndex(null),
    };
};
