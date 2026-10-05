'use client';

import classNames from 'classnames';
import { useEffect, useRef } from 'react';

import styles from './Card.module.scss';
import CardHead from './CardHead';
import type { CardExtras } from './types';

import { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import type { TextWidget } from '@/lib/chat/widgets';

// A user note: title + body, no chrome bar (nothing to source or attribute).
// Its height follows the content: the card measures its natural (unclipped)
// height after layout and asks the sheet for that many cells — no resize.
const TextCard = ({
    widget,
    widthCells,
    onFit,
    ...extras
}: {
    widget: TextWidget;
    widthCells: number;
    onFit: (rows: number) => void;
} & CardExtras) => {
    const innerRef = useRef<HTMLDivElement>(null);
    // Latest reporter, so the measuring effect doesn't re-subscribe on every
    // parent render (the callback is an inline arrow up there).
    const onFitRef = useRef(onFit);

    useEffect(() => {
        onFitRef.current = onFit;
    }, [onFit]);

    // Rows are an invariant of the CONTENT: type and cell scale by the same
    // root factor, so a viewport change never changes how many cells the
    // text needs — re-measuring there only re-rounds (±1 row) and nudges
    // neighbours. Measure on mount and whenever the text/title changes; the
    // consistency guard skips transient frames (rem type re-wrapped while the
    // slot still has the previous cell's px width). Fonts arriving late are
    // the one legitimate late change — the ResizeObserver covers that, but
    // only while the geometry is consistent.
    const measuredForRef = useRef<string | null>(null);

    useEffect(() => {
        const inner = innerRef.current;

        if (!inner) {
            return;
        }

        const contentKey = `${extras.title}\u0000${widget.body}`;

        const measure = () => {
            const card = inner.parentElement;

            if (!card) {
                return;
            }

            const liveCell =
                (GRID_CELL * parseFloat(getComputedStyle(document.documentElement).fontSize)) / 16;

            // Geometry must be consistent (see above) — otherwise wait for
            // the observer's next call.
            if (!liveCell || Math.abs(card.offsetWidth - widthCells * liveCell) > 1.5) {
                return;
            }

            // Once measured for this content, done — viewport changes keep
            // the row count.
            if (measuredForRef.current === contentKey) {
                return;
            }

            const cs = getComputedStyle(card);
            const chrome =
                parseFloat(cs.paddingTop) +
                parseFloat(cs.paddingBottom) +
                parseFloat(cs.borderTopWidth) +
                parseFloat(cs.borderBottomWidth);
            // offsetHeight, NOT getBoundingClientRect (the lift transform
            // inflates the bounding box). A fifth of a cell of slack absorbs
            // fluid rounding.
            const need = (inner.offsetHeight + chrome) / liveCell;

            measuredForRef.current = contentKey;
            onFitRef.current(Math.max(1, Math.ceil(need - 0.2)));
        };

        let raf = 0;
        const queue = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(measure);
        };
        const observer = new ResizeObserver(queue);

        queue();
        observer.observe(inner);

        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
        };
    }, [widthCells, widget.body, extras.title]);

    return (
        <article className={classNames(styles.card, styles.cardText)}>
            <div ref={innerRef} className={styles.textInner}>
                <CardHead {...extras} />
                <p className={styles.textBody}>{widget.body}</p>
            </div>
        </article>
    );
};

export default TextCard;
