'use client';

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';

import styles from './ThresholdScatter.module.scss';

import { PLOT_RATIO } from '@/lib/studio/chartFit';

import type { Capacity } from '../_data/types.ts';
import { GROUP_LABELS, THRESHOLDS, type Group } from '../_lib/thresholds.ts';

/** Group colours from the DFO palette (theme.ts): series 5, series 3, series 1 lighter. */
export const GROUP_COLOURS: Record<Group, string> = {
    debt: '#662d6e',
    service: '#f46f58',
    below: '#8285e7',
    nodata: '#d2d2c5',
};

export type ScatterPoint = {
    iso3: string;
    name: string;
    group: Group;
    /** External public debt, % of GDP. */
    debt: number;
    /** Peak debt service from the base year to the last year in the data, % of revenue. */
    peak: number;
    /** The capacity that sets this country's thresholds on screen. */
    capacity: Capacity | null;
    /** A line for the tooltip, such as where FDL and the DFO's rebuild disagree. */
    note: string | null;
};

const MARGIN = { left: 38, right: 10, top: 8, bottom: 34 };
const LABEL_HEIGHT = 12;
const LABEL_FONT = '400 11px Outfit';

type Box = { x0: number; x1: number; y0: number; y1: number };

const overlaps = (a: Box, b: Box): boolean =>
    a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Label width in pixels, measured in the label's font, with a character estimate as fallback. */
const labelWidth = (text: string): number => {
    if (measureContext === undefined) {
        measureContext = document.createElement('canvas').getContext('2d');
    }

    if (measureContext === null) {
        return text.length * 5.6 + 2;
    }

    measureContext.font = LABEL_FONT;

    return measureContext.measureText(text).width + 2;
};

type Label = { iso3: string; name: string; x: number; y: number; anchor: 'start' | 'end' };

/**
 * Greedy placement: the selected country first, then those over the debt threshold, then
 * the rest with high service. Each tries the right of its dot, then the left, and is
 * dropped when it would leave the plot or cover another label or dot.
 */
const placeLabels = (
    dots: { point: ScatterPoint; x: number; y: number }[],
    selected: string | null,
    plot: { left: number; right: number },
): Label[] => {
    const priority = ({ point }: { point: ScatterPoint }): number =>
        point.iso3 === selected ? 3 : point.group === 'debt' ? 2 : 1;
    const candidates = dots
        .filter(
            ({ point }) =>
                point.iso3 === selected ||
                point.group === 'debt' ||
                point.peak > THRESHOLDS.service.strong,
        )
        .toSorted((a, b) => priority(b) - priority(a));
    const placed: Box[] = [];
    const labels: Label[] = [];

    for (const { point, x, y } of candidates) {
        const width = labelWidth(point.name);
        const options = [
            { x0: x + 8, anchor: 'start' as const, textX: x + 8 },
            { x0: x - 8 - width, anchor: 'end' as const, textX: x - 8 },
        ];

        for (const option of options) {
            const box = {
                x0: option.x0,
                x1: option.x0 + width,
                y0: y - 6,
                y1: y - 6 + LABEL_HEIGHT,
            };
            const outside = box.x0 < plot.left || box.x1 > plot.right;
            const coversLabel = placed.some((other) => overlaps(other, box));
            const coversDot = dots.some(
                (dot) =>
                    dot.point.iso3 !== point.iso3 &&
                    overlaps({ x0: dot.x - 5, x1: dot.x + 5, y0: dot.y - 5, y1: dot.y + 5 }, box),
            );

            if (!outside && !coversLabel && !coversDot) {
                placed.push(box);
                labels.push({
                    iso3: point.iso3,
                    name: point.name,
                    x: option.textX,
                    y,
                    anchor: option.anchor,
                });
                break;
            }
        }
    }

    return labels;
};

/** Stacked layout, as in the page's stylesheet: the plot box gets a 1:1 floor here. */
const STACKED = '(max-width: 900px)';

const subscribeStacked = (listener: () => void) => {
    const media = window.matchMedia(STACKED);

    media.addEventListener('change', listener);

    return () => media.removeEventListener('change', listener);
};

/** How long after a resize the plot keeps its transitions off. */
const STILL_MS = 200;

/** A translate in SVG user units, which equal pixels here; dots and labels move by it. */
const at = (x: number, y: number): string => `translate(${x}px, ${y}px)`;

/**
 * The container's content width, re-measured on resize, so the SVG draws at 1:1. While
 * the width settles (first draw, window resize) the container carries `data-still`, which
 * turns the plot's transitions off: a resize redraws the plot, and only data changes glide.
 */
const useWidth = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const element = ref.current;

        if (element === null) {
            return;
        }

        let timer = 0;

        // A zero width (the container hidden or mid-resize) keeps the last drawing, so the
        // SVG and the focused dot are never torn down.
        const observer = new ResizeObserver(([entry]) => {
            const measured = Math.floor(entry?.contentRect.width ?? 0);

            if (measured > 0) {
                element.dataset.still = '';
                window.clearTimeout(timer);
                timer = window.setTimeout(() => delete element.dataset.still, STILL_MS);
                setWidth(measured);
            }
        });

        observer.observe(element);

        return () => {
            window.clearTimeout(timer);
            observer.disconnect();
        };
    }, []);

    return [ref, width] as const;
};

