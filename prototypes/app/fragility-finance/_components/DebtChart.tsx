'use client';

import { ChartKey, type KeyRow } from './ChartKey';
import styles from './Chart.module.scss';
import { keyReading } from './keyValue';
import { WithSide } from './Panel';
import { useWidth } from './useWidth';
import { useYearReading } from './useYearReading';

import type { Context } from '../_data/types.ts';
import { FLOW_COLOURS, valueTicks } from '../_lib/chart.ts';
import { LABELS, outsideIdsLine, scopeName } from '../_lib/copy.ts';
import { formatMoney, formatTick } from '../_lib/format.ts';
import { scopeDebt, type DebtPoint } from '../_lib/groups.ts';
import { DEBT_KEY_YEAR, LAST_PAID_YEAR } from '../_lib/profile.ts';
import type { Scope } from '../_lib/scope.ts';

import { PLOT_RATIO } from '@/lib/studio/chartFit';

const MARGIN = { left: 48, right: 10, top: 22, bottom: 24 };
const MIN_LABEL_PITCH = 34;
const POINT_RADIUS = 2.5;

const SERIES = [
    { key: 'oda', label: LABELS.odaReceived, colour: FLOW_COLOURS.oda },
    { key: 'debt', label: LABELS.debtService, colour: FLOW_COLOURS.debtService },
] as const;

/**
 * ODA received and public external debt service by year for a scope: debt service paid as
 * a solid line to 2025, then a dashed line on a shaded band for what is scheduled on the
 * debt held at the end of 2025. The key opens on 2024, the last year both lines hold.
 */
export const DebtChart = ({ contexts, scope }: { contexts: Context[]; scope: Scope }) => {
    const view = scopeDebt(contexts, scope);
    const { points } = view;
    const name = scopeName(contexts, scope);
    const years = points.map((point) => point.year);
    const [wrapRef, width] = useWidth();
    const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
    const pitch = points.length > 1 ? plotWidth / (points.length - 1) : 0;
    const lastIndex = points.length - 1;
    const paidIndex = years.indexOf(LAST_PAID_YEAR);
    const keyIndex = Math.max(0, years.indexOf(DEBT_KEY_YEAR));
    const { reading, shown, onPointer, onPointerLeave, onKeyDown, clear } = useYearReading(
        points.length,
        keyIndex,
        (x) => Math.round((x - MARGIN.left) / Math.max(pitch, 1)),
    );

    const values = points.flatMap((point) => [point.oda ?? 0, point.debt ?? 0]);
    const ticks = valueTicks(0, Math.max(0, ...values));
    const yMax = ticks.at(-1) ?? 1;
    const height = Math.round(plotWidth / PLOT_RATIO) + MARGIN.top + MARGIN.bottom;
    const plot = { top: MARGIN.top, bottom: height - MARGIN.bottom, right: width - MARGIN.right };
    const sx = (index: number) => MARGIN.left + index * pitch;
    const sy = (value: number) => plot.bottom - (value / yMax) * (plot.bottom - plot.top);
    const labelStep = Math.max(1, Math.ceil(MIN_LABEL_PITCH / Math.max(pitch, 1)));

    const pathOf = (pick: (point: DebtPoint, index: number) => number | null): string => {
        let path = '';
        let open = false;

        points.forEach((point, index) => {
            const value = pick(point, index);

            if (value === null) {
                open = false;

                return;
            }

            path += `${open ? 'L' : 'M'}${sx(index)},${sy(value)}`;
            open = true;
        });

        // An empty line stays mounted as a point at the origin of the plot.
        return path === '' ? `M${MARGIN.left},${plot.bottom}` : path;
    };

    const oda = pathOf((point) => point.oda);
    const paid = pathOf((point) => (point.scheduled ? null : point.debt));
    // The scheduled line starts at the last paid year, so the two lines meet.
    const scheduled = pathOf((point, index) =>
        point.scheduled || index === paidIndex ? point.debt : null,
    );
    const bandFrom = paidIndex === -1 ? plot.right : sx(paidIndex) + pitch / 2;

    const shownYear = years[shown] ?? 0;
    const shownPoint = points[shown];
    const rows: KeyRow[] = SERIES.map((series) => ({
        key: series.key,
        colour: series.colour,
        dashed: series.key === 'debt' && shownPoint?.scheduled === true,
        ...keyReading(
            series.label,
            years,
            points.map((point) => point[series.key]),
            shownYear,
            formatMoney,
        ),
    }));
    const read = rows.map((row) => `${row.label} ${row.value}`).join('; ');
    const first = years[0] ?? 0;
    const last = years.at(-1) ?? 0;
    const label =
        `Line chart of ODA received by ${name} and public external debt service, paid to ` +
        `${LAST_PAID_YEAR} and scheduled from ${LAST_PAID_YEAR + 1}, ${first} to ${last}, ` +
        `in US dollars. In ${shownYear}: ${read}. ` +
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
                                width={1}
                                height={1}
                                className={styles.band}
                                style={{
                                    transform: `translate(${bandFrom}px, ${plot.top}px) scale(${Math.max(0, plot.right - bandFrom)}, ${plot.bottom - plot.top})`,
                                }}
                            />
                            <text
                                x={plot.right}
                                y={plot.top - 8}
                                textAnchor="end"
                                className={styles.bandLabel}
                            >
                                {LABELS.scheduled}
                            </text>
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
                            {points.map((point, index) =>
                                (lastIndex - index) % labelStep === 0 ? (
                                    <g
                                        key={point.year}
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
                                            {point.year}
                                        </text>
                                    </g>
                                ) : null,
                            )}
                            <line
                                y1={plot.top}
                                y2={plot.bottom}
                                className={styles.guide}
                                style={{
                                    transform: `translateX(${sx(shown)}px)`,
                                    opacity: reading === null ? 0 : 1,
                                }}
                            />
                            <path
                                d={oda}
                                style={{ d: `path("${oda}")` }}
                                stroke={FLOW_COLOURS.oda}
                                className={styles.line}
                            />
                            <path
                                d={paid}
                                style={{ d: `path("${paid}")` }}
                                stroke={FLOW_COLOURS.debtService}
                                className={styles.line}
                            />
                            <path
                                d={scheduled}
                                style={{ d: `path("${scheduled}")` }}
                                stroke={FLOW_COLOURS.debtService}
                                className={`${styles.line} ${styles.dashed}`}
                            />
                            {points.flatMap((point, index) =>
                                SERIES.map((series) => {
                                    const value = point[series.key];
                                    const scale =
                                        value === null ? 0 : index === shown ? 4 / POINT_RADIUS : 1;

                                    return (
                                        <circle
                                            key={`${series.key}-${point.year}`}
                                            r={POINT_RADIUS}
                                            fill={series.colour}
                                            className={styles.point}
                                            style={{
                                                transform: `translate(${sx(index)}px, ${sy(value ?? 0)}px) scale(${scale})`,
                                            }}
                                        />
                                    );
                                }),
                            )}
                            <text
                                key={view.covered ? 'covered' : name}
                                x={MARGIN.left + plotWidth / 2}
                                y={(plot.top + plot.bottom) / 2}
                                textAnchor="middle"
                                className={styles.empty}
                            >
                                {view.covered ? '' : outsideIdsLine(name)}
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
