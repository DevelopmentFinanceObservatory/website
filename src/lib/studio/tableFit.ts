/**
 * The table card's display table and its size before anything is measured.
 *
 * `tableDisplay` builds what a table card shows from its widget, once for
 * every caller, so the width a fresh card spawns at is the width of the text
 * the card renders. `tableWidthCells` and `tableRows` estimate the card's
 * width and height in grid cells from that text, with Outfit's advance widths
 * (`outfitAdvances.ts`) at the card's type sizes. They err wide and tall: a
 * cell too many shows a little white space and a cell too few a scrollbar.
 *
 * Every px figure is at the 20 px design cell (a 16 px root), as the card's
 * rem sizes are, so the cell counts hold at every window width. The figures
 * mirror `TableCard.module.scss`, `Card.module.scss` and
 * `CardChrome.module.scss`. A change to one changes the other.
 */

import { type CardData, sourceLine, type TableWidget } from '../chat/widgets.ts';
import { leftOutOf } from './liveCards.ts';
import { OUTFIT_ADVANCES, OUTFIT_CHARS } from './outfitAdvances.ts';
import { tableView, type TableUnit, type TableView } from './tableView.ts';

/** The design cell in px. */
export const CELL_PX = 20;

/** The width in cells a table spawns at by default, and the width a table
 *  that does not fit it is transposed to fit. Layout's `SPAN_DEFAULT.table.w`
 *  takes this value. */
export const TABLE_WIDTH_DEFAULT = 22;

/** Body rows a collapsed table shows; past it, a "Show all" control. */
export const TABLE_ROWS_COLLAPSED = 10;

/** The widest a header label runs before it wraps, in px: the label and its
 *  sort arrow together. */
export const HEADER_LABEL_MAX = 84;

/** The widest a body row's label runs in the held first column, in px,
 *  before it ends in an ellipsis: 39% of the narrowest table card's table
 *  (SPAN_MIN.table.w, 406 px inside the card), so the value columns keep
 *  most of every card. */
export const ROW_LABEL_MAX = 160;

// Type: 10 px Outfit in the table at line height 1.3, and the caption at 1.35.
// The title and the source line are weight 300 at 12 px.
const TABLE_TYPE = 10;
const TABLE_LINE = 13;
const CAPTION_LINE = 13.5;
const TITLE_TYPE = 12;
const TITLE_LINE = 13.2;
const FOOT_TYPE = 12;
const FOOT_LINE = 15.6;

// The card: 1 px border, 16 px padding and 16 px between its blocks.
const CARD_BORDER = 1;
const CARD_PADDING = 16;
const CARD_GAP = 16;

// The head: the title beside the pin and kebab (two 16 px icons, pulled 8 px
// into the padding, 12 px apart from the title), which set its least height.
const ACTIONS_WIDTH = 30;
const TITLE_GAP = 12;
const HEAD_MIN = 20;

// The caption pulls 6 px toward the table.
const CAPTION_PULL = 6;

// A cell's side padding, the header's top and bottom padding, and a body
// row's top and bottom padding and its 1 px rule. The first body row has 4 px more on top, and the
// last has no rule.
const CELL_PAD_X = 12;
const HEADER_PAD_Y = 10;
const ROW_PAD_Y = 7;
const ROW_RULE = 1;
const FIRST_ROW_EXTRA = 4;

// The sort arrow sits 3 px after its label.
const ARROW_GAP = 3;
const ARROW = '↑';

// "Show all N rows": a 1 px rule, 7 px above its 13 px line, in place of the
// gap above it.
const SHOW_ALL = 1 + 7 + TABLE_LINE;

// A sideways scrollbar under a table wider than its card. Chrome draws it at
// 4 px and Firefox's thin bar is 8 px. The larger is budgeted.
const SCROLLBAR = 8;

// The foot: what the data leaves out on one line, 8 px above the source line,
// and "Built with" and its mark beside the source line.
const LEFT_OUT_GAP = 8;
const BUILT_WITH_WIDTH = 80;
const BUILT_WITH_GAP = 10;
const SOURCE_ICON = 14;

