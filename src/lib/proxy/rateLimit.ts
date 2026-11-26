import 'server-only';

import { counterDb } from '@/lib/db';

import { limiterBucket } from './caller';
import {
    admitHit,
    countHit,
    DAY_S,
    isDailyStage,
    pruneCounters,
    refundHit,
    type Admission,
    type AdmissionPlan,
    type AdmissionStage,
    type CounterDb,
} from './limitCounter';
import { admitInMemory, createFallbackCounter, type FallbackCounter } from './limitFallback';
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
 * database is slow, and the proxy stays available. The warning it logs names
 * the error's code or class (errorCode), and never the query, whose
 * parameters carry visitor ids.
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
 *
 * While visitor limits are on (src/lib/proxy/visitor), an anonymous call on
 * the 'api' and 'datasets' surfaces is counted against the visitor at the
 * allowance above when it carries a valid visitor token, and otherwise
 * against its address at a cookieless allowance. Either way it is also
 * counted on its address's backstop (src/lib/proxy/access):
 *   RATE_LIMIT_API_ANON   calls per window per IP on 'api' with no valid
 *                         visitor token (default 20). 'datasets' stays at
 *                         RATE_LIMIT_DATASETS, since prototype pages and
 *                         embeds never carry the token.
 *   RATE_LIMIT_API_BACKSTOP, RATE_LIMIT_DATASETS_BACKSTOP
 *                         anonymous calls per window per IP, with a visitor
 *                         token or without, whichever visitors they name
 *                         (defaults 240, 500): the most an address gets
 *
 * Every anonymous call forward() counts on 'api' and 'datasets' is also
 * counted in a one-day window: against the visitor with a valid visitor
 * token, else against its address's cookieless count, and on its address's
 * daily ceiling either way (src/lib/proxy/access). With visitor limits off,
 * every call is counted as cookieless. One statement takes all of a call's
 * anonymous counts (admit), and an address over its backstop or ceiling
 * refuses the call before any count of its own is written. Studio calls and
 * stored-file downloads skip the daily counts (countAnonymous's `daily`
 * option). For each daily figure, 0 turns that count off:
 *   RATE_LIMIT_ANON_DAILY_API, RATE_LIMIT_ANON_DAILY_DATASETS
 *                         anonymous calls per UTC day per visitor, or per IP
 *                         with no valid visitor token (defaults 1000, 1000)
 *   RATE_LIMIT_ANON_DAILY_ADDRESS_API, RATE_LIMIT_ANON_DAILY_ADDRESS_DATASETS
 *                         anonymous calls per UTC day per IP, every visitor's
 *                         and the cookieless ones together (defaults 5000,
 *                         5000)
 *
 *   RATE_LIMIT_KEYED      calls per window per account on each of the 'api'
 *                         and 'datasets' surfaces, for an account with no
 *                         limit of its own (default 600)
 *   API_KEY_DAILY_LIMIT   API calls per UTC day per account, every key's
 *                         calls together, for an account with no quota of
 *                         its own (`user.api_daily_limit`; default 10000).
 *                         Counted apart from the window above, in a one-day
 *                         window (hitDaily). A key may also carry a lower
 *                         cap of its own (`apikey.daily_limit`).
 *
 * The daily quota is the account's, so deleting a key and making another
 * does not start the count again.
 */
/** The rate-limit window in seconds, which the key pages show too. */
export const WINDOW_S = Number(process.env.RATE_LIMIT_WINDOW_S) || 60;

// How often each instance deletes counters whose window has ended. A
// per-minute counter lives at most this long past its window.
const PRUNE_EVERY_MS = 5 * 60 * 1000;

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

/** An address's calls per window with no valid visitor token, while visitor limits are on. */
export const COOKIELESS_LIMITS = {
    api: Number(process.env.RATE_LIMIT_API_ANON) || 20,
    datasets: LIMITS.datasets,
} as const;

/**
 * An address's anonymous calls per window, every visitor's and the cookieless
 * ones together. The datasets figure sits below Cloudflare's 600-a-minute
 * per-address rule on the data API, so a reader meets this 429 first.
 */
export const BACKSTOP_LIMITS = {
    api: Number(process.env.RATE_LIMIT_API_BACKSTOP) || 240,
    datasets: Number(process.env.RATE_LIMIT_DATASETS_BACKSTOP) || 500,
} as const;

/**
 * A daily allowance read from the env value `raw`: a whole number of 0 or
 * more, where 0 turns the cap off, else `fallback` when unset or not such a
 * number.
 */
export const dailyAllowance = (raw: string | undefined, fallback: number): number => {
    const value = raw?.trim() ? Number(raw) : Number.NaN;

    return Number.isInteger(value) && value >= 0 ? value : fallback;
};

/**
 * A visitor's anonymous calls per UTC day on each surface, or an address's
 * with no valid visitor token; 0 is no cap.
 */
export const ANONYMOUS_DAILY_LIMITS = {
    api: dailyAllowance(process.env.RATE_LIMIT_ANON_DAILY_API, 1_000),
    datasets: dailyAllowance(process.env.RATE_LIMIT_ANON_DAILY_DATASETS, 1_000),
} as const;

/**
 * An address's anonymous calls per UTC day on each surface, every visitor's
 * and the cookieless ones together; 0 is no cap.
 */