const formatDebt = (value: number): string => `${value.toFixed(0)}%`;

const CAPACITY_NAMES: Record<Capacity, string> = {
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
};

/** The tooltip's capacity and the two thresholds it sets. */
const Thresholds = ({ capacity }: { capacity: Capacity | null }) =>
    capacity === null ? (
        <p className={styles.tipNote}>No capacity rating.</p>
    ) : (
        <div className={styles.tipThresholds}>
            <div className={styles.tipRow}>
                <span>Capacity</span>
                <b>{CAPACITY_NAMES[capacity]}</b>
            </div>
            <div className={styles.tipRow}>
                <span>Debt threshold</span>
                <b>{THRESHOLDS.debt[capacity]}%</b>
            </div>
            <div className={styles.tipRow}>
                <span>Service threshold</span>
                <b>{THRESHOLDS.service[capacity]}%</b>
            </div>
        </div>
    );
const formatService = (value: number): string => `${value.toFixed(1)}%`;

/** The tallest the plot box grows on a wide screen, in pixels. */
const MAX_PLOT_HEIGHT = 440;

/**
 * Debt against peak debt service, one dot per country at its true position, with the
 * weak-to-strong threshold ranges shaded. Each axis runs from zero to its last tick. When
 * every country's capacity is overridden, the two thresholds for that capacity are drawn
 * as lines. Changes animate (ThresholdScatter.module.scss): the lines glide to a new
 * capacity, then dots that change group cross-fade colour; dots and labels glide to new
 * positions when the view changes; new labels fade in.
 */
