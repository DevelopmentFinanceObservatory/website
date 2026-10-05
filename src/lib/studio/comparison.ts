import type { ChartWidget } from '../chat/widgets';

/**
 * Bars over a single period compare named things, not moments: the series ARE
 * the categories. Transposed, the names run down the side and the value axis
 * carries the amount, so nothing is encoded twice — one period means a colour
 * per series would stand for nothing, and the card draws a single colour once
 * there is one series. The period moves into the title, where a constant
 * belongs.
 *
 * The platform resolves this shape itself on an entity-mode chart, handing us
 * the plot already transposed; `transposedPeriod` names that period, and the
 * chart only needs marking. Without it the fact-summary sketch is tested the
 * same way and transposed here.
 *
 * `horizontal` is always set, so a chart redrawn from a fresh payload loses
 * the shape as readily as it gains it.
 */
export const comparison = (
    chart: ChartWidget,
    categories: string[],
    series: { label: string; values: (number | null)[] }[],
    transposedPeriod?: string | null,
): ChartWidget => {
    if (chart.chartType !== 'bar') {
        return chart;
    }

    if (transposedPeriod) {
        return { ...chart, title: titled(chart.title, transposedPeriod), horizontal: true };
    }

    const period = categories[0];

    if (categories.length !== 1 || series.length < 2 || !period) {
        return { ...chart, horizontal: false };
    }

    return {
        ...chart,
        title: titled(chart.title, period),
        categories: series.map((entry) => entry.label),
        series: [{ label: period, values: series.map((entry) => entry.values[0] ?? null) }],
        horizontal: true,
    };
};

const titled = (title: string, period: string): string =>
    title.includes(period) ? title : `${title}, ${period}`;
