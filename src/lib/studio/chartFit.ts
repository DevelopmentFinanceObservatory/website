/**
 * How tall a chart card is. The height follows the chart's shape: a ranking
 * of horizontal bars gives every category one grid cell, and every other
 * chart holds its plot box at a ratio against its own width: 16:9 until the
 * user drags the card's height, which sets the card's own ratio (plotRatio),
 * kept with the conversation. The card adds its own chrome (title, legend,
 * source line) and takes the sum in whole cells.
 *
 * Every length here is either a count of cells or a px figure that scales
 * with the cell, so a card's height in cells is the same at every window
 * width. `scale` is the cell over the 20 px design cell, as in the chart
 * options.
 */

import type { ChartWidget } from '../chat/widgets';

/** Cells of plot height one category takes in a ranking. */
export const ROW_PITCH = 1;

/** A ranking bar's thickness in px at scale 1. */
export const BAR_THICKNESS = 12;

/** The share of the plot's width a ranking's category names may take. */
export const GUTTER_SHARE = 0.34;

/** Width over height of the plot box of a line or vertical bar chart, until
 *  the user sets the card's own. */
export const PLOT_RATIO = 16 / 9;

/** The least plot height, in cells, a dragged height may leave: below it the
 *  height is not a ratio the plot can hold, and the drag sets none. */
export const PLOT_ROWS_MIN = 2;

/** The tallest a fitted card may be, in cells. */
export const FITTED_ROWS_MAX = 60;

/** Cells a ranking card may fall short of its need before it takes another
 *  cell, so a card that needs 20.03 cells is a 20-cell card. */
export const FIT_SLACK = 0.1;

/** Cells a ranking card that already has a height may fall short of its need
 *  and keep it. A height up to a whole cell over the need is kept too. */
export const KEEP_SHORTFALL = 0.2;

/** Cells a ratio card that already has a height may sit from its need, on
 *  either side, and keep it. That is half a cell, plus the same tenth of noise
 *  the ranking's band allows. */
export const KEEP_DISTANCE = 0.6;

/** The card's two 1 px borders along one axis, as a share of the cell: 2 px
 *  at the 20 px design cell. The drawn borders stay 1 px at every cell size,
 *  so counting their px would tie the height in cells to the window's width. */
export const CARD_BORDERS = 0.1;

/** Lines a category name may run to, and the line height Chart.js gives
 *  each as a multiple of the font size. */
export const LABEL_LINES = 2;
export const LABEL_LINE_HEIGHT = 1.2;

/** The axis label type in px. Left unrounded, so it scales with the cell. */
export const labelFontSize = (scale: number): number => 8 * scale;

export type PlotShape = { kind: 'rows'; rows: number } | { kind: 'ratio'; ratio: number };

type Shaped = Pick<ChartWidget, 'categories' | 'horizontal'>;

/** The plot's shape for a chart and its view. The bar view of a horizontal
 *  chart is rows, and a line or vertical bars take a ratio: the card's own
 *  when the user has set one, else the default. */
export const plotShape = (chart: Shaped, line: boolean, ratio = PLOT_RATIO): PlotShape =>
    chart.horizontal && !line
        ? { kind: 'rows', rows: chart.categories.length }
        : { kind: 'ratio', ratio };

/** The plot ratio a card's dragged height stands for: the plot's width over
 *  what the height leaves it under the chrome, in px that scale with the
 *  cell, so the ratio is the same at every window width. Null when the
 *  height leaves the plot under PLOT_ROWS_MIN cells. */
export const plotRatio = ({
    heightCells,
    chrome,
    plotWidth,
    cell,
}: {
    heightCells: number;
    chrome: number;
    plotWidth: number;
    cell: number;
}): number | null => {
    const plot = heightCells * cell - chrome;

    return plot >= PLOT_ROWS_MIN * cell && plotWidth > 0 ? plotWidth / plot : null;
};

/** The plot box's height in px. `band` is the height Chart.js gives the
 *  value axis under the bars of a ranking. A ratio plot ignores it. */
export const plotHeight = (
    shape: PlotShape,
    { plotWidth, band, cell }: { plotWidth: number; band: number; cell: number },
): number =>
    shape.kind === 'rows' ? shape.rows * ROW_PITCH * cell + band : plotWidth / shape.ratio;

/** The card's height in whole cells, from its chrome and plot heights in px.
 *  A ranking rounds up, less the slack, so no row falls below its pitch. A
 *  ratio plot rounds to the nearest cell. `current` is the height the card
 *  has now: one that already fits is kept, so a card whose need sits on a
 *  rounding boundary holds its saved height wherever it is opened. */
export const fittedRows = ({
    chrome,
    plot,
    cell,
    shape,
    current,
}: {
    chrome: number;
    plot: number;
    cell: number;
    shape: PlotShape;
    current?: number;
}): number => {
    const need = (chrome + plot) / cell;

    if (shape.kind === 'rows') {
        const fits = current != null && need - KEEP_SHORTFALL <= current && current < need + 1;

        return fits ? current : Math.ceil(need - FIT_SLACK);
    }

    return current != null && Math.abs(current - need) <= KEEP_DISTANCE
        ? current
        : Math.round(need);
};

// Budgets in cells for what a card measures once it mounts: the title, the
// left-out line and the source line; the legend's one line; the value axis
// under a ranking; and the card's padding on either side of the plot.
const CHROME_BUDGET = 7.5;
const LEGEND_BUDGET = 1;
const BAND_BUDGET = 2.5;
const INSET_BUDGET = 1.7;

/** The height in cells a fresh card spawns at, before anything is measured:
 *  the same rules over the budgets, so the measured fit moves the card by a
 *  cell or two at most. */
export const estimatedRows = (
    chart: Shaped & Pick<ChartWidget, 'series'>,
    line: boolean,
    widthCells: number,
): number => {
    const shape = plotShape(chart, line);
    const legend = shape.kind === 'ratio' && chart.series.length > 1 ? LEGEND_BUDGET : 0;

    return fittedRows({
        chrome: CHROME_BUDGET + legend,
        plot: plotHeight(shape, {
            plotWidth: widthCells - INSET_BUDGET,
            band: BAND_BUDGET,
            cell: 1,
        }),
        cell: 1,
        shape,
    });
};

/**
 * A category name set in the label gutter: whole while it fits, broken into
 * two lines at a word when it does not, and cut with an ellipsis only when
 * the second line still overflows. `fits` reports whether a string fits the
 * gutter in the label type.
 */
export const wrapLabel = (label: string, fits: (text: string) => boolean): string | string[] => {
    if (fits(label)) {
        return label;
    }

    const [head = '', ...words] = label.split(' ');
    let first = head;

    while (words[0] != null && fits(`${first} ${words[0]}`)) {
        first = `${first} ${words.shift()}`;
    }

    let second = words.join(' ');

    if (!second) {
        return first;
    }

    if (!fits(second)) {
        while (second.length > 1 && !fits(`${second}…`)) {
            second = second.slice(0, -1);
        }

        second = `${second.trimEnd()}…`;
    }

    return [first, second];
};