export const ADDRESS_DAILY_LIMITS = {
    api: dailyAllowance(process.env.RATE_LIMIT_ANON_DAILY_ADDRESS_API, 5_000),
    datasets: dailyAllowance(process.env.RATE_LIMIT_ANON_DAILY_ADDRESS_DATASETS, 5_000),
} as const;

/**
 * An account's calls per window when it sets none of its own
 * (`user.api_rate_limit`). An account is one caller, not a vendor's address
 * with many users behind it.
 */
export const KEYED_LIMIT = Number(process.env.RATE_LIMIT_KEYED) || 600;

/** An account's API calls per UTC day when it sets none of its own (`user.api_daily_limit`). */
export const ACCOUNT_DAILY_LIMIT = Number(process.env.API_KEY_DAILY_LIMIT) || 10_000;

export type Surface = keyof typeof LIMITS;

export type Limiter = {
    /**
     * Count one call by `callerKey` on `surface` against `limit` and say
     * whether it is within it. `callerKey` is the limiter bucket of an
     * address (limiterBucket) or `acct:<account id>`.
     */
    hitKey(surface: Surface, callerKey: string, limit: number): Promise<RateVerdict>;
    /**
     * Count one anonymous call on the counters of `plan` (admitHit in
     * ./limitCounter), per-minute stages in this limiter's window.
     */
    admit(plan: AdmissionPlan): Promise<Admission>;
    /**
     * Count one API call on the daily counter `counterKey`
     * (accountDailyCounterKey, keyDailyCounterKey, or the anonymous ones in
     * ./limitCounter) against `limit` calls in the current UTC day.
     */
    hitDaily(counterKey: string, limit: number): Promise<RateVerdict>;
    /**
     * Give back one hit on the daily counter `counterKey` in the current UTC
     * day, for a call a later check refused. The in-memory count gives it back
     * too, so a fallback goes on from the refunded count.
     */
    refundDaily(counterKey: string): Promise<void>;
};

/**
 * What a failed count's warning says of `error`: the Postgres or Node error
 * code on it or on a cause (`57014`, `ECONNREFUSED`), else its class. The
 * message is left out, since a failed query's message carries its
 * parameters, the counter keys with their visitor ids.
 */
export const errorCode = (error: unknown): string => {
    for (let at: unknown = error; at instanceof Error; at = at.cause) {
        const { code } = at as { code?: unknown };

        if (typeof code === 'string' && code) {
            return code;
        }
    }

    return error instanceof Error ? error.constructor.name : typeof error;
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
        warn?: (message: string, error: string) => void;
        prune?: boolean;
    } = {},
): Limiter => {
    let lastPrune = 0;

    // Each instance deletes dead counters, at most every PRUNE_EVERY_MS, the
    // Studio's included (every Studio call passes here too). The delete uses
    // the same bounded counter pool as the counts.
    const pruneOften = (): void => {
        if (prune && Date.now() - lastPrune > PRUNE_EVERY_MS) {
            lastPrune = Date.now();
            pruneCounters(db).catch((error) => warn('limit counters not pruned', errorCode(error)));
        }
    };

    const fallbackOf = (stage: AdmissionStage): FallbackCounter =>
        isDailyStage(stage) ? dailyFallback : fallback;

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
            warn('rate limit unavailable, counting in memory', errorCode(error));

            return counter.hit(key, limit);
        }
    };

    const admit = async (plan: AdmissionPlan): Promise<Admission> => {
        pruneOften();

        try {
            const sentAt = Date.now();
            const admission = await admitHit(db, plan, windowS);

            for (const [stage, verdict] of Object.entries(admission.verdicts) as [
                AdmissionStage,
                RateVerdict,
            ][]) {
                fallbackOf(stage).record(plan[stage]!.key, verdict, sentAt);
            }

            return admission;
        } catch (error) {
            warn('rate limit unavailable, counting in memory', errorCode(error));

            return admitInMemory(plan, { minute: fallback, day: dailyFallback });
        }
    };

    return {
        hitKey: (surface, callerKey, limit) =>
            count(fallback, `${surface}:${callerKey}`, limit, windowS),
        admit,
        hitDaily: (counterKey, limit) => count(dailyFallback, counterKey, limit, DAY_S),
        refundDaily: async (counterKey) => {
            dailyFallback.refund(counterKey);

            try {
                await refundHit(db, counterKey, DAY_S);
            } catch (error) {
                warn('daily count not refunded', errorCode(error));
            }
        },
    };
};

const limiter = createLimiter(counterDb);

/** Count one call by `callerKey` on `surface` against `limit` (see Limiter). */
export const hitKey = (surface: Surface, callerKey: string, limit: number): Promise<RateVerdict> =>
    limiter.hitKey(surface, callerKey, limit);

/** Count one call from the address `ip` against `limit`, `surface`'s anonymous allowance unless given. */
export const hit = (
    surface: Surface,
    ip: string,
    limit: number = LIMITS[surface],
): Promise<RateVerdict> => hitKey(surface, limiterBucket(ip), limit);

/** Count one anonymous call on the counters of `plan` (see Limiter). */
export const admit = (plan: AdmissionPlan): Promise<Admission> => limiter.admit(plan);

/** Count one API call on a daily counter (see Limiter). */
export const hitDaily = (counterKey: string, limit: number): Promise<RateVerdict> =>
    limiter.hitDaily(counterKey, limit);

/** Give back one hit on a daily counter (see Limiter). */
export const refundDaily = (counterKey: string): Promise<void> => limiter.refundDaily(counterKey);
