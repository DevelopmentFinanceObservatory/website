import { useLayoutEffect, useRef, useState } from 'react';

import { PLOT_RATIO } from '@/lib/studio/chartFit';

import { THRESHOLDS } from '../_lib/thresholds.ts';

import styles from './ServiceBars.module.scss';
import tipStyles from './ThresholdScatter.module.scss';

import type { Capacity, Creditor } from '../_data/types.ts';
import type { ServiceRatio } from '../_lib/thresholds.ts';

/** Creditor groups in stack order from the base, with the house palette's base colours. */
export const CREDITORS = [
    { key: 'multilateral', label: 'Multilateral', colour: '#6467de' },
    { key: 'imf', label: 'IMF', colour: '#463138' },
    { key: 'bilateral', label: 'Bilateral, excl. China', colour: '#f6935a' },
    { key: 'china', label: 'China', colour: '#bb6fdc' },
    { key: 'private', label: 'Private', colour: '#2a9d8f' },
] as const satisfies { key: Creditor; label: string; colour: string }[];

const MARGIN = { left: 26, right: 2, top: 6, bottom: 16 };
/** Room for "23% threshold" in 11px Outfit, with 4px either side. */
const LABEL_WIDTH = 78;

/**
 * Debt service in % of government revenue by creditor, one stacked bar a year; projected
 * years at 40% opacity, the active capacity's service threshold drawn and labelled.
 * Drawn at `width` pixels, with the plot box inside the margins at the DFO's 16:9.
 * Hovering a year's column shows its creditors, total and place against the threshold,
 * in the scatter's tooltip style.
 */
export const ServiceBars = ({
    rows,
    capacity,
    width,
}: {
    rows: ServiceRatio[];
    capacity: Capacity | null;
    width: number;
}) => {
    const [hovered, setHovered] = useState<number | null>(null);
    const tipRef = useRef<HTMLDivElement>(null);

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const height = Math.round(plotWidth / PLOT_RATIO) + MARGIN.top + MARGIN.bottom;

    const max = Math.max(30, ...rows.map((row) => row.ratio ?? 0)) * 1.1;
    const step = plotWidth / Math.max(rows.length, 1);
    const gap = Math.max(2, step * 0.22);
    const y = (v: number) =>
        height - MARGIN.bottom - (v / max) * (height - MARGIN.top - MARGIN.bottom);
    const gridlines = Array.from({ length: Math.ceil(max / 10) }, (_, i) => i * 10).filter(
        (v) => v < max,
    );
    const threshold = capacity === null ? null : THRESHOLDS.service[capacity];
    const barX = (i: number) => MARGIN.left + i * step + gap / 2;
    const hoveredRow = hovered === null ? undefined : rows[hovered];

    const anchor =
        hovered === null || hoveredRow === undefined
            ? null
            : { x: barX(hovered) + (step - gap) / 2, y: y(hoveredRow.ratio ?? 0) };
    const anchorX = anchor?.x ?? null;
    const anchorY = anchor?.y ?? null;

    useLayoutEffect(() => {
        const tip = tipRef.current;

        if (tip === null || anchorX === null || anchorY === null) {
            return;
        }

        const left = Math.min(Math.max(0, anchorX - tip.offsetWidth / 2), width - tip.offsetWidth);

        tip.style.left = `${Math.max(0, left)}px`;
        tip.style.top = `${Math.max(0, anchorY - 8 - tip.offsetHeight)}px`;
    }, [anchorX, anchorY, width]);

    if (width <= 0) {
        return null;
    }

    return (
        <div className={styles.wrap} onPointerLeave={() => setHovered(null)}>
            <svg
                className={styles.bars}
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                role="img"
                aria-label="Debt service as a share of government revenue by creditor, actual and projected"
            >
                {gridlines.map((v) => (
                    <g key={v}>
                        <line
                            x1={MARGIN.left}
                            x2={width - MARGIN.right}
                            y1={y(v)}
                            y2={y(v)}
                            className={styles.grid}
                        />
                        <text
                            x={MARGIN.left - 4}
                            y={y(v) + 4}
                            textAnchor="end"
                            className={styles.tick}
                        >
                            {v}%
                        </text>
                    </g>
                ))}
                {hovered !== null && (
                    <rect
                        x={MARGIN.left + hovered * step}
                        y={MARGIN.top}
                        width={step}
                        height={height - MARGIN.top - MARGIN.bottom}
                        className={styles.hoverBand}
                    />
                )}
                {rows.map((row, i) => {
                    const x = barX(i);
                    const barWidth = step - gap;
                    const parts = row.byCreditor;

                    return (
                        <g key={row.year}>
                            <g opacity={row.projected ? 0.4 : 1}>
                                {parts !== null && (
                                    <Stack parts={parts} x={x} width={barWidth} y={y} />
                                )}
                            </g>
                            {row.year % 2 === 0 && (
                                <text
                                    x={x + barWidth / 2}
                                    y={height - 3}
                                    textAnchor="middle"
                                    className={styles.tick}
                                >
                                    {row.year}
                                </text>
                            )}
                        </g>
                    );
                })}
                {threshold !== null && (
                    <>
                        <line
                            x1={MARGIN.left}
                            x2={width - MARGIN.right}
                            y1={y(threshold)}
                            y2={y(threshold)}
                            className={styles.threshold}
                        />
                        {/* At the left end, on a white backing, so no bar hides it. */}
                        <rect
                            x={MARGIN.left + 2}
                            y={y(threshold) - 16}
                            width={LABEL_WIDTH}
                            height={14}
                            rx={2}
                            className={styles.labelBacking}
                        />
                        <text x={MARGIN.left + 6} y={y(threshold) - 5} className={styles.label}>
                            {threshold}% threshold
                        </text>
                    </>
                )}
                {/* Full-height columns on top take the pointer, so a short bar is easy to hit. */}
                {rows.map((row, i) =>
                    row.ratio === null ? null : (
                        <rect
                            key={row.year}
                            x={MARGIN.left + i * step}
                            y={MARGIN.top}
                            width={step}
                            height={height - MARGIN.top - MARGIN.bottom}
                            className={styles.hit}
                            onPointerEnter={() => setHovered(i)}
                        />
                    ),
                )}
            </svg>
            {hoveredRow !== undefined && hoveredRow.ratio !== null && (
                <BarTip
                    row={hoveredRow}
                    ratio={hoveredRow.ratio}
                    threshold={threshold}
                    tipRef={tipRef}
                />
            )}
        </div>
    );
};