export const ThresholdScatter = ({
    points,
    xTicks,
    yTicks,
    selected,
    override,
    onSelect,
}: {
    points: ScatterPoint[];
    /** Debt ticks, % of GDP, from zero; the last is the axis maximum. */
    xTicks: number[];
    /** Peak service ticks, % of revenue, from zero; the last is the axis maximum. */
    yTicks: number[];
    selected: string | null;
    override: Capacity | null;
    onSelect: (iso3: string) => void;
}) => {
    const [wrapRef, width] = useWidth();
    const tipRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState<string | null>(null);
    const isStacked = useSyncExternalStore(
        subscribeStacked,
        () => window.matchMedia(STACKED).matches,
        () => false,
    );

    // The plot box is 16:9 (PLOT_RATIO) up to MAX_PLOT_HEIGHT, so the full-width chart
    // fits a laptop screen, and 1:1 when stacked so a phone's dots spread out.
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = isStacked
        ? plotWidth
        : Math.min(Math.round(plotWidth / PLOT_RATIO), MAX_PLOT_HEIGHT);
    const height = plotHeight + MARGIN.top + MARGIN.bottom;
    const plot = {
        left: MARGIN.left,
        right: width - MARGIN.right,
        top: MARGIN.top,
        bottom: height - MARGIN.bottom,
    };
    const xMax = xTicks.at(-1) ?? 1;
    const yMax = yTicks.at(-1) ?? 1;
    const sx = (value: number): number => plot.left + (value / xMax) * (plot.right - plot.left);
    const sy = (value: number): number => plot.bottom - (value / yMax) * (plot.bottom - plot.top);

    // Dots keep the data's order, so selecting one never moves the focused element; the
    // selected dot is drawn again on top, without events, so its ring stays visible.
    const dots = points.map((point) => ({ point, x: sx(point.debt), y: sy(point.peak) }));
    const selectedDot = dots.find(({ point }) => point.iso3 === selected);
    const labels = width > 0 ? placeLabels(dots, selected, plot) : [];
    const hoveredDot = dots.find(({ point }) => point.iso3 === hovered);

    useLayoutEffect(() => {
        const tip = tipRef.current;

        if (tip === null || hoveredDot === undefined) {
            return;
        }

        const left =
            hoveredDot.x + 12 + tip.offsetWidth > width
                ? hoveredDot.x - 12 - tip.offsetWidth
                : hoveredDot.x + 12;

        tip.style.left = `${Math.max(0, left)}px`;
        tip.style.top = `${Math.max(0, hoveredDot.y - 12 - tip.offsetHeight)}px`;
    }, [hoveredDot, width]);

    const onKeyDown = (event: KeyboardEvent<SVGCircleElement>, iso3: string) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(iso3);
        }
    };

    return (
        <div ref={wrapRef} className={styles.wrap}>
            {width > 0 && (
                <svg
                    className={styles.svg}
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    role="group"
                    aria-label="Each country's external public debt as a share of GDP against its peak debt service as a share of government revenue"
                >
                    <rect
                        x={sx(THRESHOLDS.debt.weak)}
                        y={plot.top}
                        width={sx(THRESHOLDS.debt.strong) - sx(THRESHOLDS.debt.weak)}
                        height={plot.bottom - plot.top}
                        className={styles.range}
                    />
                    <rect
                        x={plot.left}
                        y={sy(THRESHOLDS.service.strong)}
                        width={plot.right - plot.left}
                        height={sy(THRESHOLDS.service.weak) - sy(THRESHOLDS.service.strong)}
                        className={styles.range}
                    />

                    <g aria-hidden="true">
                        {xTicks.map((tick) => (
                            <g key={`x${tick}`}>
                                <line
                                    x1={sx(tick)}
                                    x2={sx(tick)}
                                    y1={plot.top}
                                    y2={plot.bottom}
                                    className={styles.grid}
                                />
                                <text
                                    x={sx(tick)}
                                    y={plot.bottom + 15}
                                    textAnchor="middle"
                                    className={styles.tick}
                                >
                                    {tick}%
                                </text>
                            </g>
                        ))}
                        {yTicks.map((tick) => (
                            <g key={`y${tick}`}>
                                <line
                                    x1={plot.left}
                                    x2={plot.right}
                                    y1={sy(tick)}
                                    y2={sy(tick)}
                                    className={styles.grid}
                                />
                                <text
                                    x={plot.left - 6}
                                    y={sy(tick) + 4}
                                    textAnchor="end"
                                    className={styles.tick}
                                >
                                    {tick}%
                                </text>
                            </g>
                        ))}
                        <text
                            x={plot.right}
                            y={height - 4}
                            textAnchor="end"
                            className={styles.tick}
                        >
                            External public debt, % of GDP →
                        </text>
                        <text x={plot.left + 4} y={plot.top + 11} className={styles.tick}>
                            ↑ Peak debt service, % of revenue
                        </text>

                        {override !== null && (
                            <>
                                <line
                                    y1={plot.top}
                                    y2={plot.bottom}
                                    className={styles.threshold}
                                    style={{ transform: at(sx(THRESHOLDS.debt[override]), 0) }}
                                />
                                <line
                                    x1={plot.left}
                                    x2={plot.right}
                                    className={styles.threshold}
                                    style={{
                                        transform: at(0, sy(THRESHOLDS.service[override])),
                                    }}
                                />
                            </>
                        )}
                    </g>

                    <g>
                        {dots.map(({ point, x, y }) => {
                            const isSelected = point.iso3 === selected;

                            return (
                                <circle
                                    key={point.iso3}
                                    r={isSelected ? 6.5 : 5}
                                    style={{
                                        fill: GROUP_COLOURS[point.group],
                                        transform: at(x, y),
                                    }}
                                    className={isSelected ? styles.dotSelected : styles.dot}
                                    tabIndex={0}
                                    role="button"
                                    aria-pressed={isSelected}
                                    aria-label={`${point.name}: ${GROUP_LABELS[point.group]}`}
                                    onClick={() => onSelect(point.iso3)}
                                    onKeyDown={(event) => onKeyDown(event, point.iso3)}
                                    onMouseEnter={() => setHovered(point.iso3)}
                                    onMouseLeave={() => setHovered(null)}
                                    onFocus={() => setHovered(point.iso3)}
                                    onBlur={() => setHovered(null)}
                                />
                            );
                        })}
                    </g>

                    {selectedDot !== undefined && (
                        <circle
                            key={selectedDot.point.iso3}
                            r={6.5}
                            style={{
                                fill: GROUP_COLOURS[selectedDot.point.group],
                                transform: at(selectedDot.x, selectedDot.y),
                            }}
                            className={styles.dotOverlay}
                            aria-hidden="true"
                        />
                    )}
                    <g aria-hidden="true">
                        {/* A label that changes side is a new label, so it fades in there. */}
                        {labels.map((label) => (
                            <text
                                key={`${label.iso3}-${label.anchor}`}
                                y={4}
                                textAnchor={label.anchor}
                                style={{ transform: at(label.x, label.y) }}
                                className={
                                    label.iso3 === selected ? styles.labelSelected : styles.label
                                }
                            >
                                {label.name}
                            </text>
                        ))}
                    </g>
                </svg>
            )}

            {hoveredDot !== undefined && (
                <div ref={tipRef} className={styles.tip} role="tooltip">
                    <div className={styles.tipTitle}>{hoveredDot.point.name}</div>
                    <div className={styles.tipRow}>
                        <span>Debt, % of GDP</span>
                        <b>{formatDebt(hoveredDot.point.debt)}</b>
                    </div>
                    <div className={styles.tipRow}>
                        <span>Peak service, % of revenue</span>
                        <b>{formatService(hoveredDot.point.peak)}</b>
                    </div>
                    <Thresholds capacity={hoveredDot.point.capacity} />
                    {hoveredDot.point.note !== null && (
                        <p className={styles.tipNote}>{hoveredDot.point.note}</p>
                    )}
                </div>
            )}
        </div>
    );
};
