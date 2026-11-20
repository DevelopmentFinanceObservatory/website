/**
 * What a rate-limit check decided, and the headers that tell a client so. No
 * `server-only` import, so node:test loads it.
 */
import type { Verdict } from './limitCounter';

/**
 * A verdict. Every call on a limited surface is counted: a shared count that
 * fails is counted in memory instead (src/lib/proxy/rateLimit).
 */
export type RateVerdict = Verdict;

/** The standard rate-limit headers for a verdict. */
export const rateHeaders = (verdict: RateVerdict): Record<string, string> => ({
    'X-RateLimit-Limit': String(verdict.limit),
    'X-RateLimit-Remaining': String(verdict.remaining),
    'X-RateLimit-Reset': String(verdict.reset),
});
