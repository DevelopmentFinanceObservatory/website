/**
 * An in-memory fixed-window count per caller key, for one server instance.
 * The proxy falls back to it when the shared count in Postgres
 * (./limitCounter) fails or is slow, so a burst sent while the database is
 * struggling is still held to its limit on each instance, instead of passing
 * uncounted. A caller served by several instances can reach the limit times
 * the instance count at worst, which is far under no limit.
 *
 * Windows are aligned to the Unix epoch, as the shared counters' are. The
 * memory is bounded: a full map first drops the windows that have ended and
 * then its oldest keys. An evicted key starts over, which is the same
 * leniency as a fresh instance.
 */
import type { Verdict } from './limitCounter.ts';

export const FALLBACK_MAX_KEYS = 10_000;

export type FallbackCounter = {
    hit(key: string, limit: number): Verdict;
    size(): number;
};

export const createFallbackCounter = (
    windowS: number,
    { now = Date.now, maxKeys = FALLBACK_MAX_KEYS }: { now?: () => number; maxKeys?: number } = {},
): FallbackCounter => {
    const windowMs = windowS * 1000;
    // The window a key was last counted in, and how many calls it held.
    const counts = new Map<string, { window: number; count: number }>();

    return {
        hit(key, limit) {
            const at = now();
            const window = Math.floor(at / windowMs);
            const known = counts.get(key);
            const count = known && known.window === window ? known.count + 1 : 1;

            // Re-inserted, so insertion order stays the order of last use.
            counts.delete(key);

            if (counts.size >= maxKeys) {
                for (const [other, entry] of counts) {
                    if (entry.window < window) {
                        counts.delete(other);
                    }
                }
            }

            while (counts.size >= maxKeys) {
                counts.delete(counts.keys().next().value!);
            }

            counts.set(key, { window, count });

            return {
                allowed: count <= limit,
                limit,
                remaining: Math.max(0, limit - count),
                reset: Math.max(1, Math.ceil(((window + 1) * windowMs - at) / 1000)),
            };
        },
        size: () => counts.size,
    };
};
