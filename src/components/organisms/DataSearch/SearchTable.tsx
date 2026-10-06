/* eslint-disable @typescript-eslint/no-explicit-any -- deliberately shallow engine-contract layer (see lib/search/types.ts for the full mirror) */
'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
import { useIsPhone } from '@/hooks/useMediaQuery';
import {
    flattenPartsRows,
    formatCount,
    formatValue,
    methodCellText,
    observationCount,
    observationsOmissionText,
    observationsPendingText,
    PartResultRow,
    PreviewColumn,
    previewCellText,
    previewColumns,
    resolveObservationsOmission,
} from '@/lib/search/view';
import { tableCaptionNotes } from '@/lib/search/resultNotes';
import type { Warning } from '@/lib/search/types';

type TablePart = {
    index: number;
    variableText: string | null;
    spec: any;
    warnings?: Pick<Warning, 'code' | 'message' | 'params'>[];
};

const PAGE = 10;

// Phone: a little air past the widest cell of each column.
const PHONE_CELL_PAD = 12;

// One preview table over every definite part, in part order: a leading
// Variable column names each row's own part, hidden with a single part
// (the single-variable page's table stays exactly as it always has).
const SearchTable = ({
    parts,
    observationsPending,
}: {
    parts: TablePart[];
    // True while a definite part's observations may still arrive (the base
    // run hasn't reached `done`, or an edit post is in flight). An empty
    // table under this flag is a fetch not yet settled, not a verdict that
    // the slice has nothing, so it shows the pending line instead of the
    // omission copy.
    observationsPending?: boolean;
}) => {
    const [openPages, setOpenPages] = useState(1);
    // Phone: nothing wraps — the columns take their content's width, the rows
    // scroll sideways, and the sticky header (a clone kept OUTSIDE the scroll
    // box, or it couldn't stick to the viewport) follows the scroll. The
    // shared column template comes from measuring the cells (header included).
    const phone = useIsPhone();
    const bodyRef = useRef<HTMLDivElement>(null);
    const headRef = useRef<HTMLDivElement>(null);
    const [phoneTemplate, setPhoneTemplate] = useState<string | null>(null);

    useEffect(() => {
        const body = bodyRef.current;

        if (!phone || !body) {
            setPhoneTemplate(null);

            return;
        }

        const measure = () => {
            const widths: number[] = [];

            // The TEXT's width (a range over the cell's contents), not the
            // cell's — the cell is already as wide as its track.
            const range = document.createRange();

            body.querySelectorAll<HTMLElement>('[data-col]').forEach((cell) => {
                const col = Number(cell.dataset.col);

                range.selectNodeContents(cell);
                widths[col] = Math.max(widths[col] ?? 0, range.getBoundingClientRect().width);
            });

            if (widths.length) {
                setPhoneTemplate(
                    widths.map((w) => `minmax(${Math.ceil(w) + PHONE_CELL_PAD}px, 1fr)`).join(' '),
                );
            }
        };
        const observer = new ResizeObserver(measure);

        measure();
        observer.observe(body);

        return () => observer.disconnect();
    }, [phone, parts, openPages]);

    // The clone rides along with the rows' sideways scroll.
    const syncHead = () => {
        if (headRef.current && bodyRef.current) {
            headRef.current.style.translate = `${-bodyRef.current.scrollLeft}px 0`;
        }
    };

    const multi = parts.length > 1;
    // Part order, then each part's own existing sort within it — nothing is
    // re-sorted across parts.
    const rows: PartResultRow[] = flattenPartsRows(parts);
    const total =
        parts.reduce((sum, part) => sum + (observationCount(part.spec) ?? 0), 0) || rows.length;

    if (rows.length === 0) {
        // An empty table while observations may still arrive is not yet a
        // verdict, so this shows the pending line instead of the omission
        // copy.
        if (observationsPending) {
            return (
                <div className={styles.results}>
                    <p className={styles.resultsTitle}>Results Preview</p>
                    <p className={styles.resultsEmpty}>{observationsPendingText}</p>
                </div>
            );
        }

        // Coverage above can show real observations exist even when the
        // preview comes back empty. An empty preview can mean the fetch was
        // withheld or failed, not that the slice has no data.
        // resolveObservationsOmission reads the engine's own typed reason
        // (spec.observations.omitted where present, a part's own warning
        // codes otherwise), and observationsOmissionText turns it into copy
        // that matches what happened.
        const omission = resolveObservationsOmission(parts);

        return (
            <div className={styles.results}>
                <p className={styles.resultsTitle}>Results Preview</p>
                <p className={styles.resultsEmpty}>{observationsOmissionText(omission, total)}</p>
            </div>
        );
    }

    // One unit across every row → it goes in the header; mixed → per cell.
    const units = new Set(rows.map((row) => row.unit).filter(Boolean));
    const sharedUnit = units.size === 1 ? [...units][0] : null;

    // Entity and axis columns over every part (previewColumns hides the ones
    // the sentence already states); Method shows when some row states one.
    const columns: PreviewColumn[] = [
        ...(multi ? [{ key: 'variable', label: 'Variable' }] : []),
        { key: 'year', label: 'Year' },
        ...previewColumns(parts),
        ...(rows.some((row) => row.method != null) ? [{ key: 'method', label: 'Method' }] : []),
        { key: 'value', label: sharedUnit ? `Value (${sharedUnit})` : 'Value' },
    ];

    const cellText = (row: PartResultRow, key: string): string => {
        switch (key) {
            case 'variable':
                return row.variable;
            case 'year':
                return row.year;
            case 'method':
                return methodCellText(row);
            case 'value':
                return `${formatValue(row.value)}${
                    !sharedUnit && row.unit && row.value != null ? ` ${row.unit}` : ''
                }`;
            default:
                return previewCellText(row, key);
        }
    };

    // ONE template shared by every row (per-row auto tracks are what staggered
    // the columns before): equal tracks, so however many columns survive the
    // filter they sit at even intervals across the width, value right-aligned
    // in the last one.
    const gridTemplate = {
        gridTemplateColumns:
            phone && phoneTemplate ? phoneTemplate : `repeat(${columns.length}, minmax(0, 1fr))`,
    };

    const renderRows = (chunk: PartResultRow[], offset: number) =>
        chunk.map((row, index) => (
            <div key={offset + index} className={styles.tableRow} style={gridTemplate}>
                {columns.map((column, col) => (
                    <span
                        key={column.key}
                        data-col={col}
                        className={column.key === 'value' ? styles.usd : undefined}
                    >
                        {cellText(row, column.key)}
                    </span>
                ))}
            </div>
        ));

    const pages: PartResultRow[][] = [];

    for (let i = 0; i < rows.length; i += PAGE) {
        pages.push(rows.slice(i, i + PAGE));
    }

    const shown = Math.min(openPages * PAGE, rows.length);

    // The caption gives rows per variable once there is more than one.
    const byVariable = multi
        ? parts
              .map(
                  (part) =>
                      `${part.variableText ?? part.spec?.shape?.label ?? '—'} ${formatCount(flattenPartsRows([part]).length)}`,
              )
              .join(' · ')
        : null;

    return (
        <div className={styles.results}>
            <p className={styles.resultsTitle}>
                {`Results Preview ${formatCount(shown)} of ${formatCount(total)}`}
                {byVariable && <span className={styles.resultsByVariable}> — {byVariable}</span>}
            </p>
            {tableCaptionNotes(parts).map((caption) => (
                <p key={caption} className={styles.resultsCaption}>
                    {caption}
                </p>
            ))}
            <div className={styles.table}>
                {/* The sticky header. On phone it's the visible clone of the
                    row measured inside the scroll box below. */}
                <div className={styles.tableHeadStick}>
                    <div
                        ref={headRef}
                        className={classNames(styles.tableRow, styles.tableHead)}
                        style={gridTemplate}
                    >
                        {columns.map((column) => (
                            <span
                                key={column.key}
                                className={column.key === 'value' ? styles.usd : undefined}
                            >
                                {column.label}
                            </span>
                        ))}
                    </div>
                </div>
                <div ref={bodyRef} className={styles.tableBody} onScroll={syncHead}>
                    {/* Phone only (hidden, zero height): the header's labels
                        take part in the column measurement. */}
                    {phone && (
                        <div
                            className={classNames(styles.tableRow, styles.tableHeadGhost)}
                            style={gridTemplate}
                            aria-hidden="true"
                        >
                            {columns.map((column, col) => (
                                <span key={column.key} data-col={col}>
                                    {column.label}
                                </span>
                            ))}
                        </div>
                    )}
                    {renderRows(pages[0], 0)}
                    {pages.slice(1).map((page, index) => (
                        <div
                            key={index + 1}
                            className={classNames(
                                styles.accordion,
                                index + 1 < openPages && styles.accordionOpen,
                            )}
                        >
                            <div className={styles.accordionInner}>
                                {renderRows(page, (index + 1) * PAGE)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {openPages < pages.length && (
                <div className={styles.loadMore}>
                    <Button variant="outline" onClick={() => setOpenPages((value) => value + 1)}>
                        Load more
                    </Button>
                </div>
            )}
        </div>
    );
};

export default SearchTable;
