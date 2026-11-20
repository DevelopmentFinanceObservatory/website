/**
 * `value` as the literal text of a LIKE or ILIKE pattern: `%`, `_` and the
 * escape character `\` stand for themselves. Postgres's default escape is
 * `\`, so no ESCAPE clause is needed.
 */
export const likeLiteral = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A pattern matching any text that contains `value`. */
export const likeContaining = (value: string): string => `%${likeLiteral(value)}%`;
