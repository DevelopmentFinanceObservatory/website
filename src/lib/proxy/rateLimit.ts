import 'server-only';

import { counterDb } from '@/lib/db';

import { limiterBucket } from './caller';
import { countHit, pruneCounters, type Verdict } from './limitCounter';

/**
 * Per-IP rate limit for the platform proxy's /api/* and /mcp routes
 * (src/lib/proxy/forward): a fixed window counted in Postgres
 * (./limitCounter), shared by every instance. An IPv6 client is counted by
 * its /64 (see limiterBucket). A count runs on its own small pool
 * (src/lib/db's counterDb), which gives up after 400 ms in Postgres, 500 ms
 * in the client, or 2 s waiting for a connection. A database error or a
 * timed-out count fails open: the
 * platform's own doors are the backstop, and the limit is a courtesy.
 *
 * The window and the allowance per surface are env-tunable:
 *   RATE_LIMIT_WINDOW_S   (default 60)
 *   RATE_LIMIT_API        calls per window per IP on /api/* (default 120)
 *   RATE_LIMIT_PIN        calls per window per IP on /api/download-pin
 *                         (default 10)
 *   RATE_LIMIT_MCP        requests per window per IP on /mcp (default 300)
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

export type Surface = keyof typeof LIMITS;

let lastPrune = 0;

/**
 * Count one call for `ip` on `surface` and say whether it is within the
 * allowance. A database that fails or is slow lets the call through. Each
 * instance also deletes dead counters, at most once an hour, the Studio's
 * included (every Studio call passes here too). The delete uses the same
 * bounded counter pool as the counts.
 */
export const hit = async (surface: Surface, ip: string): Promise<Verdict> => {
    const limit = LIMITS[surface];

    if (Date.now() - lastPrune > PRUNE_EVERY_MS) {
        lastPrune = Date.now();
        pruneCounters(counterDb).catch((error) => console.warn('limit counters not pruned', error));
    }

    try {
        return await countHit(counterDb, `${surface}:${limiterBucket(ip)}`, limit, WINDOW_S);
    } catch (error) {
        console.warn('rate limit unavailable, passing', error);

        return { allowed: true, limit, remaining: limit, reset: WINDOW_S };
    }
};

/** The standard rate-limit headers for a verdict. */
export const rateHeaders = (verdict: Verdict): Record<string, string> => ({
    'X-RateLimit-Limit': String(verdict.limit),
    'X-RateLimit-Remaining': String(verdict.remaining),
    'X-RateLimit-Reset': String(verdict.reset),
});
