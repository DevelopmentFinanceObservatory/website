'use client';

import type { ScriptableContext } from 'chart.js';
import classNames from 'classnames';
import { useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';

import { buildChartOptions, checkerPattern, seriesPair, seriesVars } from '../chart/chartSetup';
import cardStyles from './Card.module.scss';
import styles from './ChartCard.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';

import type { ChartWidget } from '@/lib/chat/widgets';
import { legendLabels } from '@/lib/studio/seriesLabels';
import type { ThemeDerived } from '@/lib/studio/theme';

// A bar or line chart (Chart.js) with a clickable legend; `scale` is the
// fluid grid factor — Chart.js px must ride it like everything else.
const ChartCard = ({
    widget,
    line,
    scale,
    theme,
    ...extras
}: { widget: ChartWidget; line?: boolean; scale: number; theme: ThemeDerived } & CardExtras) => {
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
        // runs) falls back to skipping.
        () =>
            buildChartOptions(scale, widget.categories.length > 14, theme, {
                horizontal: widget.horizontal,
                unit: widget.unit,
            }),
        [widget, scale, theme],
    );
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
                    const width = Math.min((slot / visible) * 0.9, 28 * scale);

                    return Math.max(1, width / 3);
                },
                borderSkipped: (widget.horizontal ? 'left' : 'bottom') as 'left' | 'bottom',
                maxBarThickness: 28 * scale,
            })),
        }),
        [widget, scale, hiddenSeries, theme],
    );
    const lineData = useMemo(
        () => ({
            labels: widget.categories,
            datasets: widget.series.map((s, si) => ({
                label: s.label,
                data: s.values,
                hidden: hiddenSeries.includes(si),
                borderColor: seriesPair(theme.series, si)[0],
                // The tooltip swatch — the same checkered weave as the bars,
                // so both views' tooltips read identically.
                backgroundColor: () => checkerPattern(seriesPair(theme.series, si), scale),
                borderWidth: 2.5 * scale,
                pointRadius: 0,
                pointHoverRadius: 3.5 * scale,
                pointHitRadius: 8 * scale,
            })),
        }),
        [widget, scale, hiddenSeries, theme],
    );

    // Long names (WHO, UN) repeat the whole query in every series: the
    // legend shows what distinguishes them, the full name stays a hover
    // away (QA-57).
    const names = useMemo(() => legendLabels(widget.series.map((s) => s.label)), [widget]);

    // A lone "Value" is the table->chart converter's placeholder, and a
    // transposed comparison's one series is the period already in the title:
    // neither earns a legend.
    const showLegend =
        widget.series.some((s) => s.label) &&
        !widget.horizontal &&
        !(widget.series.length === 1 && widget.series[0]!.label === 'Value');

    return (
        <article className={cardStyles.card}>
            <CardHead {...extras} />

            {showLegend && (
                <ul className={styles.legend}>
                    {widget.series.map((s, index) => (
                        <li key={s.label}>
                            <button
                                type="button"
                                title={s.label}
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

            <div className={styles.plot}>
                {line ? (
                    <Line data={lineData} options={options} />
                ) : (
                    <Bar data={barData} options={options} />
                )}
            </div>
            <CardChrome source={widget.source} info={widget.info} onInfo={extras.onInfo} />
        </article>
    );
};

export default ChartCard;
