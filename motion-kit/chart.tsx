import { Chart, type ChartConfiguration, type Plugin } from 'chart.js';
import type { CSSProperties, ReactNode } from 'react';

import { parseFont } from './fontMetrics.ts';
import { RecordedPattern, RecordingCanvas, type Shape, type Text } from './recorder.ts';

import {
    barDatasets,
    lineDatasets,
} from '@/components/organisms/Studio/canvas/chart/chartDatasets';
import {
    buildChartOptions,
    checkerPattern,
    type RowsLayout,
} from '@/components/organisms/Studio/canvas/chart/chartSetup';
import type { ChartWidget } from '@/lib/chat/widgets';
import { plotHeight, plotShape } from '@/lib/studio/chartFit';
import { valueAxisTitle } from '@/lib/studio/chartValue';
import type { ThemeDerived } from '@/lib/studio/theme';

/**
 * A chart card's plot without a browser. Chart.js runs in Node against a
 * recording 2D context, with the app's own options (`buildChartOptions`)
 * and datasets (`chartDatasets`), and draws one frame. What it drew becomes
 * an inline SVG for the shapes and absolutely placed HTML for every piece
 * of text, since the film animates words as HTML.
 */

export type MeasureText = (font: string, text: string) => number;

export type ChartLayout = {
    width: number;
    height: number;
    shapes: Shape[];
    texts: Text[];
    // The value axis as Chart.js built it.
    valueTicks: { value: number; label: string }[];
    valueTitle: string | null;
    // A ranking's value-axis band in px, as the last draw reported it; null
    // for other charts.
    band: number | null;
};

// The design cell; the generator lays out at a scale of 1.
const CELL = 20;
const SCALE = 1;

// A ranking's first layout, before it knows how tall its value axis is:
// the budget the app's estimate gives that axis (BAND_BUDGET in chartFit).
const FIRST_BAND = 2.5 * CELL;

// How many draws a ranking gets to settle its value axis.
const RANKING_PASSES = 10;

// `checkerPattern` builds its tile on a DOM canvas. While a chart is laid
// out, `document` makes recording canvases, so the tile is recorded as the
// app draws it. Chart.js reads the DOM only when `window` exists as well,
// so it keeps to its Node platform.
const withRecordingDocument = <T,>(measure: MeasureText, run: () => T): T => {
    const scope = globalThis as { document?: unknown };
    const previous = scope.document;

    scope.document = {
        createElement: () => new RecordingCanvas(0, 0, measure),
    };

    try {
        return run();
    } finally {
        scope.document = previous;
    }
};

const drawOnce = ({
    widget,
    line,
    theme,
    width,
    height,
    measure,
    onLayout,
}: {
    widget: ChartWidget;
    line: boolean;
    theme: ThemeDerived;
    width: number;
    height: number;
    measure: MeasureText;
    onLayout?: (layout: RowsLayout) => void;
}): Omit<ChartLayout, 'band'> => {
    const rows = plotShape(widget, line).kind === 'rows';
    const canvas = new RecordingCanvas(width, height, measure);
    const record = canvas.context;
    const options = buildChartOptions(SCALE, rows || widget.categories.length > 14, theme, {
        horizontal: widget.horizontal,
        unit: widget.unit,
        rows,
        onLayout,
    });
    const fill = (pair: [string, string]) => checkerPattern(pair, SCALE);
    const datasets = line
        ? lineDatasets({ widget, scale: SCALE, theme, hidden: [], fill })
        : barDatasets({ widget, scale: SCALE, theme, hidden: [], fill, rows });
    // Tells the record which dataset each shape belongs to.
    const tagDatasets: Plugin = {
        id: 'motionKitDatasets',
        beforeDatasetDraw: (_chart, { index }) => {
            record.dataset = index;
        },
        afterDatasetDraw: () => {
            record.dataset = null;
        },
    };
    const config = {
        type: line ? 'line' : 'bar',
        data: { labels: widget.categories, datasets },
        options: { ...options, responsive: false, animation: false, devicePixelRatio: 1 },
        plugins: [tagDatasets],
    } as ChartConfiguration;
    const chart = new Chart(canvas as unknown as HTMLCanvasElement, config);

    record.clear();
    chart.draw();

    const valueScale = chart.scales[widget.horizontal ? 'x' : 'y'];
    const title = valueAxisTitle(widget.unit);
    const layout = {
        width,
        height,
        shapes: record.shapes,
        texts: record.texts,
        valueTicks: (valueScale?.ticks ?? []).map((tick) => ({
            value: tick.value,
            label: String(tick.label),
        })),
        valueTitle: title.display ? title.text : null,
    };

    chart.destroy();

    return layout;
};

