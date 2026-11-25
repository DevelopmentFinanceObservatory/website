import 'server-only';

import { counterDb } from '@/lib/db';

import { limiterBucket } from './caller';
import { countHit, DAY_S, pruneCounters, type CounterDb } from './limitCounter';
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
 * instead (./limitFallback), going on from the last shared count it saw for
 * that caller, so a burst is held near its limit on each instance while the
 * database is slow, and the proxy stays available.
 *
 * The window and the allowance per surface are env-tunable:
 *   RATE_LIMIT_WINDOW_S   (default 60)
 *   RATE_LIMIT_API        calls per window per IP on /api/*, /openapi.json
 *                         and /codes (default 120)
 *   RATE_LIMIT_DATASETS   calls per window per IP on the Datasets API's
 *                         routes below /api/v1/datasets/ (default 300)
 *   RATE_LIMIT_PIN        calls per window per IP on /api/download-pin
 *                         (default 10)
 *   RATE_LIMIT_MCP        requests per window per IP on /mcp (default 300)
 *   RATE_LIMIT_KEYED      calls per window per account on each of the 'api'
 *                         and 'datasets' surfaces, for an account with no
 *                         limit of its own (default 600)
 *   API_KEY_DAILY_LIMIT   API calls per UTC day per account, every key's
 *                         calls together, for an account with no quota of
 *                         its own (`user.api_daily_limit`; default 75000).
 *                         Counted apart from the window above, in a one-day
 *                         window (hitDaily). A key may also carry a lower
 *                         cap of its own (`apikey.daily_limit`).
 *
 * The daily quota is the account's, so deleting a key and making another
 * does not start the count again.
 */
/** The rate-limit window in seconds, which the key pages show too. */
export const WINDOW_S = Number(process.env.RATE_LIMIT_WINDOW_S) || 60;

// How often each instance deletes dead counters.
const PRUNE_EVERY_MS = 60 * 60 * 1000;

export const LIMITS = {
    api: Number(process.env.RATE_LIMIT_API) || 120,
    // The Datasets API's reads and analyses, counted apart from the rest of
    // /api. A prototype page reads in one load up to 34 of them, a stored
    // recipe being two, and readers behind one office or campus address share
    // the count. 300 a minute is about eight such loads per address, with
    // nothing assumed of the edge cache. Cloudflare's per-address block on
    // the data API sits above this one, so a single reader meets this 429
    // first. dfo-apis bounds the analyses it runs at once and answers 503
    // past that (src/datasets_api/doors/analysis.py in dfo-apis). The mint
    // door, /api/v1/datasets itself, stays on `api`.
    datasets: Number(process.env.RATE_LIMIT_DATASETS) || 300,
    pin: Number(process.env.RATE_LIMIT_PIN) || 10,
    // Above the /api default on purpose. Claude, ChatGPT and Gemini call from
    // the vendor's own addresses, so one address can carry many users, and a
    // 429 reaches such a user as a failed connection. 300 a minute is the
    // refill of one harness instance's tool-call bucket (5 a second), which
    // stays the ceiling on total spend.
    mcp: Number(process.env.RATE_LIMIT_MCP) || 300,
} as const;

/**
 * An account's calls per window when it sets none of its own
 * (`user.api_rate_limit`). An account is one caller, not a vendor's address
 * with many users behind it.
 */
export const KEYED_LIMIT = Number(process.env.RATE_LIMIT_KEYED) || 600;

/** An account's API calls per UTC day when it sets none of its own (`user.api_daily_limit`). */
export const ACCOUNT_DAILY_LIMIT = Number(process.env.API_KEY_DAILY_LIMIT) || 75_000;

export type Surface = keyof typeof LIMITS;

export type Limiter = {
    /**
     * Count one call by `callerKey` on `surface` against `limit` and say
     * whether it is within it. `callerKey` is the limiter bucket of an
     * address (limiterBucket) or `acct:<account id>`.
     */
    hitKey(surface: Surface, callerKey: string, limit: number): Promise<RateVerdict>;
    /**
     * Count one API call on the daily counter `counterKey`
     * (accountDailyCounterKey or keyDailyCounterKey) against `limit` calls in
     * the current UTC day.
     */
    hitDaily(counterKey: string, limit: number): Promise<RateVerdict>;
};

export const createLimiter = (
    db: CounterDb,
    {
        windowS = WINDOW_S,
        fallback = createFallbackCounter(windowS),
        dailyFallback = createFallbackCounter(DAY_S),
        warn = console.warn,
        prune = true,
    }: {
        windowS?: number;
        fallback?: FallbackCounter;
        dailyFallback?: FallbackCounter;
        warn?: (message: string, error: unknown) => void;
        prune?: boolean;
    } = {},
): Limiter => {
    let lastPrune = 0;

    // Each instance deletes dead counters, at most once an hour, the
    // Studio's included (every Studio call passes here too). The delete uses
    // the same bounded counter pool as the counts.
    const pruneOften = (): void => {
        if (prune && Date.now() - lastPrune > PRUNE_EVERY_MS) {
            lastPrune = Date.now();
            pruneCounters(db).catch((error) => warn('limit counters not pruned', error));
        }
    };

    const count = async (
        counter: FallbackCounter,
        key: string,
        limit: number,
        window: number,
    ): Promise<RateVerdict> => {
        pruneOften();

        try {
            const sentAt = Date.now();
            const verdict = await countHit(db, key, limit, window);

            counter.record(key, verdict, sentAt);

            return verdict;
        } catch (error) {
            warn('rate limit unavailable, counting in memory', error);

            return counter.hit(key, limit);
        }
    };

    return {
        hitKey: (surface, callerKey, limit) =>
            count(fallback, `${surface}:${callerKey}`, limit, windowS),
        hitDaily: (counterKey, limit) => count(dailyFallback, counterKey, limit, DAY_S),
    };
};

const limiter = createLimiter(counterDb);

/** Count one call by `callerKey` on `surface` against `limit` (see Limiter). */
export const hitKey = (surface: Surface, callerKey: string, limit: number): Promise<RateVerdict> =>
    limiter.hitKey(surface, callerKey, limit);

/** Count one call from the address `ip` against `surface`'s anonymous allowance. */
export const hit = (surface: Surface, ip: string): Promise<RateVerdict> =>
    hitKey(surface, limiterBucket(ip), LIMITS[surface]);

/** Count one API call on a daily counter (see Limiter). */
export const hitDaily = (counterKey: string, limit: number): Promise<RateVerdict> =>
    limiter.hitDaily(counterKey, limit);
