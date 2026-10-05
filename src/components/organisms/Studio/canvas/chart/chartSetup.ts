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

        const { top, bottom } = chart.chartArea;
        const { ctx } = chart;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(active[0]!.element.x, top);
        ctx.lineTo(active[0]!.element.x, bottom);
        ctx.strokeStyle = options.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    },
};

ChartJS.register(hoverGuide);

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

// The external tooltip: ONE .chartTip element for all charts, parented to
// <body> and positioned in viewport space — no card's overflow can clip it.
// Built from the tooltip model — title = category, one row per series with
// a checkered swatch, wrapped label and bold value. Placed above the hovered
// index and clamped to the viewport.
let sharedTip: HTMLDivElement | null = null;

const htmlTooltip = ({
    chart,
    tooltip,
}: {
    chart: ChartJS;
    tooltip: TooltipModel<'bar'> | TooltipModel<'line'>;
}) => {
    if (!sharedTip) {
        sharedTip = document.createElement('div');
        sharedTip.className = styles.chartTip!;
        document.body.appendChild(sharedTip);

        // Touch: the tip shows on a tap (see `events` below) and goes away on
        // the next touch anywhere else — there's no mouseout to do it.
        document.addEventListener(
            'pointerdown',
            (event) => {
                if (
                    event.pointerType === 'touch' &&
                    !(event.target as HTMLElement).closest('canvas')
                ) {
                    sharedTip!.style.opacity = '0';
                }
            },
            { capture: true, passive: true },
        );
    }

    const tip = sharedTip;

    if (tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
        tip.style.opacity = '0';

        return;
    }

    // Theme variables live on the canvas root — copy them across so the
    // portaled tip picks up the same popup face and ink.
    const themeRoot = chart.canvas.closest<HTMLElement>('[style*="--th-"]');

    if (themeRoot) {
        for (const name of ['--th-popup', '--th-text']) {
            tip.style.setProperty(name, themeRoot.style.getPropertyValue(name));
        }
    }

    const title = tooltip.title.join(' ');
    const rows = tooltip.dataPoints
        .map((point) => {
            const [dark, light] = seriesPair(
                (chart.options as { seriesPalette?: SeriesPair[] }).seriesPalette ?? [],
                point.datasetIndex,
            ) ?? ['#484842', '#5e5e52'];
            const label = String(point.dataset.label ?? '');
            const value = formatAxis(point.parsed.y ?? 0);

            return `<span class="${styles.chartTipRow}"><span class="${styles.chartTipDot}" style="--series-dark:${dark};--series-light:${light}"></span><span class="${styles.chartTipLabel}">${escapeHtml(label)}</span><span class="${styles.chartTipValue}">${escapeHtml(value)}</span></span>`;
        })
        .join('');

    tip.innerHTML = `<span class="${styles.chartTipTitle}">${escapeHtml(title)}</span>${rows}`;
    tip.style.opacity = '1';

    // Anchor in viewport space: the canvas' rect + the tooltip's caret.
    const rect = chart.canvas.getBoundingClientRect();
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    const gap = 8;
    let x = rect.left + tooltip.caretX - tipW / 2;
    let y = rect.top + tooltip.caretY - tipH - gap;

    x = Math.max(gap, Math.min(window.innerWidth - tipW - gap, x));

    if (y < gap) {
        y = rect.top + tooltip.caretY + gap;
    }

    tip.style.transform = `translate(${x}px, ${y}px)`;
};

// Options are built per scale factor and theme — Chart.js draws in raw px,
// so every font/padding rides the same fluid factor as the grid, and every
// colour is the theme's resolved hex.
export const buildChartOptions = (scale: number, autoSkip: boolean, theme: ThemeDerived) => {
    // Small tick type on both axes — long names fit more text per line.
    const labelFont = { family: 'Outfit', size: Math.round(8 * scale), weight: 700 as const };

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
        // The HTML tooltip reads the palette off the options (it only gets
        // the chart, not our closure).
        seriesPalette: theme.series,
        // Hover finds the nearest category column, no need to touch the bar
        // itself — near-zero values stay hittable from the column's full
        // height.
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
            legend: { display: false },
            hoverGuide: { color: theme.muted },
            // The house popup as HTML (Chart.js's external tooltip): full
            // control of type and wrapping — series names wrap to two lines,
            // values are bold — see .chartTip in the SCSS.
            tooltip: {
                enabled: false,
                external: htmlTooltip,
            },
        },
        scales: {
            x: {
                grid: { display: false },
                border: { display: false },
                ticks: {
                    color: theme.text,
                    font: labelFont,
                    // Labels stay level while they fit and tilt up to 45°
                    // once they don't (short year runs never rotate).
                    maxRotation: 45,
                    autoSkip,
                    autoSkipPadding: 6 * scale,
                    callback(this: Scale, value: number | string): string {
                        return elideLabel(this.getLabelForValue(Number(value)));
                    },
                },
            },
            y: {
                beginAtZero: true,
                grid: { color: theme.line },
                border: { display: false },
                ticks: {
                    maxTicksLimit: 4,
                    color: theme.text,
                    font: labelFont,
                    // A touch of air between the values and the plot.
                    padding: Math.round(6 * scale),
                    callback: (value: number | string) => formatAxis(Number(value)),
                },
            },
        },
    };
};