const fail = (message: string): never => {
    throw new Error(`chart: ${message}`);
};

/**
 * Lays a chart out at `width` px, at the height the app's plot box takes at
 * that width (`plotHeight`). A ranking's height depends on its value axis,
 * which Chart.js sizes from the height it is given, so it is redrawn until
 * the axis it reports gives back the height it was drawn at, the point
 * where ChartCard's measuring stops resizing the card. Throws when that
 * does not happen within a few draws.
 *
 * A short ranking can stop there with its axis unsettled (RowsLayout): one
 * or two rows give Chart.js too little height for the whole value axis, in
 * the Studio as here.
 */
export const layoutChart = ({
    widget,
    line,
    theme,
    width,
    measure,
}: {
    widget: ChartWidget;
    line: boolean;
    theme: ThemeDerived;
    width: number;
    measure: MeasureText;
}): ChartLayout =>
    withRecordingDocument(measure, () => {
        const shape = plotShape(widget, line);
        const heightFor = (band: number) =>
            Math.round(plotHeight(shape, { plotWidth: width, band, cell: CELL }));
        const draw = (height: number, onLayout?: (layout: RowsLayout) => void) =>
            drawOnce({ widget, line, theme, width, height, measure, onLayout });

        if (shape.kind !== 'rows') {
            return { ...draw(heightFor(0)), band: null };
        }

        let height = shape.rows * CELL + FIRST_BAND;

        for (let pass = 0; pass < RANKING_PASSES; pass++) {
            const reports: RowsLayout[] = [];
            const layout = draw(height, (report) => reports.push(report));
            const { band } = reports.at(-1) ?? fail(`ranking "${widget.id}" reported no layout`);

            if (heightFor(band) === height) {
                return { ...layout, band };
            }

            height = heightFor(band);
        }

        return fail(
            `ranking "${widget.id}" did not settle its value axis in ${RANKING_PASSES} draws`,
        );
    });

// --- SVG and HTML -------------------------------------------------------------

// Chart.js names the face ("Outfit"); the film's stylesheet supplies it
// through the same variable the app's CSS uses.
const fontStyle = (font: string): CSSProperties => {
    const { style, weight, size, family } = parseFont(font);

    return {
        fontStyle: style,
        fontWeight: weight,
        fontSize: `${size}px`,
        fontFamily: /outfit/i.test(family) ? 'var(--font-outfit)' : family,
    };
};

const ALIGN_X: Record<CanvasTextAlign, string> = {
    left: '0',
    start: '0',
    center: '-50%',
    right: '-100%',
    end: '-100%',
};

// With a line height of 1 the line box is the em box, so its middle is the
// canvas's "middle" baseline.
const ALIGN_Y: Record<CanvasTextBaseline, string> = {
    top: '0',
    hanging: '0',
    middle: '-50%',
    alphabetic: '-80%',
    ideographic: '-100%',
    bottom: '-100%',
};

const Label = ({ text }: { text: Text }) => (
    <span
        style={{
            position: 'absolute',
            left: text.x,
            top: text.y,
            lineHeight: 1,
            whiteSpace: 'pre',
            color: String(text.color),
            transformOrigin: '0 0',
            transform: `${text.rotation ? `rotate(${text.rotation.toFixed(4)}rad) ` : ''}translate(${ALIGN_X[text.align]}, ${ALIGN_Y[text.baseline]})`,
            ...fontStyle(text.font),
        }}
    >
        {text.text}
    </span>
);

