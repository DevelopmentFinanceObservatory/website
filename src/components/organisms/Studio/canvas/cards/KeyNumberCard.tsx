'use client';

import classNames from 'classnames';
import { useCallback, useMemo, useRef } from 'react';

import styles from './Card.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';
import { cardEdges, type Fit, useFittedRows, useFontsReady } from './useFittedRows';

import type { KeyNumberWidget } from '@/lib/chat/widgets';
import { keyNumberFace } from '@/lib/studio/statFace';

// The stat card: one big number (a per cent sign lighter after it), one
// muted caption close under it (unit, price basis, period, change), then
// the source and the user's note. Its height is its kind's or the user's,
// and a source line or note taller than that room grows the card to fit it.
const KeyNumberCard = ({
    widget,
    widthCells,
    heightCells,
    onFit,
    ...extras
}: {
    widget: KeyNumberWidget;
    widthCells: number;
    heightCells?: number;
    onFit: (rows: number) => void;
} & CardExtras) => {
    const { amount, suffix, caption } = keyNumberFace(widget);
    const cardRef = useRef<HTMLElement>(null);
    const fontsReady = useFontsReady();

    const measure = useCallback(
        (card: HTMLElement, cell: number): Fit | null => {
            const cs = getComputedStyle(card);
            const edges = cardEdges(cs, 'vertical');
            let px =
                edges.padding +
                edges.border +
                (parseFloat(cs.rowGap) || 0) * (card.children.length - 1);

            // The foot's auto margin is spare space and is left out.
            for (const child of card.children) {
                px += parseFloat(getComputedStyle(child).height) || 0;
            }

            // A hundredth of a cell of slack absorbs float noise. Any more would
            // clip the note's last line, since the card only grows.
            const need = Math.ceil(px / cell - 0.01);

            return { rows: Math.max(need, heightCells ?? need), settled: true };
        },
        [heightCells],
    );
    const token = useMemo(
        () => ({
            widget,
            widthCells,
            heightCells,
            title: extras.title,
            note: extras.note,
            fontsReady,
        }),
        [widget, widthCells, heightCells, extras.title, extras.note, fontsReady],
    );

    useFittedRows({ cardRef, widthCells, token, measure, onFit });

    return (
        <article ref={cardRef} className={classNames(styles.card, styles.cardStat)}>
            <CardHead {...extras} />
            <div className={styles.keyFace}>
                <p className={styles.keyNumber}>
                    {amount}
                    {suffix && <span className={styles.keySuffix}>{suffix}</span>}
                </p>
                {caption && <p className={styles.keyContext}>{caption}</p>}
            </div>
            <CardChrome
                source={widget.source}
                info={widget.info}
                onInfo={extras.onInfo}
                note={extras.note}
            />
        </article>
    );
};

export default KeyNumberCard;
