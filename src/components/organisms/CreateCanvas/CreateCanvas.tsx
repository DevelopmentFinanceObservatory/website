'use client';

import classNames from 'classnames';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import styles from './CreateCanvas.module.scss';
import { gridFor, SCALE } from './grid';

import Button from '@/components/atoms/Button/Button';
import GridPattern from '@/components/atoms/GridPattern/GridPattern';
import SectionHeading from '@/components/molecules/SectionHeading/SectionHeading';
import { useGridCell } from '@/hooks/useGridCell';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

// The showcase renders real Studio cards (Chart.js and all) — loaded after
// the page, browser-only, so the homepage's own bundle stays light.
const ShowcaseCards = dynamic(() => import('./ShowcaseCards'), { ssr: false });

type GridFill = {
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
    shade: string;
    leaving?: boolean;
    leftAt?: number;
};

const FILL_SHADES = ['#414141', '#4b4b4b', '#555', '#5f5f5f'];
const FILL_SIZES: [number, number][] = [
    [2, 2],
    [2, 4],
    [4, 2],
    [3, 2],
    [2, 3],
];
const FILL_MAX = 8;
const FILL_TICK_MS = 900;
const FILL_FADE_MS = 950;

const randomInt = (max: number) => Math.floor(Math.random() * max);

const randomFill = (id: number, cols: number, rows: number): GridFill => {
    const [w, h] = FILL_SIZES[randomInt(FILL_SIZES.length)]!;

    return {
        id,
        x: randomInt(cols - w),
        y: randomInt(rows - h),
        w,
        h,
        shade: FILL_SHADES[randomInt(FILL_SHADES.length)]!,
    };
};

const CreateCanvas = () => {
    const router = useRouter();
    const sectionRef = useReveal<HTMLElement>();
    const [fills, setFills] = useState<GridFill[]>([]);
    const reducedMotion = usePrefersReducedMotion();
    // The whiteboard's fluid cell, at the section's scale (see grid.ts).
    const cell = useGridCell() * SCALE;
    // The box, measured: below desktop it is as wide as the page allows, so
    // the sheet (cells, the copy's slot, where cards may land) follows it.
    const boxRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const box = boxRef.current;

        if (!box) {
            return;
        }

        const measure = (width: number, height: number) =>
            setSize((prev) =>
                prev.width === width && prev.height === height ? prev : { width, height },
            );

        // Once now (the observer's first call can wait a frame — or longer
        // in a background tab), then on every change of size.
        measure(box.clientWidth, box.clientHeight);

        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry!.contentRect;

            measure(width, height);
        });

        observer.observe(box);

        return () => observer.disconnect();
    }, []);

    const grid = gridFor(size.width, size.height, cell);
    // The fills' ticker reads the latest sheet without restarting.
    const gridRef = useRef(grid);

    useEffect(() => {
        gridRef.current = grid;
    }, [grid]);

    useEffect(() => {
        let nextId = 0;

        if (reducedMotion) {
            const frame = requestAnimationFrame(() =>
                setFills(
                    Array.from({ length: 4 }, () =>
                        randomFill(nextId++, gridRef.current.cols, gridRef.current.rows),
                    ),
                ),
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

                if (active.length < FILL_MAX && Math.random() < 0.8) {
                    next = [
                        ...next,
                        randomFill(nextId++, gridRef.current.cols, gridRef.current.rows),
                    ];
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
    }, [reducedMotion]);

    return (
        <section
            ref={sectionRef}
            id="content"
            className={styles.section}
            aria-labelledby="create-canvas-title"
            data-nav-dark="true"
        >
            <SectionHeading
                id="create-canvas-title"
                label="Create a Canvas"
                title="Turn development finance data into visualizations that inform and inspire"
                className={styles.headingBlock}
            />
            <div ref={boxRef} className={styles.canvas} data-reveal style={revealIndex(3)}>
                <div className={styles.patternClip} aria-hidden="true">
                    <div className={styles.patternLayer}>
                        <GridPattern variant="dark" cell={cell} />
                        {fills.map(({ id, x, y, w, h, shade, leaving }) => (
                            <span
                                key={id}
                                className={classNames(styles.fill, leaving && styles.fillOut)}
                                style={{
                                    left: x * cell,
                                    top: y * cell,
                                    width: w * cell,
                                    height: h * cell,
                                    backgroundColor: shade,
                                }}
                            />
                        ))}
                    </div>
                </div>
                {/* The copy holds a slot of its own on the grid, so the cards
                    are laid out around it like around any other widget. */}
                <div
                    className={styles.content}
                    data-reveal-group="trigger"
                    style={{
                        left: grid.copy.col * cell,
                        top: grid.copy.row * cell,
                        width: grid.copy.w * cell,
                        height: grid.copy.h * cell,
                    }}
                >
                    <p className={styles.description} data-reveal="text" style={revealIndex(0)}>
                        Work with AI agents on an interactive canvas to go from questions to
                        insights without weeks of data processing.
                    </p>
                    <div className={styles.actions}>
                        <Button
                            variant="dark"
                            data-reveal
                            style={revealIndex(1)}
                            onClick={() => router.push('/insights/gallery')}
                        >
                            Browse Gallery
                        </Button>
                        <Button
                            icon="arrow-up-right"
                            wide
                            data-reveal
                            style={revealIndex(2)}
                            onClick={() => router.push('/studio')}
                        >
                            Open Studio
                        </Button>
                    </div>
                </div>
                {grid.cols > 0 && <ShowcaseCards key={`${grid.cols}x${grid.rows}`} grid={grid} />}
            </div>
        </section>
    );
};

export default CreateCanvas;
