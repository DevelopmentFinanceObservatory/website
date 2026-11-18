'use client';

import { ChartKey, type KeyRow } from './ChartKey';
import styles from './Chart.module.scss';
import { WithSide } from './Panel';
import { useWidth } from './useWidth';
import { useYearReading } from './useYearReading';

import { stackExtent, valueTicks, type Layer } from '../_lib/chart.ts';
import { formatTick } from '../_lib/format.ts';

import { PLOT_RATIO } from '@/lib/studio/chartFit';

const MARGIN = { left: 48, right: 8, top: 10, bottom: 24 };
/** The narrowest gap between labelled years. */
const MIN_LABEL_PITCH = 34;
const BAR_SHARE = 0.68;

/** A segment's base and end in value units; a missing value has both at the stack's edge. */
type Segment = { key: string; colour: string; from: number; to: number };

/**
 * Every layer's segment in one year, one per layer so each rect stays mounted: positive
 * values stack up from 0, negative down, and a missing value has no height.
 */
const stack = (layers: readonly Layer[], index: number): Segment[] => {
    let up = 0;
    let down = 0;

    return layers.map((layer) => {
        const value = layer.values[index] ?? 0;
        const from = value >= 0 ? up : down;
        const to = from + value;

        if (value >= 0) {
            up = to;
        } else {
            down = to;
        }

        return { key: layer.key, colour: layer.colour, from, to };
    });
};

/**
 * Stacked bars by year: positive layers above the axis, negative below, in layer order
 * from the axis out. Hovering, tapping or the arrow keys read one year in the key beside
 * the chart. Every bar is a unit square placed and sized by a CSS transform.
 */
export const StackedBars = ({
    years,
    layers,
    keyRows,
    summary,
    emptyLine,
}: {
    years: readonly number[];
    layers: readonly Layer[];
    /** The key's rows for the year at an index. */
    keyRows: (index: number) => KeyRow[];
    /** The chart's accessible description, before the year read. */
    summary: string;
    /** A line drawn in the plot when no layer holds a figure. */
    emptyLine: string | null;
}) => {
    const [wrapRef, width] = useWidth();
    const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
    const pitch = years.length > 0 ? plotWidth / years.length : 0;
    const lastIndex = years.length - 1;
    const { reading, shown, onPointer, onPointerLeave, onKeyDown, clear } = useYearReading(
        years.length,
        lastIndex,
        (x) => Math.floor((x - MARGIN.left) / Math.max(pitch, 1)),
    );

    const { low, high } = stackExtent(layers);
    const ticks = valueTicks(low, high);
    const yMin = ticks[0] ?? 0;
    const yMax = ticks.at(-1) ?? 1;
    const height = Math.round(plotWidth / PLOT_RATIO) + MARGIN.top + MARGIN.bottom;
    const plot = { top: MARGIN.top, bottom: height - MARGIN.bottom, right: width - MARGIN.right };
    const sy = (value: number) =>
        plot.bottom - ((value - yMin) / (yMax - yMin)) * (plot.bottom - plot.top);
    const sx = (index: number) => MARGIN.left + pitch * (index + 0.5);
    const barWidth = Math.max(2, pitch * BAR_SHARE);
    const labelStep = Math.max(1, Math.ceil(MIN_LABEL_PITCH / Math.max(pitch, 1)));

    const rows = keyRows(shown);
    const shownYear = years[shown] ?? 0;
    const read = rows.map((row) => `${row.label} ${row.value}`).join('; ');
    const label =
        `${summary} In ${shownYear}: ${read}. ` +
        'Use the left and right arrow keys to read each year.';

    return (
        <WithSide side={<ChartKey year={shownYear} rows={rows} />}>
            <div ref={wrapRef} className={styles.wrap}>
                {width > 0 && (
                    <svg
                        className={styles.svg}
                        width={width}
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        role="img"
                        aria-label={label}
                        tabIndex={0}
                        onKeyDown={onKeyDown}
                        onBlur={clear}
                        onPointerMove={onPointer}
                        onPointerDown={onPointer}
                        onPointerLeave={onPointerLeave}
                    >
                        <g aria-hidden="true">
                            <rect
                                className={styles.column}
                                x={-0.5}
                                width={1}
                                height={1}
                                style={{
                                    transform: `translate(${sx(shown)}px, ${plot.top}px) scale(${pitch}, ${plot.bottom - plot.top})`,
                                    opacity: reading === null ? 0 : 1,
                                }}
                            />
                            {ticks.map((tick, index) => (
                                // Gridlines are keyed by place, so they move when the scale changes;
                                // labels are keyed by text, so a new one remounts.
                                <g
                                    key={index}
                                    className={styles.mark}
                                    style={{ transform: `translateY(${sy(tick)}px)` }}
                                >
                                    <line
                                        x1={MARGIN.left}
                                        x2={plot.right}
                                        className={tick === 0 ? styles.zero : styles.grid}
                                    />
                                    <text
                                        key={formatTick(tick)}
                                        x={MARGIN.left - 6}
                                        y={4}
                                        textAnchor="end"
                                        className={styles.tick}
                                    >
                                        {formatTick(tick)}
                                    </text>
                                </g>
                            ))}
                            {years.map((year, index) =>
                                stack(layers, index).map((segment) => (
                                    <rect
                                        key={`${year}-${segment.key}`}
                                        className={styles.bar}
                                        x={-0.5}
                                        width={1}
                                        height={1}
                                        fill={segment.colour}
                                        style={{
                                            transform: `translate(${sx(index)}px, ${sy(segment.from)}px) scale(${barWidth}, ${sy(segment.to) - sy(segment.from)})`,
                                        }}
                                    />
                                )),
                            )}
                            {years.map((year, index) =>
                                (lastIndex - index) % labelStep === 0 ? (
                                    <g
                                        key={year}
                                        className={styles.mark}
                                        style={{
                                            transform: `translate(${sx(index)}px, ${plot.bottom + 16}px)`,
                                        }}
                                    >
                                        <text
                                            textAnchor="middle"
                                            className={
                                                index === shown ? styles.tickShown : styles.tick
                                            }
                                        >
                                            {year}
                                        </text>
                                    </g>
                                ) : null,
                            )}
                            <line
                                x1={MARGIN.left}
                                x2={plot.right}
                                className={`${styles.mark} ${styles.axis}`}
                                style={{ transform: `translateY(${sy(0)}px)` }}
                            />
                            <text
                                key={emptyLine ?? 'none'}
                                x={MARGIN.left + plotWidth / 2}
                                y={(plot.top + plot.bottom) / 2}
                                textAnchor="middle"
                                className={styles.empty}
                            >
                                {emptyLine ?? ''}
                            </text>
                        </g>
                    </svg>
                )}
            </div>
            <p className={styles.srOnly} aria-live="polite">
                {reading === null ? '' : `${shownYear}: ${read}`}
            </p>
        </WithSide>
    );
};
