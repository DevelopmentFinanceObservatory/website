'use client';

import classNames from 'classnames';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import cardStyles from './Card.module.scss';
import styles from './TableCard.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';
import { cardEdges, type Fit, useFittedRows, useFontsReady } from './useFittedRows';

import Icon from '@/components/atoms/Icon/Icon';
import type { TableWidget } from '@/lib/chat/widgets';
import { TABLE_ROWS_COLLAPSED, tableDisplay } from '@/lib/studio/tableFit';
import { repeatedNames, sortOrder, type TableSort } from '@/lib/studio/tableView';

// The px an element takes in the card's column: its used height (fractional,
// where offsetHeight rounds and getBoundingClientRect takes in the lift
// transform) and its vertical margins.
const blockHeight = (element: Element | null): number => {
    if (!element) {
        return 0;
    }

    const cs = getComputedStyle(element);

    return (
        (parseFloat(cs.height) || 0) +
        (parseFloat(cs.marginTop) || 0) +
        (parseFloat(cs.marginBottom) || 0)
    );
};

// A data table: sticky checkered header, numbers right-aligned in tabular
// figures. Shared text sits in a caption above, each header sorts its
// column, and a name repeated down a run of rows shows once. Past
// TABLE_ROWS_COLLAPSED rows the card shows the first ones and a control to
// show them all.
//
// The card's height follows the table (lib/studio/tableFit estimates it at
// spawn): it measures its blocks and asks the sheet for that many cells
// through `onFit`. A table wider than the card scrolls sideways with its
// first column held in place and a fade on the right edge while more
// columns lie beyond it.
const TableCard = ({
    widget,
    widthCells,
    onFit,
    ...extras
}: {
    widget: TableWidget;
    widthCells: number;
    onFit: (rows: number) => void;
} & CardExtras) => {
    const { view } = useMemo(() => tableDisplay(widget), [widget]);
    const [sort, setSort] = useState<TableSort | null>(null);
    const [expanded, setExpanded] = useState(false);
    const order = useMemo(() => sortOrder(view.rows, view.numeric, sort), [view, sort]);
    const collapsible = view.rows.length > TABLE_ROWS_COLLAPSED;
    const shown = useMemo(
        () => (expanded ? order : order.slice(0, TABLE_ROWS_COLLAPSED)),
        [order, expanded],
    );
    const repeated = useMemo(() => repeatedNames(view, shown), [view, shown]);

    const cardRef = useRef<HTMLElement>(null);
    const captionRef = useRef<HTMLParagraphElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const moreRef = useRef<HTMLButtonElement>(null);
    const fontsReady = useFontsReady();

    // The table's own height in place of its wrap's, which is the slot's
    // leftover. Every other block keeps its own height whatever the card's.
    const measure = useCallback((card: HTMLElement, cell: number): Fit | null => {
        const frame = frameRef.current;
        const wrap = wrapRef.current;
        const table = tableRef.current;

        if (!frame || !wrap || !table) {
            return null;
        }

        const cs = getComputedStyle(card);
        const edges = cardEdges(cs, 'vertical');
        let px =
            edges.padding +
            edges.border +
            (parseFloat(cs.rowGap) || 0) * (card.children.length - 1);

        for (const child of card.children) {
            if (child !== frame) {
                // The caption and "Show all" pull into their gaps by negative
                // margins. The foot's auto margin is spare space and is left out.
                px +=
                    child === captionRef.current || child === moreRef.current
                        ? blockHeight(child)
                        : parseFloat(getComputedStyle(child).height) || 0;
            }
        }

        // A sideways scrollbar takes its own height under the table.
        const scrollbar =
            wrap.scrollWidth > wrap.clientWidth ? wrap.offsetHeight - wrap.clientHeight : 0;

        px += table.offsetHeight + scrollbar;

        // A fifth of a cell of slack absorbs fluid rounding (see TextCard).
        return { rows: Math.max(1, Math.ceil(px / cell - 0.2)), settled: true };
    }, []);

    // One value per set of measuring inputs. Sorting reorders rows of one
    // pitch, and a view switch remounts the card (see CardBody), so neither
    // is an input.
    const token = useMemo(
        () => ({ widget, widthCells, expanded, title: extras.title, fontsReady }),
        [widget, widthCells, expanded, extras.title, fontsReady],
    );

    useFittedRows({ cardRef, widthCells, token, measure, onFit });

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

    // Whether more columns lie to the right of what the wrap shows, and the
    // height of its sideways scrollbar, which the fade stops above.
    const [fade, setFade] = useState<{ right: boolean; scrollbar: number }>({
        right: false,
        scrollbar: 0,
    });

    useEffect(() => {
        const wrap = wrapRef.current;
        const table = tableRef.current;

        if (!wrap || !table) {
            return;
        }

        const update = () => {
            const right = wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1;
            const scrollbar = wrap.offsetHeight - wrap.clientHeight;

            setFade((current) =>
                current.right === right && current.scrollbar === scrollbar
                    ? current
                    : { right, scrollbar },
            );
        };
        const observer = new ResizeObserver(update);

        update();
        observer.observe(wrap);
        observer.observe(table);
        wrap.addEventListener('scroll', update, { passive: true });

        return () => {
            observer.disconnect();
            wrap.removeEventListener('scroll', update);
        };
    }, []);

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
        <article ref={cardRef} className={cardStyles.card}>
            <CardHead {...extras} />
            {view.caption && (
                <p ref={captionRef} className={styles.caption}>
                    {view.caption.lead && <b>{view.caption.lead}</b>}
                    {view.caption.lead && view.caption.details.length > 0 && <br />}
                    {view.caption.details.join(' · ')}
                </p>
            )}
            <div
                ref={frameRef}
                className={classNames(styles.tableFrame, fade.right && styles.fadeRight)}
                style={{ '--scrollbar': `${fade.scrollbar}px` } as React.CSSProperties}
            >
                <div ref={wrapRef} className={styles.tableWrap}>
                    <table ref={tableRef} className={styles.table}>
                        <thead>
                            <tr ref={headRef}>
                                {view.columns.map((column, index) => {
                                    const direction =
                                        sort?.column === index ? sort.direction : undefined;

                                    return (
                                        <th key={index} aria-sort={direction}>
                                            <button
                                                type="button"
                                                className={styles.sort}
                                                // A chart shown as a table
                                                // leaves its names' header
                                                // blank. The aria-label names
                                                // the column.
                                                aria-label={
                                                    column
                                                        ? undefined
                                                        : index === view.namesColumn
                                                          ? 'Series'
                                                          : 'Category'
                                                }
                                                onClick={() => sortBy(index)}
                                            >
                                                <span>{column}</span>
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
                            {shown.map((rowIndex, at) => (
                                <tr key={rowIndex}>
                                    {view.rows[rowIndex]!.map((cell, cellIndex) => (
                                        <td
                                            key={cellIndex}
                                            // A row label can end in an
                                            // ellipsis, so its title holds
                                            // it whole.
                                            title={
                                                cell.full ??
                                                (cellIndex === 0 ? cell.text : undefined)
                                            }
                                        >
                                            {/* A name repeating the row above is hidden from
                                                the eye only, so each row still reads whole. */}
                                            {cellIndex === 0 ? (
                                                <span
                                                    className={
                                                        repeated[at] ? styles.repeat : styles.label
                                                    }
                                                >
                                                    {cell.text}
                                                </span>
                                            ) : (
                                                cell.text
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {collapsible && (
                <button
                    ref={moreRef}
                    type="button"
                    className={styles.more}
                    aria-expanded={expanded}
                    data-no-export=""
                    onClick={() => setExpanded((open) => !open)}
                >
                    {expanded ? 'Show fewer' : `Show all ${view.rows.length} rows`}
                    <Icon
                        name="chevron-down"
                        className={classNames(styles.moreChevron, expanded && styles.moreOpen)}
                    />
                </button>
            )}
            <CardChrome source={widget.source} info={widget.info} onInfo={extras.onInfo} />
        </article>
    );
};

export default TableCard;
