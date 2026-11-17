import 'server-only';

import { counterDb } from '@/lib/db';

import { limiterBucket } from './caller';
import { countHit, pruneCounters, type CounterDb } from './limitCounter';
import { createFallbackCounter, type FallbackCounter } from './limitFallback';
import type { RateVerdict } from './rateHeaders';

/**
 * Rate limit for the platform proxy's /api/*, /openapi.json, /codes and /mcp
 * calls (src/lib/proxy/forward): a fixed window counted in Postgres
 * (./limitCounter), shared by every instance. A caller is an address or an
 * account (a key's owner). An IPv6 address is counted by its /64 (see
 * limiterBucket). A count runs on its own small pool (src/lib/db's
 * counterDb), which gives up after 400 ms in Postgres, 500 ms in the client,
 * or 2 s waiting for a connection. A database error or a timed-out count does
 * not let the call through uncounted: this instance counts it in memory
 * instead (./limitFallback), so a burst is held near its limit on each
 * instance while the database is slow, and the proxy stays available.
 *
 * The window and the allowance per surface are env-tunable:
 *   RATE_LIMIT_WINDOW_S   (default 60)
 *   RATE_LIMIT_API        calls per window per IP on /api/*, /openapi.json
 *                         and /codes (default 120)
 *   RATE_LIMIT_PIN        calls per window per IP on /api/download-pin
 *                         (default 10)
 *   RATE_LIMIT_MCP        requests per window per IP on /mcp (default 300)
 *   RATE_LIMIT_KEYED      calls per window per account on each of the API
 *                         and MCP surfaces, for an account with no limit of
 *                         its own (default 600)
 */
const WINDOW_S = Number(process.env.RATE_LIMIT_WINDOW_S) || 60;

// How often each instance deletes dead counters.
const PRUNE_EVERY_MS = 60 * 60 * 1000;

export const LIMITS = {
    api: Number(process.env.RATE_LIMIT_API) || 120,
    pin: Number(process.env.RATE_LIMIT_PIN) || 10,
    // Above the /api default on purpose. Claude, ChatGPT and Gemini call from
    // the vendor's own addresses, so one address can carry many users, and a
    // 429 reaches such a user as a failed connection. 300 a minute is the
    // refill of one harness instance's tool-call bucket (5 a second), which
    // stays the ceiling on total spend.
    mcp: Number(process.env.RATE_LIMIT_MCP) || 300,
} as const;

/**
 * An account's calls per window on each surface when it sets none of its own
 * (`user.api_rate_limit`). One number for every surface, since an account is
 * one caller, not a vendor's address with many users behind it.
 */
export const KEYED_LIMIT = Number(process.env.RATE_LIMIT_KEYED) || 600;

export type Surface = keyof typeof LIMITS;

export type Limiter = {
    /**
     * Count one call by `callerKey` on `surface` against `limit` and say
     * whether it is within it. `callerKey` is the limiter bucket of an
     * address (limiterBucket) or `acct:<account id>`.
     */
    hitKey(surface: Surface, callerKey: string, limit: number): Promise<RateVerdict>;
};

export const createLimiter = (
    db: CounterDb,
    {
        windowS = WINDOW_S,
        fallback = createFallbackCounter(windowS),
        warn = console.warn,
        prune = true,
    }: {
        windowS?: number;
        fallback?: FallbackCounter;
        warn?: (message: string, error: unknown) => void;
        prune?: boolean;
    } = {},
): Limiter => {
    let lastPrune = 0;

    return {
        async hitKey(surface, callerKey, limit) {
            // Each instance deletes dead counters, at most once an hour, the
            // Studio's included (every Studio call passes here too). The
            // delete uses the same bounded counter pool as the counts.
            if (prune && Date.now() - lastPrune > PRUNE_EVERY_MS) {
                lastPrune = Date.now();
                pruneCounters(db).catch((error) => warn('limit counters not pruned', error));
            }

            const key = `${surface}:${callerKey}`;

            try {
                return await countHit(db, key, limit, windowS);
            } catch (error) {
                warn('rate limit unavailable, counting in memory', error);

                return fallback.hit(key, limit);
            }
        },
    };
};

const limiter = createLimiter(counterDb);

/** Count one call by `callerKey` on `surface` against `limit` (see Limiter). */
export const hitKey = (surface: Surface, callerKey: string, limit: number): Promise<RateVerdict> =>
    limiter.hitKey(surface, callerKey, limit);

/** Count one call from the address `ip` against `surface`'s anonymous allowance. */
export const hit = (surface: Surface, ip: string): Promise<RateVerdict> =>
    hitKey(surface, limiterBucket(ip), LIMITS[surface]);
