/** A record of `keys`, each mapped to `valueOf(key)`. The one cast is the record's type, which
 *  `Object.fromEntries` widens to string keys. Every key of `keys` is present. */
export const recordOf = <K extends string, V>(
    keys: readonly K[],
    valueOf: (key: K, index: number) => V,
): Record<K, V> =>
    Object.fromEntries(keys.map((key, index) => [key, valueOf(key, index)])) as Record<K, V>;
