'use client';

import { useEffect, useState } from 'react';

import { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type GridFill = {
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
    shade: string;
    leaving?: boolean;
    leftAt?: number;
};

export type GridFillsOptions = {
    /** Cell shades, hardcoded hex by convention (canvas-like layer). */
    shades: string[];
    cols?: number;
    rows?: number;
    max?: number;
    /** false fades every live fill out and stops the generator. */
    active?: boolean;
};

const FILL_SIZES: [number, number][] = [
    [2, 2],
    [2, 4],
    [4, 2],
    [3, 2],
    [2, 3],
];
const FILL_TICK_MS = 900;
const FILL_FADE_MS = 950;

const randomInt = (max: number) => Math.floor(Math.random() * max);

/**
 * The CreateCanvas grid-fill life cycle as a reusable hook: tinted cell blocks
 * appear and fade on a GridPattern layer. Under reduced motion a static
 * handful renders once. Callers style `.leaving` with a ~FILL_FADE_MS-long
 * exit transition — the hook only prunes entries after that window.
 */
export const useGridFills = ({
    shades,
    cols = 54,
    rows = 31,
    max = 8,
    active = true,
}: GridFillsOptions): GridFill[] => {
    const [fills, setFills] = useState<GridFill[]>([]);
    const reducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        let nextId = 0;

        if (!active) {
            // Retire everything currently on screen (the exit transition plays)
            // and drop the entries once it has.
            const frame = requestAnimationFrame(() =>
                setFills((prev) =>
                    prev.map((fill) => ({ ...fill, leaving: true, leftAt: Date.now() })),
                ),
            );
            const timer = window.setTimeout(() => setFills([]), FILL_FADE_MS);

            return () => {
                cancelAnimationFrame(frame);
                window.clearTimeout(timer);
            };
        }

        const randomFill = (id: number): GridFill => {
            const [w, h] = FILL_SIZES[randomInt(FILL_SIZES.length)]!;

            return {
                id,
                x: randomInt(cols - w) * GRID_CELL,
                y: randomInt(rows - h) * GRID_CELL,
                w: w * GRID_CELL,
                h: h * GRID_CELL,
                shade: shades[randomInt(shades.length)]!,
            };
        };

        if (reducedMotion) {
            const frame = requestAnimationFrame(() =>
                setFills(Array.from({ length: 4 }, () => randomFill(nextId++))),
            );

            return () => cancelAnimationFrame(frame);
        }

        const tick = () => {
            setFills((prev) => {
                const now = Date.now();
                let next = prev.filter(
                    (fill) => !fill.leaving || now - (fill.leftAt ?? now) < FILL_FADE_MS,
                );
                const active = next.filter((fill) => !fill.leaving);

                if (active.length < max && Math.random() < 0.8) {
                    next = [...next, randomFill(nextId++)];
                }

                if (active.length > 3 && Math.random() < 0.5) {
                    const victim = active[randomInt(active.length)]!;

                    next = next.map((fill) =>
                        fill.id === victim.id ? { ...fill, leaving: true, leftAt: now } : fill,
                    );
                }

                return next;
            });
        };

        const frame = requestAnimationFrame(tick);
        const timer = window.setInterval(tick, FILL_TICK_MS);

        return () => {
            cancelAnimationFrame(frame);
            window.clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- shades is a static literal at call sites
    }, [reducedMotion, cols, rows, max, active]);

    return fills;
};