/** One year's tooltip: the creditors from the top of the stack down, the total and the threshold. */
const BarTip = ({
    row,
    ratio,
    threshold,
    tipRef,
}: {
    row: ServiceRatio;
    ratio: number;
    threshold: number | null;
    tipRef: React.RefObject<HTMLDivElement | null>;
}) => {
    const parts = row.byCreditor;
    const shown = parts === null ? [] : CREDITORS.filter(({ key }) => parts[key] >= 0.05).reverse();

    return (
        <div ref={tipRef} className={tipStyles.tip} role="tooltip">
            <div className={tipStyles.tipTitle}>
                {row.year}
                {row.projected ? ', projected' : ''}
            </div>
            {parts !== null &&
                shown.map(({ key, label, colour }) => (
                    <div key={key} className={tipStyles.tipRow}>
                        <span className={styles.tipLabel}>
                            <span className={styles.tipSwatch} style={{ background: colour }} />
                            {label}
                        </span>
                        <span>{parts[key].toFixed(1)}%</span>
                    </div>
                ))}
            <div className={`${tipStyles.tipRow} ${tipStyles.tipThresholds}`}>
                <span>Total, % of revenue</span>
                <b>{ratio.toFixed(1)}%</b>
            </div>
            {threshold !== null && (
                <div className={tipStyles.tipRow}>
                    <span>{ratio > threshold ? 'Above' : 'Below'} the threshold</span>
                    <span>{threshold}%</span>
                </div>
            )}
        </div>
    );
};

const Stack = ({
    parts,
    x,
    width,
    y,
}: {
    parts: Record<Creditor, number>;
    x: number;
    width: number;
    y: (v: number) => number;
}) => {
    const top = CREDITORS.findLastIndex(({ key }) => parts[key] > 0);
    let sum = 0;

    return CREDITORS.map(({ key, colour }, index) => {
        const from = sum;
        sum += parts[key];

        return (
            <rect
                key={key}
                x={x}
                y={y(sum)}
                width={width}
                height={Math.max(0, y(from) - y(sum))}
                rx={index === top ? 1.5 : 0}
                fill={colour}
            />
        );
    });
};