// px added to the natural width before it is taken in whole cells, for the
// letter-spacing, subpixel rounding and fallback faces the advances miss.
const WIDTH_SLACK = 4;

type Weight = keyof typeof OUTFIT_ADVANCES;

const advanceTables = new Map<Weight, Map<string, number>>();

const advancesOf = (weight: Weight): Map<string, number> => {
    let table = advanceTables.get(weight);

    if (!table) {
        const advances = OUTFIT_ADVANCES[weight];
        const chars = [...OUTFIT_CHARS];
        const widest = Math.max(...advances);
        // Table figures are tabular: every digit takes the widest digit's room.
        const digit = Math.max(...[...'0123456789'].map((char) => advances[chars.indexOf(char)]!));

        table = new Map(chars.map((char, at) => [char, /\d/.test(char) ? digit : advances[at]!]));
        // A character outside the table counts as the widest one.
        table.set('', widest);
        advanceTables.set(weight, table);
    }

    return table;
};

/** `text`'s width in px in Outfit at `weight` and `size` px, digits tabular,
 *  kerning left out. A character the table lacks counts as the widest. */
export const textWidth = (text: string, weight: Weight, size: number): number => {
    const advances = advancesOf(weight);
    let units = 0;

    for (const char of text) {
        units += advances.get(char) ?? advances.get('')!;
    }

    return (units / 1000) * size;
};

/** The lines `text` breaks into at spaces within `width` px. A word wider
 *  than the width takes a line of its own. Blank text takes no line. */
export const wrappedLines = (text: string, width: number, weight: Weight, size: number): number => {
    const words = text.split(/\s+/).filter(Boolean);
    const space = textWidth(' ', weight, size);
    let lines = 0;
    let line = Infinity;

    for (const word of words) {
        const wide = textWidth(word, weight, size);

        if (line + space + wide <= width) {
            line += space + wide;
        } else {
            lines += 1;
            line = wide;
        }
    }

    return lines;
};

const arrowBlock = (): number => ARROW_GAP + textWidth(ARROW, 400, TABLE_TYPE);

/** Whether `unit` fits two lines of a value column's header. */
export const unitFitsHeader = (unit: string): boolean =>
    wrappedLines(unit, HEADER_LABEL_MAX - arrowBlock(), 400, TABLE_TYPE) <= 2;

// A header label's own width, wrapped at HEADER_LABEL_MAX unless one word is
// wider, and its lines.
const headerBox = (label: string): { width: number; lines: number } => {
    const arrow = arrowBlock();
    const whole = textWidth(label, 400, TABLE_TYPE) + arrow;

    if (whole <= HEADER_LABEL_MAX) {
        return { width: whole, lines: 1 };
    }

    const longest = Math.max(
        ...label.split(/\s+/).map((word) => textWidth(word, 400, TABLE_TYPE) + arrow),
    );

    return {
        width: Math.max(HEADER_LABEL_MAX, longest),
        lines: Math.max(1, wrappedLines(label, HEADER_LABEL_MAX - arrow, 400, TABLE_TYPE)),
    };
};

// The table's natural width in px: each column as wide as its widest cell
// (body cells bold but the first, on one line) or its header label. The
// first column's body labels stop at ROW_LABEL_MAX.
const tableWidthPx = (view: TableView): number =>
    view.columns.reduce((sum, label, index) => {
        const widest = Math.max(
            0,
            ...view.rows.map((row) =>
                textWidth(row[index]?.text ?? '', index === 0 ? 400 : 700, TABLE_TYPE),
            ),
        );
        const body = index === 0 ? Math.min(widest, ROW_LABEL_MAX) : widest;

        return sum + Math.max(body, headerBox(label).width) + 2 * CELL_PAD_X;
    }, 0);

const CARD_INSET = 2 * (CARD_BORDER + CARD_PADDING);

