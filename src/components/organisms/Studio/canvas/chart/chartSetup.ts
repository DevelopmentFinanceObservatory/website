import {
    BarController,
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    LinearScale,
    LineController,
    LineElement,
    Plugin,
    PointElement,
    Scale,
    Tooltip,
    TooltipModel,
} from 'chart.js';
import type { CSSProperties } from 'react';

import styles from '../cards/ChartCard.module.scss';

import { formatAxis } from '@/lib/chat/widgets';
import { GUTTER_SHARE, LABEL_LINE_HEIGHT, labelFontSize, wrapLabel } from '@/lib/studio/chartFit';
import { largestFirst, nearestPoint, separatingAxis } from '@/lib/studio/chartHover';
import { tooltipValue, valueAxisTitle, valueUnitOption } from '@/lib/studio/chartValue';
import { legendLabels } from '@/lib/studio/seriesLabels';
import type { SeriesPair, ThemeDerived } from '@/lib/studio/theme';

/**
 * Chart.js, configured once for the whiteboard: the registered controllers,
 * the crosshair plugin, the checkered bar pattern, the HTML tooltip and the
 * per-theme options. Colors and fonts are hardcoded hex/names like every
 * canvas in the app — CSS custom properties don't reach a 2D context, so
 * the theme's resolved hex values are threaded in as options.
 */

// Series pairs come from the active theme (lib/studio/theme); [base,
// lighter] per series — the pair drives the checkered fill (bars + legend
// swatches); lines stroke with the base alone.
export const seriesPair = (series: SeriesPair[], index: number): SeriesPair =>
    series[index % series.length]!;

export const seriesVars = (series: SeriesPair[], index: number): CSSProperties => {
    const [dark, light] = seriesPair(series, index);

    return { '--series-dark': dark, '--series-light': light } as CSSProperties;
};

ChartJS.register(
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip,
);
ChartJS.defaults.font.family = 'Outfit';

// Crosshair guide: with index-mode hover the whole column is a hit target
// (tiny bars stay reachable), and a vertical line marks the hovered index.
// Drawn before the datasets so it sits behind the bars/lines. The stroke
// colour rides in via chart.options.plugins.hoverGuide.
const hoverGuide: Plugin<'bar' | 'line', { color: string }> = {
    id: 'hoverGuide',
    beforeDatasetsDraw: (chart, _args, options) => {
        const active = chart.getActiveElements();

        if (!active.length) {
            return;
        }

        const { top, bottom, left, right } = chart.chartArea;
        const { ctx } = chart;
        const element = active[0]!.element;

        ctx.save();
        ctx.beginPath();

        // The guide crosses the index axis: a column on a time run, a row on
        // a transposed comparison.
        if (chart.options.indexAxis === 'y') {
            ctx.moveTo(left, element.y);
            ctx.lineTo(right, element.y);
        } else {
            ctx.moveTo(element.x, top);
            ctx.lineTo(element.x, bottom);
        }

        ctx.strokeStyle = options.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    },
};

ChartJS.register(hoverGuide);

// Tells the card each time the chart has laid itself out, so the card reads
// the layout it sized itself for and not the one before a resize. The
// callback rides in via chart.options.plugins.layoutReport.
const layoutReport: Plugin<'bar' | 'line', { onLayout?: (chart: ChartJS) => void }> = {
    id: 'layoutReport',
    afterLayout: (chart, _args, options) => options.onLayout?.(chart),
};

ChartJS.register(layoutReport);

// What a ranking's plot needs besides its rows, read off a finished layout
// at `width`. `settled` is false while the plot is too short for Chart.js
// to give the value axis its full height, which makes the band a low
// reading.
export type RowsLayout = { width: number; band: number; settled: boolean };

// The bars' checkered weave — the same pattern the SCSS mixin paints on the
// legend swatches, tiled from 3px squares of the series pair (scaled with
// the fluid grid). Needs a DOM canvas, so it's built lazily at first draw
// and cached per colour pair + tile size.
const patternCache = new Map<string, CanvasPattern | string>();

