'use client';

import { useEffect, useRef } from 'react';

import cardStyles from './Card.module.scss';
import styles from './TableCard.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';

import type { TableWidget } from '@/lib/chat/widgets';

// A data table: sticky checkered header, the value column right-aligned.
const TableCard = ({ widget, ...extras }: { widget: TableWidget } & CardExtras) => {
    // Last column is the value — right-align it.
    const valueCol = widget.columns.length - 1;
    // The header strip is ONE checkered weave across all sticky cells: each
    // th shifts its tile origin left by its own offset, so the seams line
    // up. Measured after layout and on every resize of the card.
    const headRef = useRef<HTMLTableRowElement>(null);

    useEffect(() => {
        const row = headRef.current;

        if (!row) {
            return;
        }

        const align = () => {
            for (const cell of Array.from(row.cells)) {
                cell.style.backgroundPosition = `${-cell.offsetLeft}px 0`;
            }
        };
        const observer = new ResizeObserver(align);

        align();
        observer.observe(row);

        return () => observer.disconnect();
    }, [widget]);

    return (
        <article className={cardStyles.card}>
            <CardHead {...extras} />
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr ref={headRef}>
                            {widget.columns.map((column, index) => (
                                <th
                                    key={column}
                                    className={index === valueCol ? styles.numeric : undefined}
                                >
                                    {column}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {widget.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                    <td
                                        key={cellIndex}
                                        className={
                                            cellIndex === valueCol ? styles.numeric : undefined
                                        }
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <CardChrome
                source={widget.source}
                note={extras.note}
                info={widget.info}
                onInfo={extras.onInfo}
            />
        </article>
    );
};

export default TableCard;
