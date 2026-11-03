'use client';

import classNames from 'classnames';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';

import { barDatasets, legendShown, lineDatasets } from '../chart/chartDatasets';
import {
    buildChartOptions,
    checkerPattern,
    type RowsLayout,
    seriesVars,
} from '../chart/chartSetup';
import cardStyles from './Card.module.scss';
import styles from './ChartCard.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';
import { cardEdges, type Fit, useFittedRows, useFontsReady } from './useFittedRows';

import { gridCell } from '@/hooks/useGridCell';
import type { ChartWidget } from '@/lib/chat/widgets';
import { chartAlt } from '@/lib/studio/chartAlt';
import { CARD_BORDERS, fittedRows, plotHeight, plotRatio, plotShape } from '@/lib/studio/chartFit';
import { legendLabels } from '@/lib/studio/seriesLabels';
import type { ThemeDerived } from '@/lib/studio/theme';

// The card's chrome in px (its padding, borders, row gaps and every child
// but the plot, each of which keeps its own height whatever the card's) and
// the width the plot gets at `widthCells`. The used heights come from
// computed style: fractional px, where offsetHeight rounds to whole px and
// getBoundingClientRect takes in the lift transform. The borders count as a
// share of the cell (CARD_BORDERS), so the figures scale with it.
const cardMetrics = (
    card: HTMLElement,
    plot: HTMLElement | null,
    widthCells: number,
    cell: number,
): { chrome: number; plotWidth: number } => {
    const cs = getComputedStyle(card);
    const borders = CARD_BORDERS * cell;
    let chrome =
        cardEdges(cs, 'vertical').padding +
        borders +
        (parseFloat(cs.rowGap) || 0) * (card.children.length - 1);

    for (const child of card.children) {
        if (child !== plot) {
            chrome += parseFloat(getComputedStyle(child).height) || 0;
        }
    }

    return {
        chrome,
        plotWidth: widthCells * cell - cardEdges(cs, 'horizontal').padding - borders,
    };
};

// A bar or line chart (Chart.js) with a clickable legend; `scale` is the
// fluid grid factor — Chart.js px must ride it like everything else.
//
// The card's height follows the chart (lib/studio/chartFit): it measures its
// own chrome, adds the height the plot's shape calls for, and asks the sheet
// for that many cells through `onFit`. A height the card already has
// (`heightCells`) is kept while it fits. The plot then takes what the card
// leaves it, so where the card is not given that height (an embed, the
// landing page) the chart draws in the box it has.
//
// A height the sheet gives the card that it did not ask for is one the user
// dragged (the grip is free in a ratio view, layout's heightIsFree). The card
// turns it into the plot ratio it stands for and reports it through
// `onRatio`; `ratio` is that ratio once the parent holds it, and every fit
// from then on (a new width, a reopened conversation, a share) keeps it.
const ChartCard = ({
    widget,
    line,
    scale,
    theme,
    widthCells,
    heightCells,
    onFit,
    ratio,
    onRatio,
    ...extras
}: {
    widget: ChartWidget;
    line?: boolean;
    scale: number;
    theme: ThemeDerived;
    widthCells: number;
    heightCells?: number;
    onFit: (rows: number) => void;
    ratio?: number;
    onRatio?: (ratio: number) => void;
} & CardExtras) => {
    const cardRef = useRef<HTMLElement>(null);
    const plotRef = useRef<HTMLDivElement>(null);

    const shape = useMemo(() => plotShape(widget, !!line, ratio), [widget, line, ratio]);
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

            const { chrome, plotWidth } = cardMetrics(card, plot, widthCells, cell);
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
    // The rows the card last asked for, so a height it did not ask for can
    // be told from its own fit's answer (clamped or not).
    const requestedRef = useRef<number | null>(null);
    const fit = useCallback(
        (cells: number) => {
            requestedRef.current = cells;
            onFit(cells);
        },
        [onFit],
    );
    const onLayout = useFittedRows({ cardRef, widthCells, token, measure, onFit: fit });

    // A height the user dragged becomes the card's ratio. Only once the card
    // has fitted (the spawned or restored height is not the user's), only at
    // the width of that fit (a new width's height is the fit's to answer),
    // and only where the plot holds a ratio.
    useEffect(() => {
        const card = cardRef.current;

        if (
            !card ||
            heightCells == null ||
            requestedRef.current == null ||
            heightCells === requestedRef.current ||
            measuredWidthRef.current !== widthCells ||
            shape.kind !== 'ratio'
        ) {
            return;
        }

        requestedRef.current = heightCells;

        const cell = gridCell();
        const { chrome, plotWidth } = cardMetrics(card, plotRef.current, widthCells, cell);
        const next = plotRatio({ heightCells, chrome, plotWidth, cell });

        if (next != null && next !== shape.ratio) {
            onRatio?.(next);
        }
    }, [heightCells, widthCells, shape, onRatio]);

    // Legend clicks park series here — a hidden series greys its legend
    // entry and drops out of the plot (the scale re-fits live).
    const [hiddenSeries, setHiddenSeries] = useState<number[]>([]);

    // The series the plot's hover names. The legend fades the others' entries.
    const [focusedSeries, setFocusedSeries] = useState<number | null>(null);
    const showLegend = legendShown(widget);

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
                legend: showLegend,
                onLayout,
                onFocus: setFocusedSeries,
            }),
        [widget, scale, theme, rows, fontsReady, showLegend, onLayout],
    );
    const barData = useMemo(
        () => ({
            labels: widget.categories,
            datasets: barDatasets({
                widget,
                scale,
                theme,
                hidden: hiddenSeries,
                fill: (pair) => checkerPattern(pair, scale),
                rows,
            }),
        }),
        [widget, scale, hiddenSeries, theme, rows],
    );
    const lineData = useMemo(
        () => ({
            labels: widget.categories,
            datasets: lineDatasets({
                widget,
                scale,
                theme,
                hidden: hiddenSeries,
                fill: (pair) => checkerPattern(pair, scale),
            }),
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
                                    focusedSeries !== null &&
                                        focusedSeries !== index &&
                                        styles.legendDim,
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