export const checkerPattern = (pair: SeriesPair, scale: number): CanvasPattern | string => {
    const tileSize = Math.max(2, Math.round(6 * scale));
    const [dark, light] = pair;
    const key = `${dark}:${light}:${tileSize}`;
    const cached = patternCache.get(key);

    if (cached) {
        return cached;
    }

    const tile = document.createElement('canvas');

    tile.width = tileSize;
    tile.height = tileSize;

    const ctx = tile.getContext('2d');
    let fill: CanvasPattern | string = dark;

    if (ctx) {
        const half = tileSize / 2;

        ctx.fillStyle = light;
        ctx.fillRect(0, 0, tileSize, tileSize);
        ctx.fillStyle = dark;
        ctx.fillRect(0, 0, half, half);
        ctx.fillRect(half, half, half, half);
        fill = ctx.createPattern(tile, 'repeat') ?? dark;
    }

    patternCache.set(key, fill);

    return fill;
};

// Long category names (creditors, indicators) tilt via Chart.js's own
// rotation once they stop fitting; a length cap keeps the tilted tail from
// eating the plot — the tooltip carries the full name.
const LABEL_MAX = 24;

const elideLabel = (label: string): string =>
    label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;

const escapeHtml = (text: string): string =>
    text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type ChartTooltip = TooltipModel<'bar'> | TooltipModel<'line'>;

// Where the pointer last stood over each chart, in canvas px, and the
// series its hover names. A chart without an entry in `focused` has nothing
// hovered.
const pointers = new WeakMap<ChartJS, { x: number; y: number }>();
const focused = new WeakMap<ChartJS, number>();

// Whether Shift is held (it lists every series in the tip), and whether the
// tip on show was drawn with it.
let shiftHeld = false;
let tipShift = false;

// What the card hears of the hover: the series named, or null when none.
type SeriesFocusOptions = { onFocus?: (index: number | null) => void };

const setFocus = (chart: ChartJS, index: number | undefined) => {
    if (focused.get(chart) === index) {
        return;
    }

    if (index === undefined) {
        focused.delete(chart);
    } else {
        focused.set(chart, index);
    }

    (chart.options.plugins as { seriesFocus?: SeriesFocusOptions }).seriesFocus?.onFocus?.(
        index ?? null,
    );
};

// The opacity of every series other than the one the hover names.
const DIMMED = 0.25;

// A parsed point's value, read along y, or along x on a transposed chart.
const valueOf = (chart: ChartJS, parsed: unknown): number | null | undefined =>
    (parsed as { x?: number | null; y?: number | null })[
        chart.options.indexAxis === 'y' ? 'x' : 'y'
    ];

// The hovered slot's point nearest the pointer (lib/studio/chartHover),
// measured across the slot for bars and by height for lines.
const nearestOf = (chart: ChartJS, tooltip: ChartTooltip) => {
    const points = tooltip.opacity === 0 ? [] : (tooltip.dataPoints ?? []);
    const indexAxis = chart.options.indexAxis === 'y' ? 'y' : 'x';
    const at = nearestPoint(
        points.map(({ element, parsed }) => ({
            x: element.x,
            y: element.y,
            value: valueOf(chart, parsed),
        })),
        pointers.get(chart) ?? { x: tooltip.caretX, y: tooltip.caretY },
        separatingAxis((chart.config as { type?: string }).type === 'bar', indexAxis),
    );

    return at == null ? undefined : points[at];
};

// The external tooltip: ONE .chartTip element for all charts, parented to
// <body> and positioned in viewport space — no card's overflow can clip it.
// It names the one series nearest the pointer, under the category as its
// title, with a checkered swatch, the series' legend name and its value.
// Holding Shift lists every series in the slot instead, largest first, the
// nearest marked. It sits up and to the right of the hovered point, clear of it,
// and flips to the other side of the point at the viewport's edges.
let sharedTip: HTMLDivElement | null = null;
// The chart whose hover the tip shows.
let tipChart: ChartJS | null = null;

const hoverless = (): boolean => window.matchMedia('(hover: none)').matches;

// Hides the tip of the chart that owns it, and with it that chart's hover:
// the guide, the solid bar and the faded series.
const dismissTip = () => {
    const chart = tipChart;

    if (!chart?.tooltip) {
        return;
    }

    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.setActiveElements([]);
    setFocus(chart, undefined);
    chart.draw();
};

// Redraws the tip on show when Shift goes down or up.
const onShift = (event: KeyboardEvent) => {
    const held = event.shiftKey;

    if (event.key !== 'Shift' || held === shiftHeld) {
        return;
    }

    shiftHeld = held;

    if (tipChart?.tooltip && focused.has(tipChart)) {
        htmlTooltip({ chart: tipChart, tooltip: tipChart.tooltip });
    }
};

