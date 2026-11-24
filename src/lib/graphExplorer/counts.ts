/**
 * Counts as the screens show them, and the size of a value list, which says
 * "listed (partial list)" when the graph holds more members than it lists.
 */
import type { ValuesUsed } from './model.ts';

/** A whole number with thousands separators. */
export const count = (n: number): string => n.toLocaleString('en-GB');

/** "1 StatVar", "22,068 StatVars". */
export const plural = (n: number, one: string, many = `${one}s`): string =>
    `${count(n)} ${n === 1 ? one : many}`;

/** The line an export of a partial value list carries under the list's name. */
export const PARTIAL_LIST_LINE = 'Partial list: the graph holds more values.';

/** Follows the count of a value list the graph holds more members of than it lists. */
const PARTIAL = '(partial list)';

/** A value list's size: "14", or "17 listed (partial list)". */
export const memberTotal = (n: number, complete: boolean): string =>
    complete ? count(n) : `${count(n)} listed ${PARTIAL}`;

/** A value list's size in words: "14 values", or "17 values listed (partial list)". */
export const valueCount = (n: number, complete: boolean): string =>
    complete ? plural(n, 'value') : `${plural(n, 'value')} listed ${PARTIAL}`;

/** "12 of 14", or "12 of the 17 listed", followed by the partial mark when `marked`. */
const ofCount = ({ used, of, complete }: ValuesUsed, marked: boolean): string =>
    complete
        ? `${count(used)} of ${count(of)}`
        : `${count(used)} of the ${count(of)} listed${marked ? ` ${PARTIAL}` : ''}`;

/** "12 of 14", or "12 of the 17 listed (partial list)". */
export const ofMembers = (values: ValuesUsed): string => ofCount(values, true);

/**
 * A value list's panel label: its size, then how many of its members the
 * dataset `user` uses. A partial list is marked once.
 */
export const valueListLabel = (
    n: number,
    complete: boolean,
    use: { readonly user: string; readonly values: ValuesUsed } | null,
): string => {
    const size = valueCount(n, complete);
    return use === null ? size : `${size}, ${use.user} uses ${ofCount(use.values, complete)}`;
};
