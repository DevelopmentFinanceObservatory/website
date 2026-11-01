/**
 * What a table card shows of its widget's cells, and in what order.
 *
 * A column holding one value in every row says that value once, in a
 * caption above the table ("Recipient: Zimbabwe"), unless every column but
 * the value holds one value, when they all stay. The column of variable
 * names, which the widget marks, drops the text its names share to the
 * caption too, keeping what tells the rows apart, as the chart legend does.
 * Other columns hold names of places, donors and periods, whose shared
 * words are part of the name ("South Sudan", "South Africa"), so they stay
 * whole. Display only: the download and the widget keep the cells as they
 * came.
 */
import { splitLabels } from './seriesLabels.ts';

/** A cell's display text, and its full text when the table shortened it. */
export type TableCell = { text: string; full?: string };

export type TableCaption = {
    /** The text every name shares, with an ellipsis where the names differ. */
    lead?: string;
    /** The shared tail when the lead holds the head, then one
     *  "Column: value" per column dropped for holding one value. */
    details: string[];
};

export type TableView = {
    caption: TableCaption | null;
    columns: string[];
    rows: TableCell[][];
    /** Whether a column sorts by number: the value column (the last), and
     *  any other whose cells are all numbers or blank. */
    numeric: boolean[];
    /** Where the names column sits among `columns`, when it stays. */
    namesColumn?: number;
};

export type TableSort = { column: number; direction: 'ascending' | 'descending' };

const BLANK = '—';

const isBlank = (text: string): boolean => text === '' || text === BLANK;

const LETTER_SIZES: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

// The shape `cellNumber` writes: "441.9", "-0.25", "37.0 K", "23.4 M".
const CELL_NUMBER = /^(-?\d+(?:\.\d+)?)(?: ([KMBT]))?$/;

/** The number a `cellNumber` cell reads as, or null for any other text. */
export const cellValue = (text: string): number | null => {
    const match = CELL_NUMBER.exec(text);

    if (!match) {
        return null;
    }

    return Number(match[1]) * (match[2] ? LETTER_SIZES[match[2]]! : 1);
};

type SplitNames = { names: Map<string, string>; prefix: string; suffix: string };

// Each distinct name's short form, and the head and tail they share, or null
// when they share neither.
const splitNames = (cells: string[]): SplitNames | null => {
    const distinct = [...new Set(cells)];
    const { names, prefix, suffix } = splitLabels(distinct);

    return prefix || suffix
        ? { names: new Map(distinct.map((name, at) => [name, names[at]!])), prefix, suffix }
        : null;
};

/** `columns` and `rows` with shared text moved to a caption. `namesColumn`
 *  is the column of variable names, the one whose shared text may go. */
export const tableView = (columns: string[], rows: string[][], namesColumn?: number): TableView => {
    const last = columns.length - 1;
    const column = (index: number) => rows.map((row) => row[index] ?? BLANK);

    // One value in every row, and more than one row to say it in. The value
    // column always stays.
    const single = columns.map(
        (_, index) =>
            index !== last &&
            rows.length > 1 &&
            !isBlank(rows[0]?.[index] ?? BLANK) &&
            column(index).every((cell) => cell === rows[0]?.[index]),
    );
    // A table whose rows differ only in value keeps every column.
    const constant = single.every((one, index) => one || index === last)
        ? single.map(() => false)
        : single;
    const numeric = columns.map(
        (_, index) =>
            index === last ||
            column(index).every((cell) => isBlank(cell) || cellValue(cell) !== null),
    );
    const kept = columns.flatMap((_, index) => (constant[index] ? [] : [index]));

    // The names column, when it stays and its names share a head or a tail.
    const shortened =
        namesColumn !== undefined && kept.includes(namesColumn) && !numeric[namesColumn]
            ? splitNames(column(namesColumn))
            : null;
    const lead = shortened?.prefix
        ? `${shortened.prefix} …`
        : shortened?.suffix
          ? `… ${shortened.suffix}`
          : undefined;
    const details = [
        ...(shortened?.prefix && shortened.suffix ? [shortened.suffix] : []),
        ...columns.flatMap((name, index) =>
            constant[index] ? [`${name}: ${rows[0]?.[index] ?? ''}`] : [],
        ),
    ];

    return {
        caption: lead || details.length ? { ...(lead ? { lead } : {}), details } : null,
        columns: kept.map((index) => columns[index]!),
        rows: rows.map((row) =>
            kept.map((index) => {
                const text = row[index] ?? BLANK;
                const short = index === namesColumn ? shortened?.names.get(text) : undefined;

                return short !== undefined && short !== text
                    ? { text: short, full: text }
                    : { text };
            }),
        ),
        numeric: kept.map((index) => numeric[index]!),
        ...(namesColumn !== undefined && kept.includes(namesColumn)
            ? { namesColumn: kept.indexOf(namesColumn) }
            : {}),
    };
};

// A cell's sort key: its number in a numeric column, its shown text in another,
// null when blank (blanks sort last whichever way the column runs).
const sortKey = ({ text }: TableCell, numeric: boolean): number | string | null => {
    if (numeric) {
        return cellValue(text);
    }

    return isBlank(text) ? null : text;
};

/** The row indexes of `rows` in `sort` order; rows that tie keep their order. */
export const sortOrder = (
    rows: TableCell[][],
    numeric: boolean[],
    sort: TableSort | null,
): number[] => {
    const order = rows.map((_, index) => index);

    if (!sort || sort.column >= numeric.length) {
        return order;
    }

    const { column, direction } = sort;
    const isNumeric = numeric[column]!;
    const sign = direction === 'ascending' ? 1 : -1;
    const keys = rows.map((row) => sortKey(row[column] ?? { text: BLANK }, isNumeric));

    return order.sort((a, b) => {
        const left = keys[a]!;
        const right = keys[b]!;

        if (left === null || right === null) {
            return left === right ? 0 : left === null ? 1 : -1;
        }

        return (
            sign *
            (typeof left === 'number' && typeof right === 'number'
                ? left - right
                : String(left).localeCompare(String(right), 'en', { numeric: true }))
        );
    });
};