const createTip = (): HTMLDivElement => {
    const tip = document.createElement('div');

    tip.className = styles.chartTip!;
    document.body.appendChild(tip);

    // Touch: the tip shows on a tap (see `events` below) and goes away on
    // the next touch anywhere else, since there is no mouseout to do it.
    document.addEventListener(
        'pointerdown',
        (event) => {
            if (event.pointerType === 'touch' && !(event.target as HTMLElement).closest('canvas')) {
                dismissTip();
            }
        },
        { capture: true, passive: true },
    );
    document.addEventListener('keydown', onShift);
    document.addEventListener('keyup', onShift);

    return tip;
};

// One row of the tip: the series' swatch, name and value.
const tipRow = (
    chart: ChartJS,
    point: ChartTooltip['dataPoints'][number],
    name: string,
    near: boolean,
): string => {
    const [dark, light] = seriesPair(
        (chart.options as { seriesPalette?: SeriesPair[] }).seriesPalette ?? [],
        point.datasetIndex,
    ) ?? ['#484842', '#5e5e52'];
    const rowClass = near ? `${styles.chartTipRow} ${styles.chartTipNear}` : styles.chartTipRow;

    return `<span class="${rowClass}"><span class="${styles.chartTipDot}" style="--series-dark:${dark};--series-light:${light}"></span><span class="${styles.chartTipLabel}">${escapeHtml(name)}</span><span class="${styles.chartTipValue}">${escapeHtml(tooltipValue(chart, point.parsed))}</span></span>`;
};

const htmlTooltip = ({ chart, tooltip }: { chart: ChartJS; tooltip: ChartTooltip }) => {
    sharedTip ??= createTip();

    const tip = sharedTip;
    const near = nearestOf(chart, tooltip);

    if (!near) {
        setFocus(chart, undefined);

        // Another chart's tip stays where it is.
        if (tipChart === chart) {
            tip.style.opacity = '0';
            tipChart = null;
        }

        return;
    }

    setFocus(chart, near.datasetIndex);
    tipChart = chart;
    tipShift = shiftHeld;

    // Theme variables live on the canvas root — copy them across so the
    // portaled tip picks up the same popup face and ink.
    const themeRoot = chart.canvas.closest<HTMLElement>('[style*="--th-"]');

    if (themeRoot) {
        for (const name of ['--th-popup', '--th-text']) {
            tip.style.setProperty(name, themeRoot.style.getPropertyValue(name));
        }
    }

    // The legend's short name (what tells this series from the others) when
    // the card shows a legend carrying the text they share, otherwise the
    // full name.
    const labels = chart.data.datasets.map((dataset) => String(dataset.label ?? ''));
    const names = (chart.options as { seriesShortNames?: boolean }).seriesShortNames
        ? legendLabels(labels)
        : labels;
    const points = tooltip.dataPoints ?? [];
    // The slot's series with a value, largest first.
    const order = largestFirst(points.map(({ parsed }) => valueOf(chart, parsed)));
    const title = `<span class="${styles.chartTipTitle}">${escapeHtml(tooltip.title.join(' '))}</span>`;

    if (shiftHeld) {
        tip.innerHTML =
            title +
            order
                .map((at) => {
                    const point = points[at]!;

                    return tipRow(
                        chart,
                        point,
                        names[point.datasetIndex] ?? '',
                        point.datasetIndex === near.datasetIndex,
                    );
                })
                .join('');
    } else {
        // Only a pointer can hold Shift.
        const hint =
            order.length > 1 && !hoverless()
                ? `<span class="${styles.chartTipHint}">Shift: every series</span>`
                : '';

        tip.innerHTML = title + tipRow(chart, near, names[near.datasetIndex] ?? '', false) + hint;
    }

    tip.style.opacity = '1';

    // Anchor in viewport space from the canvas' rect plus the hovered point.
    const rect = chart.canvas.getBoundingClientRect();
    const pointX = rect.left + near.element.x;
    const pointY = rect.top + near.element.y;
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    const gap = 12;
    const edge = 8;
    let x = pointX + gap;
    let y = pointY - gap - tipH;

    if (x + tipW > window.innerWidth - edge) {
        x = pointX - gap - tipW;
    }

    if (y < edge) {
        y = pointY + gap;
    }

    x = Math.max(edge, Math.min(window.innerWidth - tipW - edge, x));

    tip.style.transform = `translate(${x}px, ${y}px)`;
};

