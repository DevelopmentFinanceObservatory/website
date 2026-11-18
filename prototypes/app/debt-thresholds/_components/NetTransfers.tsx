'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { CardFoot } from './CardFoot';
import styles from './NetTransfers.module.scss';
import { GROUP_COLOURS } from './ThresholdScatter';

import type { Group } from '../_lib/thresholds.ts';
import {
    groupTransfers,
    type LineKey,
    type TransferLine,
    type TransfersData,
} from '../_lib/transfers.ts';

import { PLOT_RATIO } from '@/lib/studio/chartFit';

/** The scatter's legend names and colours; countries outside FDL's 58 take a grey dark enough to hold 3:1 on white. */
const LINE_STYLE: Record<LineKey, { label: string; colour: string }> = {
    debt: { label: 'Above the debt threshold', colour: GROUP_COLOURS.debt },
    service: { label: 'Above the debt-service threshold', colour: GROUP_COLOURS.service },
    below: { label: 'Below both', colour: GROUP_COLOURS.below },
    nodata: { label: 'No data', colour: GROUP_COLOURS.nodata },
    outside: { label: "Not in FDL's analysis", colour: '#8c8c80' },
};

type Line = TransferLine & { label: string; colour: string };

/** Width over height of the plot box: shallower than Studio's 16:9 for this secondary chart. */
const WIDE_RATIO = 2.4;
/** Below this plot width the wide ratio leaves too little height, so the plot takes 16:9. */
const WIDE_FROM = 480;

const MARGIN = { left: 44, right: 12, top: 10, bottom: 24 };
/** How near, in px, the pointer must be to a line to bring it into focus. */
const HIT_RADIUS = 12;

/** "44.2B" with a true minus sign, the DFO's money format. */
const formatMoney = (value: number): string => {
    const text = `${(Math.abs(value) / 1e9).toFixed(1)}B`;

    return value < 0 ? `−${text}` : text;
};

const formatTick = (value: number): string => {
    if (value === 0) {
        return '0';
    }

    const text = `${Math.abs(value) / 1e9}B`;

    return value < 0 ? `−${text}` : text;
};

/** A step of 1, 2, 2.5 or 5 times a power of ten giving about `count` intervals. */
const niceStep = (span: number, count: number): number => {
    const raw = span / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / magnitude;
    const factor = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;

    return factor * magnitude;
};

/** Distance from point p to the segment a–b. */
const segmentDistance = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): number => {
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    const t =
        length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));

    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** The container's content width, re-measured on resize, so the SVG draws at 1:1. */
const useWidth = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const element = ref.current;

        if (element === null) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            const measured = Math.floor(entry?.contentRect.width ?? 0);

            if (measured > 0) {
                setWidth(measured);
            }
        });

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return [ref, width] as const;
};

/** The lines for a grouping, with the scatter's names, colours and member counts. */
const buildLines = (data: TransfersData, groupOf: (iso3: string) => Group | null) => {
    const { lines, aside } = groupTransfers(data, groupOf);

    return {
        aside,
        lines: lines.map((line): Line => {
            const { label, colour } = LINE_STYLE[line.key];
            const excluding =
                aside !== null && aside.line === line.key ? `, excluding ${aside.name}` : '';

            return { ...line, colour, label: `${label}${excluding} (${line.members.length})` };
        }),
    };
};

/**
 * Net transfers on external debt for low- and lower-middle-income countries, one line
 * per group in `groupOf`'s grouping, the scatter's. When the grouping changes, a line
 * whose members change fades in afresh. The key beside the plot reads each line's value
 * for the year under the pointer, or the latest year. Hovering or tapping a line, or its
 * key entry, brings that group into focus and dims the rest; otherwise `highlight`, the
 * selected country's line, is in focus. The card lays its plot and key on its parent's
 * column tracks (CSS subgrid), so they line up with the cards above.
 */
