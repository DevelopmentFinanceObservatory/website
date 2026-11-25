// No db or server-only imports, so src/lib/test/events-bounded-lookup.test.ts
// can run it under plain node.

/** How long an event waits on one session or share-owner read before it is
 *  recorded without that read's answer. The database pool holds 5
 *  connections, so a stalled pool would otherwise hold the event forever. */
export const LOOKUP_TIMEOUT_MS = 500;

/**
 * What `lookup` answers, or `fallback` when it throws, rejects or has not
 * settled within `timeoutMs`. A failure or a timeout is logged under
 * `label`. It never rejects, so the event that waits on it is recorded.
 */
export const boundedLookup = async <T>(
    lookup: () => Promise<T>,
    fallback: T,
    label: string,
    timeoutMs: number = LOOKUP_TIMEOUT_MS,
): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timedOut = new Promise<T>((resolve) => {
        timer = setTimeout(() => {
            console.warn(`${label}: no answer within ${timeoutMs} ms`);
            resolve(fallback);
        }, timeoutMs);
    });

    const answered = Promise.resolve()
        .then(lookup)
        .catch((error: unknown) => {
            console.warn(`${label} failed`, error);
            return fallback;
        });

    try {
        return await Promise.race([answered, timedOut]);
    } finally {
        clearTimeout(timer);
    }
};