// Whether the hover names a series other than `index`.
const isDimmed = (chart: ChartJS, index: number): boolean => {
    const named = focused.get(chart);

    return named !== undefined && named !== index;
};

// The hover's focus. The pointer and Shift are tracked on every event.
// Chart.js calls the tooltip only when the slot changes, so this plugin
// redraws it when the nearest series changes within a slot (the pointer
// moving up a column of lines) or Shift goes down or up. While a series is
// named, every other series draws faded, and the card hears which
// (`onFocus`) to fade the others' legend entries. Registered after Tooltip,
// so its afterEvent runs once the tooltip has taken the event.
const seriesFocus: Plugin<'bar' | 'line', SeriesFocusOptions> = {
    id: 'seriesFocus',
    beforeEvent: (chart, { event }) => {
        if (event.x != null && event.y != null) {
            pointers.set(chart, { x: event.x, y: event.y });
        }

        if (event.native instanceof MouseEvent) {
            shiftHeld = event.native.shiftKey;
        }
    },
    afterEvent: (chart, args) => {
        const { tooltip } = chart;
        const shown = focused.get(chart);

        if (
            tooltip &&
            (nearestOf(chart, tooltip)?.datasetIndex !== shown ||
                (shown !== undefined && tipShift !== shiftHeld))
        ) {
            htmlTooltip({ chart, tooltip });
            args.changed = true;
        }
    },
    // A card removed mid-hover takes its tip with it.
    beforeDestroy: (chart) => {
        if (tipChart === chart) {
            tipChart = null;

            if (sharedTip) {
                sharedTip.style.opacity = '0';
            }
        }
    },
    beforeDatasetDraw: (chart, { index }) => {
        if (isDimmed(chart, index)) {
            chart.ctx.save();
            chart.ctx.globalAlpha = DIMMED;
        }
    },
    afterDatasetDraw: (chart, { index }) => {
        if (isDimmed(chart, index)) {
            chart.ctx.restore();
        }
    },
};

ChartJS.register(seriesFocus);