const strokeProps = (shape: Shape) => ({
    fill: 'none',
    stroke: String(shape.paint),
    strokeWidth: shape.lineWidth,
    strokeLinecap: shape.lineCap,
    strokeLinejoin: shape.lineJoin,
    strokeDasharray: shape.lineDash.length ? shape.lineDash.join(' ') : undefined,
    opacity: shape.alpha === 1 ? undefined : shape.alpha,
});

export type SeriesPath = { index: number; hook: string; length: number | null };

/**
 * The plot as markup: one SVG of the shapes, the labels over it. A line's
 * segments become one path per series (`series-<card>-<i>`), with its
 * total length for a draw-on; a line's lone dots ride in
 * `points-<card>-<i>`; a bar series is a group of its bars.
 */
export const renderPlot = (
    layout: ChartLayout,
    cardId: string,
    line: boolean,
): { node: ReactNode; series: SeriesPath[] } => {
    const patterns = new Map<RecordedPattern, string>();
    const paintOf = (paint: unknown): string => {
        if (!(paint instanceof RecordedPattern)) {
            return String(paint);
        }

        let id = patterns.get(paint);

        if (!id) {
            id = `chk-${cardId}-${patterns.size}`;
            patterns.set(paint, id);
        }

        return `url(#${id})`;
    };
    const fillProps = (shape: Shape) => ({
        fill: paintOf(shape.paint),
        opacity: shape.alpha === 1 ? undefined : shape.alpha,
    });
    const shapeNode = (shape: Shape, key: number) =>
        shape.kind === 'stroke' ? (
            <path key={key} d={shape.d} {...strokeProps(shape)} />
        ) : (
            <path key={key} d={shape.d} {...fillProps(shape)} />
        );

    const scaleNodes = layout.shapes.filter((shape) => shape.dataset === null).map(shapeNode);
    const datasets = [...new Set(layout.shapes.flatMap((shape) => shape.dataset ?? []))].toSorted(
        (a, b) => a - b,
    );
    const series: SeriesPath[] = [];
    const seriesNodes = datasets.map((index) => {
        const own = layout.shapes.filter((shape) => shape.dataset === index);
        const hook = `series-${cardId}-${index}`;

        if (!line) {
            series.push({ index, hook, length: null });

            return (
                <g key={hook} data-v={hook}>
                    {own.map(shapeNode)}
                </g>
            );
        }

        // A line strokes each run between gaps on its own; a lone value's
        // dot is an arc, filled and ringed.
        const runs = own.filter((shape) => shape.kind === 'stroke' && !shape.d.includes('A'));
        const dots = own.filter((shape) => !runs.includes(shape));
        const length = runs.reduce((sum, shape) => sum + shape.length, 0);
        const pointsHook = `points-${cardId}-${index}`;

        series.push({ index, hook, length: Math.round(length * 100) / 100 });

        return (
            <g key={hook}>
                {runs.length > 0 && (
                    <path
                        data-v={hook}
                        d={runs.map((shape) => shape.d).join('')}
                        {...strokeProps(runs[0]!)}
                    />
                )}
                {dots.length > 0 && <g data-v={pointsHook}>{dots.map(shapeNode)}</g>}
            </g>
        );
    });

    const defs = [...patterns].map(([pattern, id]) => (
        <pattern
            key={id}
            id={id}
            width={pattern.width}
            height={pattern.height}
            patternUnits="userSpaceOnUse"
        >
            {pattern.shapes.map((shape, key) => (
                <path key={key} d={shape.d} fill={String(shape.paint)} />
            ))}
        </pattern>
    ));

    const node = (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: layout.width,
                height: layout.height,
            }}
        >
            <svg
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                aria-hidden="true"
                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
            >
                {defs.length > 0 && <defs>{defs}</defs>}
                {scaleNodes}
                {seriesNodes}
            </svg>
            {layout.texts.map((text, key) => (
                <Label key={key} text={text} />
            ))}
        </div>
    );

    return { node, series };
};
