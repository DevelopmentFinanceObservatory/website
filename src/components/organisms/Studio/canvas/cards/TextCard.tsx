'use client';

import classNames from 'classnames';
import { useCallback, useRef } from 'react';

import styles from './Card.module.scss';
import CardHead from './CardHead';
import type { CardExtras } from './types';
import { cardEdges, type Fit, useFittedRows } from './useFittedRows';

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
    const cardRef = useRef<HTMLElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);

    const measure = useCallback((card: HTMLElement, cell: number): Fit | null => {
        const inner = innerRef.current;

        if (!inner) {
            return null;
        }

        const edges = cardEdges(getComputedStyle(card), 'vertical');
        const chrome = edges.padding + edges.border;
        // offsetHeight, NOT getBoundingClientRect (the lift transform
        // inflates the bounding box). A fifth of a cell of slack absorbs
        // fluid rounding.
        const need = (inner.offsetHeight + chrome) / cell;

        return { rows: Math.max(1, Math.ceil(need - 0.2)), settled: true };
    }, []);

    // Measured on mount and whenever the text or title changes.
    useFittedRows({
        cardRef,
        widthCells,
        token: `${extras.title}\u0000${widget.body}`,
        measure,
        onFit,
    });

    return (
        <article ref={cardRef} className={classNames(styles.card, styles.cardText)}>
            <div ref={innerRef} className={styles.textInner}>
                <CardHead {...extras} />
                <p className={styles.textBody}>{widget.body}</p>
            </div>
        </article>
    );
};

export default TextCard;