export const NetTransfers = ({
    data,
    groupOf,
    groupSource,
    highlight = null,
}: {
    data: TransfersData;
    /** A country's group on screen; null for a country outside FDL's analysis. */
    groupOf: (iso3: string) => Group | null;
    /** Who grouped the countries, for the source line, e.g. "FDL, March 2026". */
    groupSource: string;
    highlight?: LineKey | null;
}) => {
    const [wrapRef, width] = useWidth();
    const [index, setIndex] = useState<number | null>(null);
    const [nearLine, setNearLine] = useState<LineKey | null>(null);
    const [keyLine, setKeyLine] = useState<LineKey | null>(null);
    const [pinned, setPinned] = useState<LineKey | null>(null);

    const { years } = data;
    const { lines, aside } = buildLines(data, groupOf);
    const focus = keyLine ?? nearLine ?? pinned ?? highlight;

    // Ticks span zero and every value, on a step of about four intervals.
    const all = lines.flatMap((line) => line.values.filter((value) => value !== null));
    const low = Math.min(0, ...all);
    const high = Math.max(0, ...all);
    const step = niceStep(high - low || 1, 4);
    const ticks: number[] = [];

    for (let tick = Math.floor(low / step) * step; tick <= high + step * 0.999; tick += step) {
        ticks.push(tick);
    }

    const yMin = ticks[0] ?? 0;
    const yMax = ticks.at(-1) ?? 1;

    const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
    const ratio = plotWidth < WIDE_FROM ? PLOT_RATIO : WIDE_RATIO;
    const height = Math.round(plotWidth / ratio) + MARGIN.top + MARGIN.bottom;
    const plot = {
        left: MARGIN.left,
        right: width - MARGIN.right,
        top: MARGIN.top,
        bottom: height - MARGIN.bottom,
    };
    const pitch = years.length > 1 ? plotWidth / (years.length - 1) : 0;
    const sx = (i: number): number => plot.left + i * pitch;
    const sy = (value: number): number =>
        plot.bottom - ((value - yMin) / (yMax - yMin)) * (plot.bottom - plot.top);
    const yearStep = plotWidth < 420 ? 5 : 2;

    const pathOf = (values: (number | null)[]): string => {
        let path = '';
        let open = false;

        values.forEach((value, i) => {
            if (value === null) {
                open = false;

                return;
            }

            path += `${open ? 'L' : 'M'}${sx(i)},${sy(value)}`;
            open = true;
        });

        return path;
    };

    /** The line within HIT_RADIUS of a point in the SVG, nearest first, or null. */
    const lineNear = (x: number, y: number): LineKey | null => {
        let best: LineKey | null = null;
        let bestDistance = HIT_RADIUS;

        for (const line of lines) {
            line.values.forEach((value, i) => {
                const next = line.values[i + 1];

                if (value === null) {
                    return;
                }

                const distance =
                    next === null || next === undefined
                        ? Math.hypot(x - sx(i), y - sy(value))
                        : segmentDistance(x, y, sx(i), sy(value), sx(i + 1), sy(next));

                if (distance <= bestDistance) {
                    bestDistance = distance;
                    best = line.key;
                }
            });
        }

        return best;
    };

    const locate = (event: PointerEvent<SVGRectElement>) => {
        const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();

        if (box === undefined || pitch === 0) {
            return null;
        }

        const x = event.clientX - box.left;
        const y = event.clientY - box.top;
        const i = Math.max(0, Math.min(years.length - 1, Math.round((x - plot.left) / pitch)));

        return { x, y, i };
    };

    const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
        const point = locate(event);

        if (point === null) {
            return;
        }

        setIndex(point.i);

        if (event.pointerType === 'mouse') {
            setNearLine(lineNear(point.x, point.y));
        }
    };

    // A tap toggles the line under it, and a tap away from every line clears the focus.
    const onPointerDown = (event: PointerEvent<SVGRectElement>) => {
        const point = locate(event);

        if (point === null || event.pointerType === 'mouse') {
            return;
        }

        const hit = lineNear(point.x, point.y);

        setIndex(point.i);
        setPinned((current) => (hit === null || hit === current ? null : hit));
    };

    const onPointerLeave = (event: PointerEvent<SVGRectElement>) => {
        // On touch the reading stays until the next tap.
        if (event.pointerType === 'mouse') {
            setIndex(null);
            setNearLine(null);
        }
    };

    const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
        const last = years.length - 1;

        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const move = event.key === 'ArrowLeft' ? -1 : 1;

            setIndex((current) => Math.max(0, Math.min(last, (current ?? last) + move)));
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setIndex(event.key === 'Home' ? 0 : last);
        } else if (event.key === 'Escape') {
            setIndex(null);
        }
    };

    const lastIndex = years.length - 1;
    const shown = index ?? lastIndex;
    const valueText = (value: number | null | undefined): string =>
        value === null || value === undefined ? 'no data' : formatMoney(value);
    const asideRange =
        aside === null
            ? null
            : (() => {
                  const values = aside.values.filter((value) => value !== null);

                  return values.length === 0
                      ? null
                      : `${formatMoney(Math.min(...values))} to ${formatMoney(Math.max(...values))}`;
              })();

    const reading = [
        ...lines.map((line) => `${line.label} ${valueText(line.values[shown])}`),
        ...(aside === null ? [] : [`${aside.name} ${valueText(aside.values[shown])}`]),
    ].join('; ');
    const summary =
        `Line chart of net transfers on external debt for groups of low- and ` +
        `lower-middle-income countries, ${years[0]} to ${years[lastIndex]}, in US dollars. ` +
        `In ${years[lastIndex]}: ` +
        lines.map((line) => `${line.label} ${valueText(line.values[lastIndex])}`).join('; ') +
        '. Use the left and right arrow keys to read each year.';

    // The focused line is drawn last, so it sits on top of the others.
    const drawOrder =
        focus === null
            ? lines
            : [...lines.filter((l) => l.key !== focus), ...lines.filter((l) => l.key === focus)];

    return (
        <figure className={styles.card}>
            <figcaption className={styles.head}>
                Net transfers on external debt by group, {years[0]} to {years[lastIndex]}, US
                dollars
            </figcaption>

            <div ref={wrapRef} className={styles.wrap}>
                {width > 0 && (
                    <svg
                        className={styles.svg}
                        width={width}
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        role="img"
                        aria-label={summary}
                        tabIndex={0}
                        onKeyDown={onKeyDown}
                        onFocus={() => setIndex((current) => current ?? lastIndex)}
                        onBlur={() => setIndex(null)}
                    >
                        <g aria-hidden="true">
                            {ticks.map((tick) => (
                                <g key={tick}>
                                    <line
                                        x1={plot.left}
                                        x2={plot.right}
                                        y1={sy(tick)}
                                        y2={sy(tick)}
                                        className={tick === 0 ? styles.zero : styles.grid}
                                    />
                                    <text
                                        x={plot.left - 6}
                                        y={sy(tick) + 4}
                                        textAnchor="end"
                                        className={styles.tick}
                                    >
                                        {formatTick(tick)}
                                    </text>
                                </g>
                            ))}
                            {years.map((y, i) =>
                                y % yearStep === 0 ? (
                                    <text
                                        key={y}
                                        x={sx(i)}
                                        y={plot.bottom + 16}
                                        textAnchor="middle"
                                        className={styles.tick}
                                    >
                                        {y}
                                    </text>
                                ) : null,
                            )}
                            {index !== null && (
                                <line
                                    x1={sx(index)}
                                    x2={sx(index)}
                                    y1={plot.top}
                                    y2={plot.bottom}
                                    className={styles.guide}
                                />
                            )}

                            {/* Keyed by members, so a line whose members change fades in afresh. */}
                            {drawOrder.map((line) => (
                                <g
                                    key={`${line.key}:${line.members.join(',')}`}
                                    className={styles.series}
                                    style={{
                                        opacity: focus !== null && focus !== line.key ? 0.25 : 1,
                                    }}
                                >
                                    <g className={styles.enter}>
                                        <path
                                            d={pathOf(line.values)}
                                            stroke={line.colour}
                                            className={
                                                focus === line.key
                                                    ? styles.lineFocused
                                                    : styles.line
                                            }
                                        />
                                        {line.values.map((value, i) =>
                                            value === null ? null : (
                                                <circle
                                                    key={years[i]}
                                                    cx={sx(i)}
                                                    cy={sy(value)}
                                                    r={i === index ? 4.5 : 2.5}
                                                    fill={line.colour}
                                                    className={styles.point}
                                                />
                                            ),
                                        )}
                                    </g>
                                </g>
                            ))}
                        </g>

                        <rect
                            x={plot.left - pitch / 2}
                            y={0}
                            width={plotWidth + pitch}
                            height={height}
                            className={styles.hit}
                            onPointerMove={onPointerMove}
                            onPointerDown={onPointerDown}
                            onPointerLeave={onPointerLeave}
                        />
                    </svg>
                )}
            </div>

            <div className={styles.key}>
                <p className={styles.keyYear} aria-hidden="true">
                    {years[shown]}
                </p>
                <ul className={styles.keyList}>
                    {lines.map((line) => (
                        <li key={line.key}>
                            <button
                                type="button"
                                className={styles.keyItem}
                                aria-pressed={pinned === line.key}
                                data-focused={focus === line.key}
                                data-dimmed={focus !== null && focus !== line.key}
                                onMouseEnter={() => setKeyLine(line.key)}
                                onMouseLeave={() => setKeyLine(null)}
                                onFocus={() => setKeyLine(line.key)}
                                onBlur={() => setKeyLine(null)}
                                onClick={() =>
                                    setPinned((current) => (current === line.key ? null : line.key))
                                }
                            >
                                <span
                                    className={styles.swatch}
                                    style={{ background: line.colour }}
                                />
                                <span className={styles.keyName}>{line.label}</span>
                                <span className={styles.keyValue}>
                                    {valueText(line.values[shown])}
                                </span>
                            </button>
                            {aside !== null && line.key === aside.line && (
                                <p className={styles.keyAside}>
                                    <span className={styles.keyName}>{aside.name}</span>
                                    <span className={styles.keyValue}>
                                        {valueText(aside.values[shown])}
                                    </span>
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
                {aside !== null && asideRange !== null && (
                    <p className={styles.keyNote}>
                        {aside.name} is left out of its group&apos;s line: its net transfers ran
                        from {asideRange} a year.
                    </p>
                )}
                <p className={styles.keyNote}>Hover over or tap the chart to read other years.</p>
            </div>

            <p className={styles.srOnly} aria-live="polite">
                {index === null ? '' : `${years[index]}: ${reading}`}
            </p>

            <div className={styles.foot}>
                <CardFoot>
                    Source: World Bank IDS ({data.release}), via the DFO. Groups: {groupSource}.
                </CardFoot>
            </div>
        </figure>
    );
};
