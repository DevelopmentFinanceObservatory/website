// No db or server-only imports, so src/lib/test/events-ttl-memo.test.ts can
// run it under plain node.

/**
 * A process-local memo of `load(key)` that keeps each answer for `ttlMs` and
 * at most `max` keys, dropping the oldest past that. Calls for one key while
 * its load is in flight share it. A load that rejects is forgotten, so the
 * next call loads again.
 */
export const ttlMemo = <T>({
    ttlMs,
    max,
    now = Date.now,
}: {
    ttlMs: number;
    max: number;
    now?: () => number;
}): ((key: string, load: () => Promise<T>) => Promise<T>) => {
    const entries = new Map<string, { at: number; value: Promise<T> }>();

    return (key, load) => {
        const held = entries.get(key);

        if (held && now() - held.at < ttlMs) {
            return held.value;
        }

        entries.delete(key);

        if (entries.size >= max) {
            const oldest = entries.keys().next();

            if (!oldest.done) {
                entries.delete(oldest.value);
            }
        }

        const value = load();
        const entry = { at: now(), value };

        entries.set(key, entry);
        value.catch(() => {
            if (entries.get(key) === entry) {
                entries.delete(key);
            }
        });

        return value;
    };
};
