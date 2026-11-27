import type { ChartWidget } from '../chat/widgets';

import { formatPeriod } from './period.ts';

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

// A period of whole years: one year, or a span as the platform writes it
// (`2015/2024`) or as the card shows it (`2015–2024`).
const YEARS = /^(\d{4})(?:[/–](\d{4}))?$/;

// A span of years as a title writes it: "2015 to 2024", "2015–2024", "2015-2024".
const TITLE_SPAN = /\b(\d{4})\s*(?:to|[–—-])\s*(\d{4})\b/g;

/** Whether `title` names the span from `start` to `end`, or, when they are equal, names that year anywhere. */
const namesYears = (title: string, start: string, end: string): boolean => {
    const spans = [...title.matchAll(TITLE_SPAN)].map(([, from, to]) => [from, to]);

    if (start !== end) {
        return spans.some(([from, to]) => from === start && to === end);
    }

    const years: string[] = title.match(/\b\d{4}\b/g) ?? [];

    return years.includes(start);
};

// The title with the period said once. Years are compared as years, so a
// title that already reads "2015 to 2024" takes no "2015/2024", and a span
// is written the way titles write one. Any other period (a month, a day)
// is compared as text and written as the card shows it.
const titled = (title: string, period: string): string => {
    const years = YEARS.exec(period);

    if (!years) {
        return title.includes(period) || title.includes(formatPeriod(period))
            ? title
            : `${title}, ${formatPeriod(period)}`;
    }

    const [, start = '', end = start] = years;

    if (namesYears(title, start, end)) {
        return title;
    }

    return `${title}, ${start === end ? start : `${start} to ${end}`}`;
};
