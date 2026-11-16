/**
 * What a rate-limit check decided, and the headers that tell a client so. No
 * `server-only` import, so node:test loads it.
 */
import type { Verdict } from './limitCounter';

/** A verdict, and whether a count ran to reach it. */
export type RateVerdict = Verdict & {
    // False for a call that passed without a count, so no limit applies. The
    // limiter always counts now: a shared count that fails is counted in
    // memory instead (src/lib/proxy/rateLimit).
    counted: boolean;
};

/**
 * The standard rate-limit headers for a verdict. An uncounted verdict gets
 * none, since no limit applies to describe.
 */
export const rateHeaders = (verdict: RateVerdict): Record<string, string> =>
    verdict.counted
        ? {
              'X-RateLimit-Limit': String(verdict.limit),
              'X-RateLimit-Remaining': String(verdict.remaining),
              'X-RateLimit-Reset': String(verdict.reset),
          }
        : {};