// Options are built per scale factor and theme — Chart.js draws in raw px,
// so every font/padding rides the same fluid factor as the grid, and every
// colour is the theme's resolved hex. The chart's unit sets how the value
// axis and the tooltip write a number: "5.33%" for a percentage, any other
// unit named in the axis title and beside each tooltip value.
//
// `rows` marks a ranking (see plotShape in lib/studio/chartFit). Every bar is
// named, a long name wraps to a second line, and `onLayout` hears what the
// plot needs beside its rows after each layout.
export const buildChartOptions = (
    scale: number,
    autoSkip: boolean,
    theme: ThemeDerived,
    {
        horizontal = false,
        unit,
        rows = false,
        fontsReady = true,
        legend = false,
        onLayout,
        onFocus,
    }: {
        horizontal?: boolean;
        unit?: string;
        rows?: boolean;
        fontsReady?: boolean;
        // Whether the card shows a legend, which carries the text the series
        // names share, so the tooltip can name a series by what is left.
        legend?: boolean;
        onLayout?: (layout: RowsLayout) => void;
        // Hears the series the hover names, null when none.
        onFocus?: (index: number | null) => void;
    } = {},
) => {
    // Small tick type on both axes — long names fit more text per line.
    // Chart.js keeps the text widths it measures for the life of a scale,
    // keyed by the font. Naming the fallback until the faces have loaded
    // gives the loaded face a clean set.
    const labelFont = {
        family: fontsReady ? 'Outfit' : 'Outfit, sans-serif',
        size: labelFontSize(scale),
        weight: 700 as const,
    };
    // Chart.js's own gap between an axis and its tick labels, scaled.
    const categoryPadding = 3 * scale;

    // A ranking's name set in the gutter: wrapped by what fits a share of
    // the plot's width in the label type.
    const gutterLabel = (chart: ChartJS, label: string): string | string[] => {
        const { ctx } = chart;
        const budget = chart.width * GUTTER_SHARE;

        ctx.save();
        ctx.font = `${labelFont.weight} ${labelFont.size}px ${labelFont.family}`;

        const wrapped = wrapLabel(label, (text) => ctx.measureText(text).width <= budget);

        ctx.restore();

        return wrapped;
    };

    // The inset Chart.js leaves above a ranking's rows: half the last
    // category's label plus the category tick padding, as `_calculatePadding`
    // in chart.js sets a vertical scale's `paddingTop`. Worked out from that
    // name and the tick options below, because the figure Chart.js holds
    // follows the last label auto-skip kept, and so the plot's height.
    const rowsInset = (chart: ChartJS): number => {
        const last = gutterLabel(chart, String(chart.data.labels?.at(-1) ?? ''));
        const lines = Array.isArray(last) ? last.length : 1;

        return (lines * labelFont.size * LABEL_LINE_HEIGHT) / 2 + categoryPadding;
    };

    // The band is everything in the plot but the rows, which is the value
    // axis and the inset above the first row.
    const reportLayout = (chart: ChartJS) => {
        const axis = chart.scales.x;

        if (!axis || !onLayout) {
            return;
        }

        onLayout({
            width: chart.width,
            band: axis.height + rowsInset(chart),
            settled: axis.height < axis.maxHeight,
        });
    };

    // No hover (touch): the tooltip comes on a tap, not on a finger dragging
    // across the plot (that's a pan of the sheet), and leaves on the next
    // touch elsewhere (the document listener above).
    const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

    return {
        responsive: true,
        maintainAspectRatio: false,
        events: (touch
            ? ['click', 'mouseout']
            : [
                  'mousemove',
                  'mouseout',
                  'click',
                  'touchstart',
                  'touchmove',
              ]) as (keyof HTMLElementEventMap)[],
        // The HTML tooltip reads the palette and the unit off the options
        // (it only gets the chart, not our closure).
        seriesPalette: theme.series,
        seriesShortNames: legend,
        ...valueUnitOption(unit),
        // Hover finds the nearest category slot, no need to touch the bar
        // itself — near-zero values stay hittable from the slot's full
        // width. The search runs ACROSS the slots, so it follows the index
        // axis: down the rows on a transposed comparison, along the columns
        // otherwise. The tooltip then names the slot's series nearest the
        // pointer (seriesFocus above).
        interaction: {
            mode: 'index' as const,
            intersect: false,
            axis: (horizontal ? 'y' : 'x') as 'x' | 'y',
        },
        plugins: {
            legend: { display: false },
            hoverGuide: { color: theme.muted },
            layoutReport: { onLayout: rows ? reportLayout : undefined },
            seriesFocus: { onFocus },
            // The house popup as HTML (Chart.js's external tooltip) gives full
            // control of type and wrapping. The series name wraps to two
            // lines and the value is bold (see .chartTip in the SCSS).
            tooltip: {
                enabled: false,
                external: htmlTooltip,
            },
        },
        indexAxis: (horizontal ? 'y' : 'x') as 'x' | 'y',
        scales: {
            // The category axis carries the names, the value axis the
            // numbers — which one is x and which is y flips with the
            // orientation, the configs do not.
            [horizontal ? 'y' : 'x']: {
                grid: { display: false },
                border: { display: false },
                ticks: {
                    color: theme.text,
                    font: labelFont,
                    // Labels stay level while they fit and tilt up to 45°
                    // once they don't (short year runs never rotate).
                    maxRotation: 45,
                    autoSkip,
                    // Two lines of a ranking's name fill the row's pitch, so
                    // any padding there would skip names a full pitch holds.
                    autoSkipPadding: rows ? 0 : 6 * scale,
                    padding: categoryPadding,
                    callback(this: Scale, value: number | string): string | string[] {
                        const label = this.getLabelForValue(Number(value));

                        return rows ? gutterLabel(this.chart, label) : elideLabel(label);
                    },
                },
            },
            [horizontal ? 'x' : 'y']: {
                beginAtZero: true,
                // Chart.js's own tick mark and title padding, scaled like
                // the rest. The axis is part of a ranking card's height.
                grid: { color: theme.line, tickLength: 8 * scale },
                border: { display: false },
                // The unit in words beside the numbers. A percentage's ticks
                // carry the % sign instead.
                title: {
                    ...valueAxisTitle(unit),
                    color: theme.text,
                    font: labelFont,
                    padding: 4 * scale,
                },
                ticks: {
                    maxTicksLimit: 4,
                    color: theme.text,
                    font: labelFont,
                    // A touch of air between the values and the plot.
                    padding: 6 * scale,
                    callback: (value: number | string) => formatAxis(Number(value), unit),
                },
            },
        },
    };
};
