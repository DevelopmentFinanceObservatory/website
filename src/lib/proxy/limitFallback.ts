/**
 * An in-memory fixed-window count per caller key, for one server instance.
 * The proxy falls back to it when the shared count in Postgres
 * (./limitCounter) fails or is slow, so a burst sent while the database is
 * struggling is still held to its limit on each instance, instead of passing
 * uncounted. A caller served by several instances can reach the limit times
 * the instance count at worst, which is far under no limit.
 *
 * Each shared count that succeeds is recorded here too, so a fallback goes on
 * from the caller's shared count in the current window rather than from zero:
 * a caller already refused in the window stays refused when the database
 * then fails. The shared count sent last is the one kept, a lower one
 * included, so a counter an operator deletes (an account's daily usage
 * reset) is followed here on the caller's next shared count.
 *
 * Windows are aligned to the Unix epoch, as the shared counters' are. The
 * memory is bounded: a full map first drops the windows that have ended and
 * then its oldest keys. An evicted key starts over, which is the same
 * leniency as a fresh instance.
 */
import {
    countVerdict,
    GATE_STAGES,
    isDailyStage,
    readVerdict,
    TIER_STAGES,
    type Admission,
    type AdmissionPlan,
    type AdmissionStage,
    type Verdict,
} from './limitCounter.ts';

export const FALLBACK_MAX_KEYS = 10_000;

export type FallbackCounter = {
    hit(key: string, limit: number): Verdict;
    /**
     * Whether one more hit on `key` fits within `limit` in the current
     * window, counting nothing.
     */
    peek(key: string, limit: number): Verdict;
    /**
     * Takes the shared count's verdict for `key` as its count so far in the
     * window in effect at `sentAt`, when the count was sent. A count that
     * crosses a window boundary on its way back is filed under the window it
     * was sent in: a count the database made in the later window then lapses
     * early, which errs lenient, and never carries a spent allowance into a
     * fresh window. A count sent after the one held replaces it, so a
     * shared counter that went down (an operator's reset) is followed; one
     * sent earlier only raises it.
     */
    record(key: string, verdict: Verdict, sentAt: number): void;
    /**
     * Gives back one hit on `key` in the current window, whether it was
     * counted here or recorded from the shared count. A key from an earlier
     * window, or at 0, is left alone.
     */
    refund(key: string): void;
    size(): number;
};

export const createFallbackCounter = (
    windowS: number,
    { now = Date.now, maxKeys = FALLBACK_MAX_KEYS }: { now?: () => number; maxKeys?: number } = {},
): FallbackCounter => {
    const windowMs = windowS * 1000;
    // The window a key was last counted in, how many calls it held, and when
    // the count it holds was taken: the send time of the shared count
    // recorded, or the time of a hit counted here.
    const counts = new Map<string, { window: number; count: number; at: number }>();

    // Re-inserted, so insertion order stays the order of last use.
    const store = (key: string, window: number, count: number, at: number): void => {
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

        counts.set(key, { window, count, at });
    };

    const reset = (at: number, window: number): number =>
        Math.max(1, Math.ceil(((window + 1) * windowMs - at) / 1000));

    return {
        hit(key, limit) {
            const at = now();
            const window = Math.floor(at / windowMs);
            const known = counts.get(key);
            const count = known && known.window === window ? known.count + 1 : 1;

            store(key, window, count, at);

            return countVerdict(count, limit, reset(at, window));
        },
        peek(key, limit) {
            const at = now();
            const window = Math.floor(at / windowMs);
            const known = counts.get(key);

            return readVerdict(
                known?.window === window ? known.count : 0,
                limit,
                reset(at, window),
            );
        },
        record(key, { allowed, limit, remaining }, sentAt) {
            const window = Math.floor(sentAt / windowMs);
            const known = counts.get(key);

            // A count from a window already over says nothing about this one,
            // and leaves any newer count alone.
            if (window < Math.floor(now() / windowMs) || (known && known.window > window)) {
                return;
            }

            // A refusal carries no count past the limit, and one past it is
            // enough to keep refusing. A count sent after the one held, and
            // after any hit counted here, replaces it, a lower one included.
            // Replies can arrive out of order, so one sent no later than the
            // count held only raises it.
            const count = allowed ? limit - remaining : limit + 1;

            if (known?.window === window && known.at >= sentAt) {
                store(key, window, Math.max(known.count, count), known.at);
            } else {
                store(key, window, count, sentAt);
            }
        },
        refund(key) {
            const known = counts.get(key);

            if (known && known.window === Math.floor(now() / windowMs) && known.count > 0) {
                known.count -= 1;
            }
        },
        size: () => counts.size,
    };
};

/**
 * Count one anonymous call on `plan` in memory, in admitHit's order
 * (./limitCounter): read the gates, count the call's own per-minute and
 * daily counts, then debit the gates, each step only once the one before
 * admits the call. `minute` and `day` are the counters of the per-minute
 * and daily stages.
 */
export const admitInMemory = (
    plan: AdmissionPlan,
    { minute, day }: { minute: FallbackCounter; day: FallbackCounter },
): Admission => {
    const counterOf = (stage: AdmissionStage): FallbackCounter =>
        isDailyStage(stage) ? day : minute;
    const verdicts: Admission['verdicts'] = {};
    const settle = (stage: AdmissionStage, verdict: Verdict): boolean => {
        verdicts[stage] = verdict;

        return verdict.allowed;
    };

    for (const stage of GATE_STAGES) {
        const counter = plan[stage];

        if (counter && !settle(stage, counterOf(stage).peek(counter.key, counter.limit))) {
            return { refusedBy: stage, verdicts };
        }
    }

    for (const stage of [...TIER_STAGES, ...GATE_STAGES]) {
        const counter = plan[stage];

        if (counter && !settle(stage, counterOf(stage).hit(counter.key, counter.limit))) {
            return { refusedBy: stage, verdicts };
        }
    }

    return { refusedBy: null, verdicts };
};
