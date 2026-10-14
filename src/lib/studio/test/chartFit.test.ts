/**
 * `chartFit.ts`: a chart card's height in cells from its shape and chrome,
 * and the two-line rule for a ranking's category names. The px figures were
 * measured at a 23.390625 px cell on a 22-cell card.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartWidget } from '../../chat/widgets.ts';
import {
    CARD_BORDERS,
    FIT_SLACK,
    LABEL_LINE_HEIGHT,
    LABEL_LINES,
    PLOT_RATIO,
    ROW_PITCH,
    estimatedRows,
    fittedRows,
    labelFontSize,
    plotHeight,
    plotShape,
    wrapLabel,
    type PlotShape,
} from '../chartFit.ts';

const CELL = 23.390625;
const PLOT_WIDTH = 475;

const chart = (categories: number, series: number, horizontal: boolean): ChartWidget => ({
    kind: 'chart',
    id: 'fit_1',
    chartType: 'bar',
    title: 'External debt service by creditor',
    categories: Array.from({ length: categories }, (_, index) => `Creditor ${index}`),
    series: Array.from({ length: series }, (_, index) => ({ label: `S${index}`, values: [] })),
    horizontal,
});

const fitted = (shape: PlotShape, chrome: number, band: number, cell = CELL, width = PLOT_WIDTH) =>
    fittedRows({
        chrome,
        plot: plotHeight(shape, { plotWidth: width, band, cell }),
        cell,
        shape,
    });

test('the view decides the shape: rows for the bars of a horizontal chart only', () => {
    const ranking = chart(24, 1, true);

    assert.deepEqual(plotShape(ranking, false), { kind: 'rows', rows: 24 });
    assert.deepEqual(plotShape(ranking, true), { kind: 'ratio', ratio: PLOT_RATIO });
    assert.deepEqual(plotShape(chart(24, 1, false), false), { kind: 'ratio', ratio: PLOT_RATIO });
});

// Chrome and value-axis band in px at the 23.390625 px cell, the chrome less
// the 2 px of border the fit counts as a share of the cell.
const MEASURED: [
    name: string,
    widget: ChartWidget,
    line: boolean,
    chrome: number,
    band: number,
    cells: number,
][] = [
    ['24-row ranking', chart(24, 1, true), false, 169.703125, 60, 34],
    ['10-row ranking', chart(10, 1, true), false, 169.703125, 60, 20],
    ['four-series line chart', chart(22, 4, false), true, 195.4375, 0, 20],
];

for (const [name, widget, line, chrome, band, cells] of MEASURED) {
    test(`a measured ${name} takes ${cells} cells`, () => {
        assert.equal(fitted(plotShape(widget, line), chrome + CARD_BORDERS * CELL, band), cells);
    });

    test(`the ${name} spawns within two cells of its fit`, () => {
        assert.ok(Math.abs(estimatedRows(widget, line, 22) - cells) <= 2);
    });
}

test('a ranking plot is one pitch per row plus the band; a ratio plot follows its width', () => {
    assert.equal(
        plotHeight({ kind: 'rows', rows: 10 }, { plotWidth: 475, band: 60, cell: 20 }),
        10 * ROW_PITCH * 20 + 60,
    );
    assert.equal(
        plotHeight({ kind: 'ratio', ratio: 2 }, { plotWidth: 475, band: 60, cell: 20 }),
        237.5,
    );
});

test('a ranking rounds up past the slack, and not within it', () => {
    const shape: PlotShape = { kind: 'rows', rows: 10 };
    const rows = (cells: number) => fittedRows({ chrome: 0, plot: cells * 20, cell: 20, shape });

    assert.equal(rows(20), 20);
    assert.equal(rows(20 + FIT_SLACK / 2), 20, 'whole-px rounding does not cost a cell');
    assert.equal(rows(20 + FIT_SLACK * 2), 21, 'a row is never squeezed below its pitch');
    assert.equal(rows(20.5), 21);
});

test('a ratio plot rounds to the nearest cell', () => {
    const shape: PlotShape = { kind: 'ratio', ratio: PLOT_RATIO };
    const rows = (cells: number) => fittedRows({ chrome: 0, plot: cells * 20, cell: 20, shape });

    assert.equal(rows(19.4), 19);
    assert.equal(rows(19.6), 20);
});

const RANKING: PlotShape = { kind: 'rows', rows: 10 };
const RATIO: PlotShape = { kind: 'ratio', ratio: PLOT_RATIO };

// A height that already fits is kept. Any other gives way to the canonical
// one, which is also the answer for a card with no height yet.
const KEPT: [
    name: string,
    shape: PlotShape,
    need: number,
    current: number | undefined,
    cells: number,
][] = [
    ['a ranking on its need keeps 20', RANKING, 20.09, 20, 20],
    ['a ranking a cell over its need keeps 21', RANKING, 20.09, 21, 21],
    ['a ranking with no height takes the canonical 20', RANKING, 20.09, undefined, 20],
    ['a ranking short of its need leaves 20', RANKING, 20.3, 20, 21],
    ['a ranking far from its need takes the canonical 35', RANKING, 34.3, 14, 35],
    ['a ratio card under its need keeps 19', RATIO, 19.5, 19, 19],
    ['a ratio card over its need keeps 20', RATIO, 19.5, 20, 20],
    ['a ratio card with no height takes the canonical 20', RATIO, 19.5, undefined, 20],
    ['a ratio card well under its need leaves 18', RATIO, 19.5, 18, 20],
    ['a ratio card well over its need leaves 21', RATIO, 19.5, 21, 20],
    ['a ratio card past the band leaves 19', RATIO, 19.65, 19, 20],
];

for (const [name, shape, need, current, cells] of KEPT) {
    test(name, () => {
        assert.equal(fittedRows({ chrome: 0, plot: need * 20, cell: 20, shape, current }), cells);
    });
}

// The design cell. `scale` is the live cell over it.
const GRID_CELL = 20;

test('two label lines fit one row pitch at every scale', () => {
    for (const scale of [0.5, 0.7, 1, 1.16953125, 1.5, 2]) {
        const lines = LABEL_LINES * LABEL_LINE_HEIGHT * labelFontSize(scale);

        assert.ok(lines <= ROW_PITCH * GRID_CELL * scale, `scale ${scale}`);
    }
});

// Chrome, band and plot width all scale with the cell. The chrome steps
// through a cell in twentieths so that some case sits close under a rounding
// boundary, where a length that did not scale would tip the small cells over.
test('the height in cells does not depend on the cell size', () => {
    const shapes: [PlotShape, bandCells: number][] = [
        [{ kind: 'rows', rows: 24 }, 2.8],
        [{ kind: 'ratio', ratio: PLOT_RATIO }, 0],
    ];

    for (const [shape, bandCells] of shapes) {
        for (let step = 0; step < 20; step += 1) {
            const chromeCells = 7.02 + step * 0.05;
            const cells = new Set<number>();

            for (let cell = 14; cell <= 30; cell += 0.5) {
                cells.add(fitted(shape, chromeCells * cell, bandCells * cell, cell, 20.3 * cell));
            }

            assert.equal(
                cells.size,
                1,
                `${shape.kind}, chrome ${chromeCells}: ${[...cells].join(', ')}`,
            );
        }
    }
});

// A gutter that holds a fixed number of characters stands in for the canvas.
const within = (max: number) => (text: string) => text.length <= max;

test('a name that fits the gutter stays whole', () => {
    assert.equal(wrapLabel('Bondholders', within(30)), 'Bondholders');
});

test('a long name wraps at a word break', () => {
    assert.deepEqual(
        wrapLabel('International Bank for Reconstruction and Development', within(30)),
        ['International Bank for', 'Reconstruction and Development'],
    );
});

test('a second line that still overflows is cut with an ellipsis', () => {
    const lines = wrapLabel(
        'Arab Bank for Economic Development in Africa and its partners',
        within(24),
    );

    assert.deepEqual(lines, ['Arab Bank for Economic', 'Development in Africa a…']);
    assert.ok(within(24)(lines[1]!));
});

test('a single word too long for the gutter is left whole', () => {
    assert.equal(wrapLabel('Bondholders', within(5)), 'Bondholders');
});
