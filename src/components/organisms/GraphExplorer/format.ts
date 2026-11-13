/** A whole number with thousands separators. */
export const count = (n: number): string => n.toLocaleString('en-GB');

/** "1 StatVar", "22,068 StatVars". */
export const plural = (n: number, one: string, many = `${one}s`): string =>
    `${count(n)} ${n === 1 ? one : many}`;
