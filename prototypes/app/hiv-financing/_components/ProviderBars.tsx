'use client';

import { ChartKey, type KeyRow } from './ChartKey';
import styles from './ProviderBars.module.scss';
import { useWidth } from './useWidth';
import { useYearReading } from './useYearReading';
import { WithSide } from './WithSide';

import type { ProviderSeries } from '../_data/types.ts';
import { barTicks, labelledYears, providerLayers, stackExtent, type Layer } from '../_lib/chart.ts';
import { axisMoney, money } from '../_lib/format.ts';
import { PROVIDERS } from '../_lib/providers.ts';
import { seriesTotals } from '../_lib/summary.ts';

import { PLOT_RATIO } from '@/lib/studio/chartFit';

const MARGIN = { left: 48, right: 8, top: 10, bottom: 24 };
/** The narrowest gap between labelled years. */
const MIN_LABEL_PITCH = 34;
const BAR_SHARE = 0.68;

/** A segment's base and end in dollars; a missing value has both at the stack's edge. */
type Segment = { key: string; colour: string; from: number; to: number };

/** Every layer's segment in one year, one per layer so each rect stays mounted. */
const stack = (layers: readonly Layer[], index: number): Segment[] => {
    let top = 0;

    return layers.map((layer) => {
        const from = top;

        top += Math.max(0, layer.values[index] ?? 0);

        return { key: layer.key, colour: layer.colour, from, to: top };
    });
};

/** The key for one year: each provider's money, then the total. */
const keyRows = (series: ProviderSeries, index: number): KeyRow[] => [
    ...PROVIDERS.map(({ key, label, colour }) => ({
        key,
        label,
        colour,
        value: money(series[key][index] ?? 0),
    })),
    { key: 'total', label: 'Total', value: money(seriesTotals(series)[index] ?? 0) },
];

/**
 * HIV aid by provider and year as stacked bars: the United States at the base, then the
 * Global Fund, then all other providers. The key beside the chart reads the last year;
 * hovering, tapping or the arrow keys read another. A change of series glides the bars to
 * their new heights.
 */
export const ProviderBars = ({
    series,
    years,
}: {
    series: ProviderSeries;
    /** One per value in each of `series`' arrays, ascending. */
    years: readonly number[];
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

    const layers = providerLayers(series);
    const { high } = stackExtent(layers);
    const ticks = barTicks(high);
    const yMax = ticks.at(-1) ?? 1;
    const height = Math.round(plotWidth / PLOT_RATIO) + MARGIN.top + MARGIN.bottom;
    const plot = { top: MARGIN.top, bottom: height - MARGIN.bottom, right: width - MARGIN.right };
    const sy = (value: number) => plot.bottom - (value / yMax) * (plot.bottom - plot.top);
    const sx = (index: number) => MARGIN.left + pitch * (index + 0.5);
    const barWidth = Math.max(2, pitch * BAR_SHARE);
    const labelled = labelledYears(
        years.length,
        Math.max(1, Math.ceil(MIN_LABEL_PITCH / Math.max(pitch, 1))),
    );

    const rows = keyRows(series, shown);
    const shownYear = years[shown] ?? 0;
    const read = rows.map((row) => `${row.label} ${row.value}`).join('; ');
    const span = years.length > 0 ? `${years[0]} to ${years.at(-1)}` : '';
    const label =
        `HIV aid by provider, ${span}, stacked bars. In ${shownYear}: ${read}. ` +
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
                                        className={tick === 0 ? styles.axis : styles.grid}
                                    />
                                    <text
                                        key={axisMoney(tick)}
                                        x={MARGIN.left - 6}
                                        y={4}
                                        textAnchor="end"
                                        className={styles.tick}
                                    >
                                        {axisMoney(tick)}
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
                                            transform: `translate(${sx(index)}px, ${sy(segment.to)}px) scale(${barWidth}, ${sy(segment.from) - sy(segment.to)})`,
                                        }}
                                    />
                                )),
                            )}
                            {years.map((year, index) =>
                                labelled.has(index) ? (
                                    <text
                                        key={year}
                                        x={sx(index)}
                                        y={plot.bottom + 16}
                                        textAnchor="middle"
                                        className={index === shown ? styles.tickShown : styles.tick}
                                    >
                                        {year}
                                    </text>
                                ) : null,
                            )}
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