/** What a table card shows: the display table, and whether it runs the
 *  widget's cells transposed (series down the side, periods across). */
export type TableDisplay = { view: TableView; transposed: boolean };

/** The cells a table card is built from. */
export type TableCells = Pick<TableWidget, 'columns' | 'rows' | 'namesColumn'>;

/** `cells` turned on their side: the first column's cells become the header,
 *  the headers after the first become the first column, which holds the
 *  names (`namesColumn: 0`) under a blank header. Run it on the widget's raw
 *  cells, before `tableView`, so the display rules apply to the axis shown. */
export const transposed = ({ columns, rows }: TableCells): TableCells => ({
    columns: ['', ...rows.map((row) => row[0] ?? '—')],
    rows: columns.slice(1).map((name, at) => [name, ...rows.map((row) => row[at + 1] ?? '—')]),
    namesColumn: 0,
});

/** The card's natural width in whole cells: the table, the card's padding
 *  and border, and slack, rounded up. The layout clamps it to the card's
 *  span. An empty table is the padding alone. */
export const tableWidthCells = ({ view }: TableDisplay): number =>
    Math.ceil((tableWidthPx(view) + CARD_INSET + WIDTH_SLACK) / CELL_PX);

/** Whether a table shows transposed: its display table has more columns than
 *  rows, it does not fit TABLE_WIDTH_DEFAULT, and turned on its side it does.
 *  `view` is `cells`' display table and `unit` the unit it was built with.
 *  `tableDisplay` asks only of a series table, whose columns after the first
 *  hold values. */
export const shouldTranspose = (
    cells: TableCells,
    view: TableView,
    unit?: TableUnit | null,
): boolean => {
    if (view.columns.length <= view.rows.length) {
        return false;
    }

    if (tableWidthCells({ view, transposed: false }) <= TABLE_WIDTH_DEFAULT) {
        return false;
    }

    const turned = transposed(cells);
    const turnedView = tableView(turned.columns, turned.rows, turned.namesColumn, { unit });

    return tableWidthCells({ view: turnedView, transposed: true }) <= TABLE_WIDTH_DEFAULT;
};

const cellText = (cell: CardData['rows'][number][number]): string =>
    cell == null ? '' : String(cell);

/** The one unit every row of the widget is in, or null. `info.unit` names
 *  it, unless the data's unit column holds more than one value, when the
 *  table shows a Unit column instead. */
export const tableUnit = ({ info, data }: Pick<TableWidget, 'info' | 'data'>): string | null => {
    const unit = info?.unit?.trim();

    if (!unit) {
        return null;
    }

    const at = data ? data.columns.findIndex(({ key }) => key === 'unit') : -1;
    const varies = at >= 0 && new Set(data?.rows.map((row) => cellText(row[at]))).size > 1;

    return varies ? null : unit;
};

// Whether the table's last column is its data's value column, the one
// column a unit can head. A payload table copies its labels from its data.
// A series table names series in its headers, and so does one saved before
// `series` was set, so the label test holds for it as well.
const valueColumnLast = ({
    columns,
    series,
    data,
}: Pick<TableWidget, 'columns' | 'series' | 'data'>): boolean => {
    const label = data?.columns.find(({ key }) => key === 'value')?.label;

    return !series && label !== undefined && label === columns.at(-1);
};

type DisplayWidget = Pick<
    TableWidget,
    'columns' | 'rows' | 'namesColumn' | 'series' | 'info' | 'data'
>;

/**
 * What a table card shows, built the same way for the card and for the span
 * a fresh card spawns at.
 *
 * - The unit (`tableUnit`) heads the value column when the last column is
 *   the data's value column (`valueColumnLast`) and the unit fits two lines
 *   of the header (`unitFitsHeader`). Otherwise it leads the caption, as it
 *   does on a series table, whose headers name series.
 * - A series table is transposed when `shouldTranspose` says so: the raw
 *   cells are turned before `tableView`, so the names are shortened and the
 *   decimals aligned along the axis shown.
 */
