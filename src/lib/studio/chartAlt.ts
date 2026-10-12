/**
 * A chart's alt text (QA-87).
 *
 * Chart.js draws into a canvas and marks it `role="img"`, which leaves a
 * screen reader announcing "graphic" and nothing else. The card's title
 * sits beside the canvas in its own paragraph, so it never reaches the
 * image either.
 *
 * Everything needed for a real description already comes down with the
 * card — the presentation MCP's years, unit and series — so the text is
 * built from that: what the chart is, what it covers, and where each
 * series starts and ends. Where there is nothing to read off, it falls
 * back to the title alone, which is the minimum the ticket asks for.
 */

import { legendLabels } from './seriesLabels.ts';
import { compact } from './statFace.ts';

import type { ChartWidget } from '@/lib/chat/widgets';

// Series read out in full before the rest are counted. Past this a listener
// is being read a spreadsheet, not a description.
const SERIES_READ = 8;

const sentence = (text: string): string => {
    const trimmed = text.trim();
    const opened = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

    return /[.!?]$/.test(opened) ? opened : `${opened}.`;
};

// Periods ("2000", "2000-Q1") read as a range; anything else is a list of
// things, and saying the first "to" the last would be nonsense.
const arePeriods = (categories: string[]): boolean => categories.every((c) => /^\d/.test(c));

/** The first and last category a series actually has a value for. */
const span = (
    values: (number | null)[],
    categories: string[],
): { from: string; to: string; first: number; last: number } | null => {
    const at = values.flatMap((value, index) => (value == null ? [] : [index]));
    const first = at[0];
    const last = at[at.length - 1];

    if (first === undefined || last === undefined) {
        return null;
    }

    return {
        from: categories[first] ?? '',
        to: categories[last] ?? '',
        first: values[first]!,
        last: values[last]!,
    };
};

// The table->chart converter's placeholder name: a lone "Value" says
// nothing a listener does not already have from the title.
const PLACEHOLDER = 'Value';

const seriesLine = (
    label: string,
    values: (number | null)[],
    categories: string[],
    several: boolean,
): string | null => {
    const reach = span(values, categories);

    if (!reach) {
        return null;
    }

    const name = label && label !== PLACEHOLDER ? `${label}: ` : '';

    // One point, or a series that never moves off its category, reads as a
    // value rather than a journey.
    if (reach.from === reach.to) {
        return `${name}${compact(reach.first)} in ${reach.from}`;
    }

    return several
        ? `${name}${compact(reach.first)} in ${reach.from} to ${compact(reach.last)} in ${reach.to}`
        : `${name}from ${compact(reach.first)} in ${reach.from} to ${compact(reach.last)} in ${reach.to}`;
};

/** What a screen reader is told the chart shows. */
export const chartAlt = (widget: ChartWidget, line: boolean): string => {
    const kind = line ? 'Line chart' : 'Bar chart';
    const title = widget.title?.trim();
    const head = title ? `${kind}. ${sentence(title)}` : `${kind}.`;

    const { categories, series } = widget;
    const named = series.filter((entry) => entry.values.some((value) => value != null));

    if (!categories.length || !named.length) {
        return head;
    }

    const unit = widget.info?.unit ?? widget.unit;
    const years = widget.info?.years;
    const covers = years
        ? `${years.start} to ${years.end}`
        : arePeriods(categories)
          ? `${categories[0]} to ${categories[categories.length - 1]}`
          : `${categories.length} categories`;
    const scope = [
        named.length > 1 ? `${named.length} series` : null,
        categories.length > 1 ? covers : categories[0],
        unit ? `in ${unit.toLowerCase()}` : null,
    ].filter(Boolean);

    // The same shortening the legend does: long indicator names repeat the
    // whole query, and a listener would hear it once per series.
    const names = legendLabels(named.map((entry) => entry.label));
    const read = named
        .slice(0, SERIES_READ)
        .flatMap(
            (entry, index) =>
                seriesLine(
                    names[index] ?? entry.label,
                    entry.values,
                    categories,
                    named.length > 1,
                ) ?? [],
        );
    const rest = named.length - SERIES_READ;

    return [
        head,
        scope.length ? sentence(scope.join(', ')) : null,
        read.length ? sentence(read.join('. ')) : null,
        rest > 0 ? sentence(`And ${rest} more series`) : null,
        widget.info?.sourceName ? sentence(`Source: ${widget.info.sourceName}`) : null,
    ]
        .filter(Boolean)
        .join(' ');
};
