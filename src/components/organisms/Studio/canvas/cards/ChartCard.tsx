'use client';

import type { ScriptableContext } from 'chart.js';
import classNames from 'classnames';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';

import {
    buildChartOptions,
    checkerPattern,
    type RowsLayout,
    seriesPair,
    seriesVars,
} from '../chart/chartSetup';
import cardStyles from './Card.module.scss';
import styles from './ChartCard.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';
import { cardEdges, type Fit, useFittedRows, useFontsReady } from './useFittedRows';

import type { ChartWidget } from '@/lib/chat/widgets';
import { chartAlt } from '@/lib/studio/chartAlt';
import {
    BAR_THICKNESS,
    CARD_BORDERS,
    fittedRows,
    plotHeight,
    plotShape,
} from '@/lib/studio/chartFit';
import { lonePoints } from '@/lib/studio/linePoints';
import { legendLabels } from '@/lib/studio/seriesLabels';
import type { ThemeDerived } from '@/lib/studio/theme';

// A bar or line chart (Chart.js) with a clickable legend; `scale` is the
// fluid grid factor — Chart.js px must ride it like everything else.
//
// The card's height follows the chart (lib/studio/chartFit): it measures its
// own chrome, adds the height the plot's shape calls for, and asks the sheet
// for that many cells through `onFit`. A height the card already has
// (`heightCells`) is kept while it fits. The plot then takes what the card
// leaves it, so where the card is not given that height (an embed, the
// landing page) the chart draws in the box it has.
const ChartCard = ({
    widget,
    line,
    scale,
    theme,
    widthCells,
    heightCells,
    onFit,
    ...extras
}: {
    widget: ChartWidget;
    line?: boolean;
    scale: number;
    theme: ThemeDerived;
    widthCells: number;
    heightCells?: number;
    onFit: (rows: number) => void;
} & CardExtras) => {
    const cardRef = useRef<HTMLElement>(null);
    const plotRef = useRef<HTMLDivElement>(null);

    const shape = useMemo(() => plotShape(widget, !!line), [widget, line]);
    const rows = shape.kind === 'rows';
    const fontsReady = useFontsReady();

    // The card's height in cells, read when it measures. It is the fit's own
    // output, so it stays out of the measuring token. A change here must not
    // ask for another measurement.
    const heightRef = useRef(heightCells);

    useEffect(() => {
        heightRef.current = heightCells;
    }, [heightCells]);

    // The width of this card's last measurement. The height it has is kept
    // only at that width (or at the first measurement, where it is the
    // restored or spawned one). A new width takes the canonical height, so
    // resizing out and back returns the card to where it started.
    const measuredWidthRef = useRef<number | null>(null);

    // Every length here scales with the cell, so the need in cells is the
    // same at every window width. `layout` is the last one a ranking's chart
    // reported.
    const measure = useCallback(
        (card: HTMLElement, cell: number, layout: RowsLayout | null): Fit | null => {
            const plot = plotRef.current;

            // A ranking waits for Chart.js to lay out at the plot's width.
            if (!plot || (rows && (!layout || Math.abs(layout.width - plot.clientWidth) > 1))) {
                return null;
            }

            const cs = getComputedStyle(card);
            const borders = CARD_BORDERS * cell;
            let chrome =
                cardEdges(cs, 'vertical').padding +
                borders +
                (parseFloat(cs.rowGap) || 0) * (card.children.length - 1);

            // The used height from computed style: fractional px, where
            // offsetHeight rounds to whole px and getBoundingClientRect takes
            // in the lift transform. Every child but the plot keeps its own
            // height whatever the card's.
            for (const child of card.children) {
                if (child !== plot) {
                    chrome += parseFloat(getComputedStyle(child).height) || 0;
                }
            }

            const plotWidth = widthCells * cell - cardEdges(cs, 'horizontal').padding - borders;
            const needed = plotHeight(shape, { plotWidth, band: layout?.band ?? 0, cell });
            const sameWidth =
                measuredWidthRef.current == null || measuredWidthRef.current === widthCells;

            measuredWidthRef.current = widthCells;

            return {
                rows: fittedRows({
                    chrome,
                    plot: needed,
                    cell,
                    shape,
                    current: sameWidth ? heightRef.current : undefined,
                }),
                settled: !rows || !!layout?.settled,
            };
        },
        [shape, rows, widthCells],
    );

    // One value per set of measuring inputs. The view is not among them,
    // because a switch remounts the card (see CardBody).
    const token = useMemo(
        () => ({ widget, widthCells, title: extras.title, fontsReady }),
        [widget, widthCells, extras.title, fontsReady],
    );
    const onLayout = useFittedRows({ cardRef, widthCells, token, measure, onFit });

    // Legend clicks park series here — a hidden series greys its legend
    // entry and drops out of the plot (the scale re-fits live).
    const [hiddenSeries, setHiddenSeries] = useState<number[]>([]);

    const toggleSeries = (index: number) =>
        setHiddenSeries((prev) =>
            prev.includes(index) ? prev.filter((other) => other !== index) : [...prev, index],
        );

    // Memoized so re-renders (drag, pan) hand Chart.js the same object and it
    // never re-evaluates the chart mid-interaction.
    const options = useMemo(
        // Every category keeps its label; only a truly dense axis (long year
        // runs) falls back to skipping, and a ranking in a card too short
        // for its rows.
        () =>
            buildChartOptions(scale, rows || widget.categories.length > 14, theme, {
                horizontal: widget.horizontal,
                unit: widget.unit,
                rows,
                fontsReady,
                onLayout,
            }),
        [widget, scale, theme, rows, fontsReady, onLayout],
    );
    // A ranking's bars keep one thickness under their names.
    const barCap = (rows ? BAR_THICKNESS : 28) * scale;
    const barData = useMemo(
        () => ({
            labels: widget.categories,
            datasets: widget.series.map((s, si) => ({
                label: s.label,
                data: s.values,
                hidden: hiddenSeries.includes(si),
                // A transposed comparison runs as one series, so every bar
                // takes the accent: colour would otherwise repeat the name
                // the category axis already carries.
                backgroundColor: () => checkerPattern(seriesPair(theme.series, si), scale),
                // Hover resolves the weave into the solid base color.
                hoverBackgroundColor: seriesPair(theme.series, si)[0],
                // The cap is a fixed fraction of the bar's width — clearly
                // rounded ("half-square") at every thickness, never a full
                // bulb. Bar elements aren't measured when options resolve,
                // so the width is derived from the scale: the category slot
                // shared by the visible datasets, with Chart.js's default
                // 0.8/0.9 category/bar percentages.
                borderRadius: (ctx: ScriptableContext<'bar'>) => {
                    const { chart } = ctx;
                    // The category slot is measured across the index axis,
                    // which is y once the chart is transposed.
                    const indexScale = chart.scales[widget.horizontal ? 'y' : 'x'];
                    const visible = chart.data.datasets.filter((_, i) =>
                        chart.isDatasetVisible(i),
                    ).length;
                    const categories = chart.data.labels?.length || 1;

                    if (!indexScale || !visible) {
                        return 4 * scale;
                    }

                    const span = widget.horizontal ? indexScale.height : indexScale.width;
                    const slot = (span / categories) * 0.8;
                    const width = Math.min((slot / visible) * 0.9, barCap);

                    return Math.max(1, width / 3);
                },
                borderSkipped: (widget.horizontal ? 'left' : 'bottom') as 'left' | 'bottom',
                maxBarThickness: barCap,
            })),
        }),
        [widget, scale, hiddenSeries, theme, barCap],
    );
    const lineData = useMemo(
        () => ({
            labels: widget.categories,
            datasets: widget.series.map((s, si) => ({
                label: s.label,
                data: s.values,
                hidden: hiddenSeries.includes(si),
                borderColor: seriesPair(theme.series, si)[0],
                // A missing value breaks the line, so a value with a gap on
                // both sides has no segment. It gets a dot in the solid base
                // colour, because the dataset fill below is the weave.
                pointRadius: lonePoints(s.values).map((lone) => (lone ? 3 * scale : 0)),
                pointBackgroundColor: seriesPair(theme.series, si)[0],
                pointBorderColor: seriesPair(theme.series, si)[0],
                // The tooltip swatch — the same checkered weave as the bars,
                // so both views' tooltips read identically.
                backgroundColor: () => checkerPattern(seriesPair(theme.series, si), scale),
                borderWidth: 2.5 * scale,
                pointHoverRadius: 3.5 * scale,
                pointHitRadius: 8 * scale,
            })),
        }),
        [widget, scale, hiddenSeries, theme],
    );

    // What a screen reader is told the canvas shows: Chart.js marks it
    // role="img" and leaves it unnamed, and the card's title is a separate
    // paragraph it never reaches (QA-87).
    const alt = useMemo(() => chartAlt(widget, !!line), [widget, line]);

    // Long names (WHO, UN) repeat the whole query in every series: the
    // legend shows what distinguishes them, the full name stays a hover
    // away (QA-57).
    const names = useMemo(() => legendLabels(widget.series.map((s) => s.label)), [widget]);

    // A legend tells series apart, so a chart of one series has none (the
    // title names it), and neither has a transposed comparison, whose one
    // series is the period already in the title.
    const showLegend =
        widget.series.length > 1 && widget.series.some((s) => s.label) && !widget.horizontal;

    return (
        <article ref={cardRef} className={cardStyles.card}>
            <CardHead {...extras} />

            {showLegend && (
                <ul className={styles.legend}>
                    {widget.series.map((s, index) => (
                        <li key={s.label}>
                            <button
                                type="button"
                                title={s.label}
                                // A toggle, so its state is announced: off
                                // means the series has left the plot.
                                aria-pressed={!hiddenSeries.includes(index)}
                                aria-label={`${s.label} — ${
                                    hiddenSeries.includes(index) ? 'show' : 'hide'
                                } this series`}
                                className={classNames(
                                    styles.legendItem,
                                    hiddenSeries.includes(index) && styles.legendOff,
                                )}
                                onClick={() => toggleSeries(index)}
                            >
                                <span
                                    className={styles.legendDot}
                                    style={seriesVars(theme.series, index)}
                                />
                                <span className={styles.legendName}>{names[index]}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div ref={plotRef} className={styles.plot}>
                {line ? (
                    <Line data={lineData} options={options} role="img" aria-label={alt} />
                ) : (
                    <Bar data={barData} options={options} role="img" aria-label={alt} />
                )}
            </div>
            <CardChrome source={widget.source} info={widget.info} onInfo={extras.onInfo} />
        </article>
    );
};

export default ChartCard;
