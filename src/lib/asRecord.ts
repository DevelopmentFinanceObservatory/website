/** A value as a plain object, or undefined when it is anything else (an
 *  array, null or a primitive). Reads an untyped body at the point it enters. */
export const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
