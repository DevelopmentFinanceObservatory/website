'use client';

import classNames from 'classnames';
import { useCallback, useMemo, useRef } from 'react';

import styles from './Card.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';
import { cardEdges, type Fit, useFittedRows, useFontsReady } from './useFittedRows';

import type { KeyNumberWidget } from '@/lib/chat/widgets';
import { CARD_BORDERS } from '@/lib/studio/chartFit';
import { keyNumberFace } from '@/lib/studio/statFace';

// The stat card: one big number (a per cent sign lighter after it), one
// muted caption close under it (unit, price basis, period, change), then
// the source and the user's note. The card reports the rows its content
// needs; its slot grows to them and the grip stops there (useSlots' fitRows).
const KeyNumberCard = ({
    widget,
    widthCells,
    onFit,
    ...extras
}: {
    widget: KeyNumberWidget;
    widthCells: number;
    onFit: (rows: number) => void;
} & CardExtras) => {
    const { amount, suffix, caption } = keyNumberFace(widget);
    const cardRef = useRef<HTMLElement>(null);
    const fontsReady = useFontsReady();

    const measure = useCallback(
        (card: HTMLElement, cell: number): Fit | null => {
            // Text measured in the fallback face runs high, and the slot keeps
            // any row it grows by.
            if (!fontsReady) {
                return null;
            }

            const cs = getComputedStyle(card);
            // The borders count as a share of the cell (CARD_BORDERS), so the
            // rows come out the same at every cell size.
            let px =
                cardEdges(cs, 'vertical').padding +
                CARD_BORDERS * cell +
                (parseFloat(cs.rowGap) || 0) * (card.children.length - 1);

            // The foot's auto margin is spare space and is left out.
            for (const child of card.children) {
                px += parseFloat(getComputedStyle(child).height) || 0;
            }

            // A fifth of a cell of slack, as in TableCard and TextCard, falls
            // inside the card's bottom padding.
            return { rows: Math.max(1, Math.ceil(px / cell - 0.2)), settled: true };
        },
        [fontsReady],
    );
    const token = useMemo(
        () => ({
            widget,
            widthCells,
            title: extras.title,
            note: extras.note,
            fontsReady,
        }),
        [widget, widthCells, extras.title, extras.note, fontsReady],
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
