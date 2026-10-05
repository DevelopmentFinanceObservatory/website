import 'server-only';

import Redis from 'ioredis';

import { limiterBucket } from './caller';

/**
 * Per-IP rate limit for the platform proxy's /api/* routes (src/lib/proxy/
 * forward; /mcp has none): a fixed window in Redis, shared by every
 * instance. An IPv6 client is counted by its /64 (see limiterBucket). On
 * only when REDIS_URL is set. Without it every call passes, so a deployment
 * can run the proxy before its Redis exists. A Redis error fails open too:
 * the platform's own doors are the backstop, the limit is a courtesy.
 *
 * The window and the allowance per surface are env-tunable:
 *   RATE_LIMIT_WINDOW_S   (default 60)
 *   RATE_LIMIT_API        calls per window per IP on /api/* (default 120)
 *   RATE_LIMIT_PIN        calls per window per IP on /api/download-pin
 *                         (default 10)
 */
const WINDOW_S = Number(process.env.RATE_LIMIT_WINDOW_S) || 60;

export const LIMITS = {
    api: Number(process.env.RATE_LIMIT_API) || 120,
    pin: Number(process.env.RATE_LIMIT_PIN) || 10,
} as const;

export type Surface = keyof typeof LIMITS;

// Next dev hot-reloads modules: the client lives on globalThis so a save
// doesn't leak a connection per edit.
const globalForRedis = globalThis as unknown as { redis?: Redis | null };

const redis = (): Redis | null => {
    if (globalForRedis.redis !== undefined) {
        return globalForRedis.redis;
    }

    const url = process.env.REDIS_URL;

    globalForRedis.redis = url
        ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })
        : null;

    return globalForRedis.redis;
};

export type Verdict = {
    allowed: boolean;
    limit: number;
    remaining: number;
    // Seconds until the window resets.
    reset: number;
};

/**
 * Count one call for `ip` on `surface` and say whether it is within the
 * allowance. Without Redis: always allowed, limit reported as-is.
 */
export const hit = async (surface: Surface, ip: string): Promise<Verdict> => {
    const limit = LIMITS[surface];
    const client = redis();

    if (!client) {
        return { allowed: true, limit, remaining: limit, reset: WINDOW_S };
    }

    const now = Math.floor(Date.now() / 1000);
    const window = now - (now % WINDOW_S);
    const key = `rl:${surface}:${limiterBucket(ip)}:${window}`;

    try {
        const [[, count]] = (await client.multi().incr(key).expire(key, WINDOW_S).exec()) as [
            [null, number],
            [null, number],
        ];

        return {
            allowed: count <= limit,
            limit,
            remaining: Math.max(0, limit - count),
            reset: window + WINDOW_S - now,
        };
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
