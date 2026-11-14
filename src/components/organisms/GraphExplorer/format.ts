import type { ValuesUsed } from '@/lib/graphExplorer/model';

/** A whole number with thousands separators. */
export const count = (n: number): string => n.toLocaleString('en-GB');

/** "1 StatVar", "22,068 StatVars". */
export const plural = (n: number, one: string, many = `${one}s`): string =>
    `${count(n)} ${n === 1 ? one : many}`;

/** Follows the count of a value list the graph holds more members of than it lists. */
const PARTIAL = 'listed (partial list)';

/** A value list's size: "14", or "17 listed (partial list)". */
export const memberTotal = (n: number, complete: boolean): string =>
    complete ? count(n) : `${count(n)} ${PARTIAL}`;

/** A value list's size in words: "14 values", or "17 values listed (partial list)". */
export const valueCount = (n: number, complete: boolean): string =>
    complete ? plural(n, 'value') : `${plural(n, 'value')} ${PARTIAL}`;

/** "12 of 14", or "12 of the 17 listed (partial list)". */
export const ofMembers = ({ used, of, complete }: ValuesUsed): string =>
    complete ? `${count(used)} of ${count(of)}` : `${count(used)} of the ${count(of)} ${PARTIAL}`;
