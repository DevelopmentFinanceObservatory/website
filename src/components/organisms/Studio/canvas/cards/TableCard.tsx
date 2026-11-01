'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import cardStyles from './Card.module.scss';
import styles from './TableCard.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';

import type { TableWidget } from '@/lib/chat/widgets';
import { sortOrder, type TableSort, tableView } from '@/lib/studio/tableView';

// A data table: sticky checkered header, the value column right-aligned.
// Shared text sits in a caption above, and each header sorts its column.
const TableCard = ({ widget, ...extras }: { widget: TableWidget } & CardExtras) => {
    const view = useMemo(
        () => tableView(widget.columns, widget.rows, widget.namesColumn),
        [widget],
    );
    const [sort, setSort] = useState<TableSort | null>(null);
    const order = useMemo(() => sortOrder(view.rows, view.numeric, sort), [view, sort]);
    // Last column is the value — right-align it.
    const valueCol = view.columns.length - 1;
    // The header strip is ONE checkered weave across all sticky cells: each
    // th shifts its tile origin left by its own offset, so the seams line
    // up. Measured after layout and on every resize of the card. Sorting
    // reorders rows only, so the column offsets hold.
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
    }, [view]);

    // A first press sorts up, a second down.
    const sortBy = (column: number) =>
        setSort((current) => ({
            column,
            direction:
                current?.column === column && current.direction === 'ascending'
                    ? 'descending'
                    : 'ascending',
        }));

    return (
        <article className={cardStyles.card}>
            <CardHead {...extras} />
            {view.caption && (
                <p className={styles.caption}>
                    {view.caption.lead && <b>{view.caption.lead}</b>}
                    {view.caption.lead && view.caption.details.length > 0 && <br />}
                    {view.caption.details.join(' · ')}
                </p>
            )}
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr ref={headRef}>
                            {view.columns.map((column, index) => {
                                const direction =
                                    sort?.column === index ? sort.direction : undefined;

                                return (
                                    <th
                                        key={index}
                                        aria-sort={direction}
                                        className={index === valueCol ? styles.numeric : undefined}
                                    >
                                        <button
                                            type="button"
                                            className={styles.sort}
                                            // A chart shown as a table leaves
                                            // its names' header blank. The
                                            // aria-label names the column.
                                            aria-label={
                                                column
                                                    ? undefined
                                                    : index === view.namesColumn
                                                      ? 'Series'
                                                      : 'Category'
                                            }
                                            onClick={() => sortBy(index)}
                                        >
                                            {column}
                                            <span className={styles.arrow} aria-hidden>
                                                {direction === 'descending' ? '↓' : '↑'}
                                            </span>
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {order.map((rowIndex) => (
                            <tr key={rowIndex}>
                                {view.rows[rowIndex]!.map((cell, cellIndex) => (
                                    <td
                                        key={cellIndex}
                                        title={cell.full}
                                        className={
                                            cellIndex === valueCol ? styles.numeric : undefined
                                        }
                                    >
                                        {cell.text}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <CardChrome source={widget.source} info={widget.info} onInfo={extras.onInfo} />
        </article>
    );
};

export default TableCard;