export const tableDisplay = (widget: DisplayWidget): TableDisplay => {
    const text = tableUnit(widget);
    const unit: TableUnit | null = text
        ? { text, place: valueColumnLast(widget) && unitFitsHeader(text) ? 'header' : 'caption' }
        : null;
    const view = tableView(widget.columns, widget.rows, widget.namesColumn, { unit });

    if (widget.series && shouldTranspose(widget, view, unit)) {
        const turned = transposed(widget);

        return {
            view: tableView(turned.columns, turned.rows, turned.namesColumn, { unit }),
            transposed: true,
        };
    }

    return { view, transposed: false };
};

// The foot's height: the left-out line over a one-line source line, or the
// source line alone, which wraps under its lead to a second line when the
// line does not fit beside "Built with".
const footPx = (widget: Pick<TableWidget, 'info' | 'source'>, inner: number): number => {
    const { info } = widget;

    if (leftOutOf(info).length > 0) {
        return FOOT_LINE + LEFT_OUT_GAP + FOOT_LINE;
    }

    const credit = info ? sourceLine(info) : null;
    const text = credit
        ? `${credit.lead} ${credit.first ?? ''} ${credit.more ? `+${credit.more} more` : ''}`
        : 'Source Name';
    const fits =
        textWidth(text, 300, FOOT_TYPE) + SOURCE_ICON <= inner - BUILT_WITH_WIDTH - BUILT_WITH_GAP;

    return fits ? FOOT_LINE : 2 * FOOT_LINE;
};

/**
 * The card's height in whole cells at `widthCells` wide, before anything is
 * measured: the head with its wrapped title, the caption, the header (its
 * tallest wrapped label), the body rows shown (TABLE_ROWS_COLLAPSED at most
 * unless `expanded`), the "Show all" control, a sideways scrollbar when the
 * table is wider than the card, the foot, and the card's gaps, padding and
 * border, rounded up. The layout clamps it. `display` defaults
 * to `tableDisplay(widget)`; pass it when the caller has built it.
 */
export const tableRows = ({
    widget,
    widthCells,
    expanded = false,
    display = tableDisplay(widget),
}: {
    widget: DisplayWidget & Pick<TableWidget, 'title' | 'source'>;
    widthCells: number;
    expanded?: boolean;
    display?: TableDisplay;
}): number => {
    const { view } = display;
    const inner = widthCells * CELL_PX - CARD_INSET;
    const titleLines = wrappedLines(
        widget.title,
        inner - ACTIONS_WIDTH - TITLE_GAP,
        300,
        TITLE_TYPE,
    );
    const head = Math.max(HEAD_MIN, titleLines * TITLE_LINE);

    const captionLines = view.caption
        ? (view.caption.lead ? wrappedLines(view.caption.lead, inner, 700, TABLE_TYPE) : 0) +
          wrappedLines(view.caption.details.join(' · '), inner, 400, TABLE_TYPE)
        : 0;
    const caption = captionLines ? captionLines * CAPTION_LINE + CARD_GAP - CAPTION_PULL : 0;

    const headerLines = Math.max(1, ...view.columns.map((label) => headerBox(label).lines));
    const shown = expanded ? view.rows.length : Math.min(view.rows.length, TABLE_ROWS_COLLAPSED);
    const body = shown
        ? shown * (2 * ROW_PAD_Y + TABLE_LINE + ROW_RULE) + FIRST_ROW_EXTRA - ROW_RULE
        : 0;
    const table =
        2 * HEADER_PAD_Y +
        headerLines * TABLE_LINE +
        body +
        (tableWidthPx(view) > inner ? SCROLLBAR : 0);
    const showAll = view.rows.length > TABLE_ROWS_COLLAPSED ? SHOW_ALL : 0;

    const px =
        CARD_INSET + head + CARD_GAP + caption + table + showAll + CARD_GAP + footPx(widget, inner);

    return Math.ceil(px / CELL_PX);
};
