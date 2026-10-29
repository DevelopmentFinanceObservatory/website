import type { ScriptableContext } from 'chart.js';

import { seriesPair } from './chartSetup';

import type { ChartWidget } from '@/lib/chat/widgets';
import { BAR_THICKNESS } from '@/lib/studio/chartFit';
import { lonePoints } from '@/lib/studio/linePoints';
import type { SeriesPair, ThemeDerived } from '@/lib/studio/theme';

/**
 * A chart card's Chart.js datasets, bar and line. The fill of bars and of
 * line points is the checkered weave, which needs a DOM canvas in the
 * browser, so the caller hands in how a series pair becomes a fill.
 */

type DatasetInputs = {
    widget: ChartWidget;
    scale: number;
    theme: ThemeDerived;
    // Series the legend has parked, by index.
    hidden: readonly number[];
    fill: (pair: SeriesPair) => CanvasPattern | string;
};

// A legend tells series apart, so a chart of one series has none (the
// title names it), and neither has a transposed comparison, whose one
// series is the period already in the title.
export const legendShown = (widget: ChartWidget): boolean =>
    widget.series.length > 1 && widget.series.some((s) => s.label) && !widget.horizontal;

// A ranking's bars keep one thickness under their names.
export const barCap = (rows: boolean, scale: number): number => (rows ? BAR_THICKNESS : 28) * scale;

export const barDatasets = ({
    widget,
    scale,
    theme,
    hidden,
    fill,
    rows,
}: DatasetInputs & { rows: boolean }) => {
    const cap = barCap(rows, scale);

    return widget.series.map((s, si) => ({
        label: s.label,
        data: s.values,
        hidden: hidden.includes(si),
        // A transposed comparison runs as one series, so every bar
        // takes the accent: colour would otherwise repeat the name
        // the category axis already carries.
        backgroundColor: () => fill(seriesPair(theme.series, si)),
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
            const visible = chart.data.datasets.filter((_, i) => chart.isDatasetVisible(i)).length;
            const categories = chart.data.labels?.length || 1;

            if (!indexScale || !visible) {
                return 4 * scale;
            }

            const span = widget.horizontal ? indexScale.height : indexScale.width;
            const slot = (span / categories) * 0.8;
            const width = Math.min((slot / visible) * 0.9, cap);

            return Math.max(1, width / 3);
        },
        borderSkipped: (widget.horizontal ? 'left' : 'bottom') as 'left' | 'bottom',
        maxBarThickness: cap,
    }));
};

export const lineDatasets = ({ widget, scale, theme, hidden, fill }: DatasetInputs) => {
    const dotRadius = 3 * scale;
    const hoverRadius = 3.5 * scale;
    const borderWidth = 2.5 * scale;
    // Chart.js resolves a hovered point's ring from pointHoverBorderWidth,
    // then hoverBorderWidth, whose point default is 1.
    const hoverBorderWidth = 1;
    // Chart.js sizes the clip margin from the first and last points only,
    // so an interior dot on an axis limit would be cut; clip to the outer
    // edge of the lone dot or of the hover disc, whichever is larger.
    const clip = Math.max(dotRadius + borderWidth / 2, hoverRadius + hoverBorderWidth / 2);

    return widget.series.map((s, si) => ({
        label: s.label,
        data: s.values,
        hidden: hidden.includes(si),
        borderColor: seriesPair(theme.series, si)[0],
        // A missing value breaks the line, so a value with a gap on
        // both sides has no segment. It gets a dot, which Chart.js
        // fills from the dataset colours below, like the hover disc.
        pointRadius: lonePoints(s.values).map((lone) => (lone ? dotRadius : 0)),
        // The point fill (hover disc and lone dots): the checkered
        // weave of the bars. The tooltip swatch comes from seriesPalette.
        backgroundColor: () => fill(seriesPair(theme.series, si)),
        borderWidth,
        // Round joins keep a sharp dip or peak at an axis limit within
        // half the line width, inside the clip margin.
        borderJoinStyle: 'round' as const,
        pointHoverRadius: hoverRadius,
        pointHoverBorderWidth: hoverBorderWidth,
        pointHitRadius: 8 * scale,
        clip,
    }));
};
