'use client';

import { type RefObject, useEffect, useRef } from 'react';

import { type BoardView, scrollerOf } from './board';
import type { Rect } from './layout';

import type { ThemeDerived } from '@/lib/studio/theme';

/**
 * The arrival shockwave: cell flashes radiating from a fresh card through
 * the canvas — a wavefront travelling WAVE_STEP_MS per cell of distance, up
 * to WAVE_RADIUS cells out, with organic sampling (WAVE_SKIP of cells stay
 * dark) and a light jitter. Deliberately subtle. Shockwaves live entirely
 * on the effects canvas: no DOM nodes, no state churn — a single rAF loop
 * draws the active waves and stops when the last one dies out.
 */
const WAVE_STEP_MS = 34;
const WAVE_RADIUS = 22;
const WAVE_JITTER_MS = 120;
const WAVE_SKIP = 0.5;
const GLOW_ANIM_MS = 1000;

// One flashing cell of a shockwave.
type WaveCell = { col: number; row: number; delay: number; shade: string; peak: number };
type Wave = { start: number | null; maxDelay: number; cells: WaveCell[] };

type UseShockwaveArgs = {
    boardRef: RefObject<HTMLDivElement | null>;
    CELL: number;
    f: number;
    origin: { x: number; y: number };
    view: BoardView;
    theme: ThemeDerived;
    // A one-card share is a still: no arrival wave, no click ripple.
    enabled: boolean;
};

export const useShockwave = ({
    boardRef,
    CELL,
    f,
    origin,
    view,
    theme,
    enabled,
}: UseShockwaveArgs) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wavesRef = useRef<Wave[]>([]);
    const rafRef = useRef(0);
    // The draw loop reads geometry through refs — it must never close over a
    // stale origin/cell after a resize.
    const geometryRef = useRef({ CELL, f, origin });

    useEffect(() => {
        geometryRef.current = { CELL, f, origin };
    }, [CELL, f, origin]);

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    // Keep the effects canvas matched to the view (device-pixel sharp).
    useEffect(() => {
        const canvas = canvasRef.current;

        if (canvas && view.width) {
            const dpr = window.devicePixelRatio || 1;

            canvas.width = Math.round(view.width * dpr);
            canvas.height = Math.round(view.height * dpr);
        }
    }, [view.width, view.height]);

    const draw = (now: number) => {
        const canvas = canvasRef.current;
        const scroller = scrollerOf(boardRef);
        const ctx = canvas?.getContext('2d');

        if (!canvas || !scroller || !ctx) {
            rafRef.current = 0;

            return;
        }

        const { CELL: cell, f: factor, origin: o } = geometryRef.current;
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const left = scroller.scrollLeft;
        const top = scroller.scrollTop;

        for (const wave of wavesRef.current) {
            wave.start ??= now;

            for (const c of wave.cells) {
                const t = now - wave.start - c.delay;

                if (t < 0 || t > GLOW_ANIM_MS) {
                    continue;
                }

                const x = o.x + c.col * cell - left;
                const y = o.y + c.row * cell - top;

                if (x < -cell || y < -cell || x > width || y > height) {
                    continue;
                }

                // Quick rise to the peak at 25%, then a long decay.
                const progress = t / GLOW_ANIM_MS;
                const envelope = progress < 0.25 ? progress / 0.25 : 1 - (progress - 0.25) / 0.75;

                ctx.globalAlpha = c.peak * envelope;
                ctx.fillStyle = c.shade;
                ctx.beginPath();
                ctx.roundRect(x, y, cell, cell, 4 * factor);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
        wavesRef.current = wavesRef.current.filter(
            (wave) => wave.start === null || now - wave.start <= wave.maxDelay + GLOW_ANIM_MS,
        );
        rafRef.current = wavesRef.current.length ? requestAnimationFrame(draw) : 0;
    };

    // The shockwave: every sampled cell inside the radius (an optional rect —
    // the card's own footprint — excluded) flashes when the wavefront reaches
    // it; delay is pure distance from the epicentre.
    const spawnWave = (centerCol: number, centerRow: number, exclude?: Rect) => {
        if (!enabled) {
            return;
        }

        const cells: WaveCell[] = [];

        // No lower clamp: the partial cells at the sheet's top/left edges
        // (the pattern-alignment offset strip) flash too, so the wave runs
        // all the way to the canvas border — the per-frame culling drops
        // anything truly off-screen.
        for (let col = Math.floor(centerCol - WAVE_RADIUS); col <= centerCol + WAVE_RADIUS; col++) {
            for (
                let row = Math.floor(centerRow - WAVE_RADIUS);
                row <= centerRow + WAVE_RADIUS;
                row++
            ) {
                const excluded =
                    !!exclude &&
                    col >= exclude.col &&
                    col < exclude.col + exclude.w &&
                    row >= exclude.row &&
                    row < exclude.row + exclude.h;
                const dist = Math.hypot(col + 0.5 - centerCol, row + 0.5 - centerRow);

                if (excluded || dist > WAVE_RADIUS || Math.random() < WAVE_SKIP) {
                    continue;
                }

                cells.push({
                    col,
                    row,
                    delay: dist * WAVE_STEP_MS + Math.random() * WAVE_JITTER_MS,
                    shade: theme.glow[Math.floor(Math.random() * theme.glow.length)]!,
                    // The wave dies down with distance.
                    peak: dist > WAVE_RADIUS * 0.55 ? 0.18 : 0.4,
                });
            }
        }

        wavesRef.current.push({
            start: null,
            maxDelay: WAVE_RADIUS * WAVE_STEP_MS + WAVE_JITTER_MS,
            cells,
        });

        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(draw);
        }
    };

    return { canvasRef, spawnWave };
};
