'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { gridCell } from '@/hooks/useGridCell';

// What a card's measurement came to. `settled` is false for a reading the
// card expects to improve on (see ChartCard). It is reported, and the card
// measures again on the next change.
export type Fit = { rows: number; settled: boolean };

type FittedRows<TReading> = {
    cardRef: RefObject<HTMLElement | null>;
    widthCells: number;
    // Everything the measurement depends on, as one value that changes when
    // any of it does.
    token: unknown;
    // The rows the card needs at this cell, or null while it cannot tell.
    // `reading` is the last one the card handed in (see below).
    measure: (card: HTMLElement, cell: number, reading: TReading | null) => Fit | null;
    onFit: (rows: number) => void;
};

/** A card's padding and borders along one axis in px, from its computed
 *  style. */
export const cardEdges = (
    cs: CSSStyleDeclaration,
    axis: 'vertical' | 'horizontal',
): { padding: number; border: number } => {
    const px = (length: string): number => parseFloat(length) || 0;

    return axis === 'vertical'
        ? {
              padding: px(cs.paddingTop) + px(cs.paddingBottom),
              border: px(cs.borderTopWidth) + px(cs.borderBottomWidth),
          }
        : {
              padding: px(cs.paddingLeft) + px(cs.paddingRight),
              border: px(cs.borderLeftWidth) + px(cs.borderRightWidth),
          };
};

/**
 * A card whose height follows its content: measures it and reports the rows
 * through `onFit`, once per `token`. Rows are an invariant of the content.
 * Type and cell scale by the same factor, so a viewport change never changes
 * how many cells a card needs. Measuring again there only re-rounds (±1 row),
 * and a row is permanent for the neighbours it moves.
 *
 * Returns a function for a card whose content settles outside the DOM (a
 * chart's own layout): it takes a reading of that content, keeps it for
 * `measure`, and asks for a measurement on the next frame.
 */
export const useFittedRows = <TReading = never>({
    cardRef,
    widthCells,
    token,
    measure,
    onFit,
}: FittedRows<TReading>): ((reading: TReading) => void) => {
    // The latest callbacks, so the measuring effect doesn't re-subscribe on
    // every parent render (`onFit` is an inline arrow up there).
    const latest = useRef({ measure, onFit });

    useEffect(() => {
        latest.current = { measure, onFit };
    }, [measure, onFit]);

    const measuredFor = useRef<{ token: unknown } | null>(null);
    const queueRef = useRef<(() => void) | null>(null);
    const readingRef = useRef<TReading | null>(null);

    useEffect(() => {
        const card = cardRef.current;

        if (!card) {
            return;
        }

        const run = () => {
            const cell = gridCell();

            // Geometry must be consistent, so skip the transient frames where
            // rem type has re-wrapped while the slot still has the previous
            // cell's px width, and the slot's own width transition. The
            // observer calls again.
            if (Math.abs(card.offsetWidth - widthCells * cell) > 1.5) {
                return;
            }

            if (measuredFor.current && Object.is(measuredFor.current.token, token)) {
                return;
            }

            const fit = latest.current.measure(card, cell, readingRef.current);

            if (!fit) {
                return;
            }

            if (fit.settled) {
                measuredFor.current = { token };
            }

            latest.current.onFit(fit.rows);
        };

        let raf = 0;
        const queue = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(run);
        };
        const observer = new ResizeObserver(queue);

        queueRef.current = queue;
        queue();
        observer.observe(card);

        for (const child of card.children) {
            observer.observe(child);
        }

        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            queueRef.current = null;
        };
    }, [cardRef, widthCells, token]);

    return useCallback((reading: TReading) => {
        readingRef.current = reading;
        queueRef.current?.();
    }, []);
};

/**
 * Whether the page's font faces have loaded. Text measured on a canvas
 * before then is measured in the fallback face, and nothing measures it
 * again unless asked.
 */
export const useFontsReady = (): boolean => {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let mounted = true;

        const settle = async () => {
            await document.fonts.ready;

            if (mounted) {
                setReady(true);
            }
        };

        void settle();

        return () => {
            mounted = false;
        };
    }, []);

    return ready;
};
