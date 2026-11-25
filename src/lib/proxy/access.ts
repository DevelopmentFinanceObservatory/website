/**
 * Who a call to the platform proxy is, and whether it is within its
 * allowance (src/lib/proxy/forward): one decision per call, made before the
 * call goes upstream. Kept apart from `forward` so `node --test` can drive it
 * with a fake limiter and key verifier.
 *
 * A call is anonymous, counted against its address, or keyed, counted
 * against the account that owns the key: first the account's per-minute
 * limit, then the key's own daily cap when it has one, then the account's
 * daily quota, which every key of the account spends (docs/design/api-keys.md,
 * "The proxy check"). Each count is taken only once the one before admits the
 * call, so a call the key's cap refuses leaves the account's daily quota
 * untouched, and the account's other keys keep it. A call the account's quota
 * refuses gives its hit on the key's cap back, so the key is not spent by
 * calls that never ran. Either call has still spent one on the account's
 * per-minute window. Keys are honoured on the 'api' and
 * 'datasets' surfaces (`honorsKeys`). Every key carries a tag signed by a
 * server secret (src/lib/auth/keyTag), checked first, so a made-up key costs
 * no read and no count:
 *
 *   no key                       anonymous
 *   bad tag                      401, no lookup, no count (outcome `forged`)
 *   good tag, valid in the cache counted against the account per minute,
 *                                then the key's cap if any, then the
 *                                account's daily quota; the headers report
 *                                the account's per-minute count, or the
 *                                daily count that refuses
 *   good tag, otherwise looked up:
 *     valid                      counted against the account, never the
 *                                address, so keyed callers behind a shared
 *                                address are not held to its limit
 *     invalid                    counted as a cookieless call, as a deleted
 *                                key still has a good tag, then 401 (429 when
 *                                the address is over its limit)
 *     store unavailable          anonymous, counted as a cookieless call
 *
 * A key sent on a surface that does not honour keys ('mcp' and 'pin'), or
 * with keys switched off (API_KEYS_ENABLED), is ignored: the call is
 * anonymous and the key is stripped before the call goes upstream by
 * `forward`.
 *
 * An anonymous call on the 'api' or 'datasets' surface is counted by the
 * site's visitor token while visitor limits are on (src/lib/proxy/visitor):
 *
 *   valid visitor token          counted against the visitor at the address
 *                                allowance (LIMITS), then on the address's
 *                                backstop
 *   no valid token               counted against the address's cookieless
 *                                count at the cookieless allowance, then on
 *                                the address's backstop; a 429 names what an
 *                                API key gives while keys are on
 *
 * The backstop counts every anonymous call at the address, so it is the
 * most an address gets however many tokens it mints. The cookieless count
 * is a counter of its own, which a call with a valid token never touches,
 * so readers with tokens do not spend a cookieless caller's allowance, and
 * a cookieless caller reaches its own limit before the backstop. A call
 * whose key the store does not hold, or cannot check, is counted as a
 * cookieless call. With visitor limits off, and on 'mcp' and 'pin' always,
 * an anonymous call is counted against its address at LIMITS.
 */
import {
    conflictingKeysProblem,
    cookielessLimitedProblem,
    dailyQuotaProblem,
    invalidKeyProblem,
    rateLimitedProblem,
} from './problem.ts';
import { readApiKey } from './apiKey.ts';
import { accountDailyCounterKey, keyDailyCounterKey } from './limitCounter.ts';
import type { KeyVerifier, ValidKey } from './keyVerifier.ts';
import type { RateVerdict } from './rateHeaders.ts';
import type { Surface } from './rateLimit.ts';
import { rateHeaders } from './rateHeaders.ts';

/**
 * Whose count a call spent: an account's through its key, a visitor's
 * through the site's visitor token, or its address's. The request log
 * (src/lib/proxy/requestLog) reports it, and never the visitor id.
 */
export type LimitTier = 'key' | 'visitor' | 'address';

/** The response header that carries a counted call's LimitTier to the request log. */
export const LIMIT_TIER_HEADER = 'x-dfo-limit-tier';

/** The surfaces a visitor token counts on, the ones a key counts on. */
export type VisitorSurface = 'api' | 'datasets';

/**
 * The anonymous allowances per window: `address` for an address with
 * visitor limits off (LIMITS, which a visitor also gets), `cookieless` for
 * an address's calls with no valid visitor token, and `backstop` for all of
 * an address's anonymous calls while visitor limits are on.
 */
export type AnonymousLimits = {
    address: Record<Surface, number>;
    cookieless: Record<VisitorSurface, number>;
    backstop: Record<VisitorSurface, number>;
};

export type Identity = { kind: 'anonymous' } | { kind: 'keyed'; keyId: string; accountId: string };

/** What the usage line says happened to a keyed call. */
export type KeyOutcome = 'allowed' | 'limited' | 'invalid' | 'forged' | 'unavailable';

/**
 * The decision. `refusal` is the answer when the call is not forwarded.
 * `verdict` is what the rate headers say, when a count ran. `outcome` is set
 * when the call carried a key that was looked at, and is what the usage line
 * (forward) reports.
 */
export type Access = {
    refusal?: Response;
    identity: Identity;
    verdict?: RateVerdict;
    outcome?: KeyOutcome;
    tier?: LimitTier;
};

export type AccessDeps = {
    verifier: KeyVerifier;
    // Whether the key's tag is one a server secret made (src/lib/auth/keyTag).
    tagValid: (key: string) => boolean;
    // Count a call from an address against `limit`.
    hitAddress: (surface: Surface, ip: string, limit: number) => Promise<RateVerdict>;
    // Count a call from a visitor (its visitor id) against `limit`.
    hitVisitor: (surface: VisitorSurface, visitorId: string, limit: number) => Promise<RateVerdict>;
    // Count a call with no valid visitor token from an address against `limit`,
    // on a counter apart from hitAddress's.
    hitCookieless: (surface: VisitorSurface, ip: string, limit: number) => Promise<RateVerdict>;
    // Count an anonymous call on its address's backstop against `limit`.
    hitBackstop: (surface: VisitorSurface, ip: string, limit: number) => Promise<RateVerdict>;
    anonymousLimits: AnonymousLimits;
    // Whether visitor limits are on (visitorLimitsOn in src/lib/proxy/visitor).
    visitorLimits: () => boolean;
    // The visitor id of the call's valid, unexpired visitor token, or null.
    visitor: (headers: Headers) => string | null;
    // Count a call from an account against `limit`.
    hitAccount: (surface: Surface, accountId: string, limit: number) => Promise<RateVerdict>;
    // Count a call on a daily counter (accountDailyCounterKey,
    // keyDailyCounterKey) against `limit`.
    hitDaily: (counterKey: string, limit: number) => Promise<RateVerdict>;
    // Give back one hit on a daily counter, for a call a later count refused.
    refundDaily: (counterKey: string) => Promise<void>;
    // The account's limit when it has none of its own.
    defaultLimit: number;
    // An account's daily quota when it has none of its own.
    defaultDailyLimit: number;
};

// The surfaces a key counts on: the API and the Datasets API's document
// routes, which the SDKs' dataset reads use. A read the edge cache answers
// never reaches the proxy, so it is neither counted nor checked.
const KEYED_SURFACES: ReadonlySet<Surface> = new Set(['api', 'datasets']);

/** Whether a call on `surface` may carry a key: the 'api' and 'datasets' surfaces. */
export const honorsKeys = (surface: Surface | undefined): boolean =>
    surface !== undefined && KEYED_SURFACES.has(surface);

const isVisitorSurface = (surface: Surface): surface is VisitorSurface =>
    KEYED_SURFACES.has(surface);

/** The headers a counted call goes out with: the rate headers and the LimitTier. */
export const limitHeaders = ({ verdict, tier }: Access): Record<string, string> => ({
    ...(verdict ? rateHeaders(verdict) : {}),
    ...(tier ? { [LIMIT_TIER_HEADER]: tier } : {}),
});

const accountLimit = (key: ValidKey, defaultLimit: number): number => key.rateLimit ?? defaultLimit;

/**
 * Decide the call. `keys` is false when keys are switched off
 * (API_KEYS_ENABLED, read by `forward`), and the surface must honour keys as
 * well (`honorsKeys`). `surface` unset means the call has no limit and no key
 * check.
 */
export const decideAccess = async (
    deps: AccessDeps,
    {
        surface,
        keys,
        headers,
        ip,
    }: { surface: Surface | undefined; keys: boolean; headers: Headers; ip: string },
): Promise<Access> => {
    const anonymous: Identity = { kind: 'anonymous' };
    const limited = (verdict: RateVerdict, tier: LimitTier, refusal?: Response): Access =>
        verdict.allowed
            ? { identity: anonymous, verdict, tier }
            : {
                  refusal:
                      refusal ??
                      rateLimitedProblem(
                          verdict,
                          limitHeaders({ identity: anonymous, verdict, tier }),
                      ),
                  identity: anonymous,
                  verdict,
                  tier,
              };

    // The address at LIMITS: visitor limits off, and 'mcp' and 'pin'.
    const countAddress = async (): Promise<Access> =>
        surface
            ? limited(
                  await deps.hitAddress(surface, ip, deps.anonymousLimits.address[surface]),
                  'address',
              )
            : { identity: anonymous };

    // Count on `first`, then, once it admits the call, on the address's
    // backstop. The headers report `first`, or the backstop when it refuses.
    const thenBackstop = async (
        visitorSurface: VisitorSurface,
        first: RateVerdict,
    ): Promise<RateVerdict> => {
        if (!first.allowed) {
            return first;
        }

        const backstop = await deps.hitBackstop(
            visitorSurface,
            ip,
            deps.anonymousLimits.backstop[visitorSurface],
        );

        return backstop.allowed ? first : backstop;
    };

    // A call with no valid visitor token, or a key the store does not hold
    // or cannot check. A refusal names what an API key gives while keys are on.
    const countCookieless = async (): Promise<Access> => {
        if (!surface || !isVisitorSurface(surface) || !deps.visitorLimits()) {
            return countAddress();
        }

        const verdict = await thenBackstop(
            surface,
            await deps.hitCookieless(surface, ip, deps.anonymousLimits.cookieless[surface]),
        );
        const hint =
            !verdict.allowed && keys
                ? cookielessLimitedProblem(
                      verdict,
                      limitHeaders({ identity: anonymous, verdict, tier: 'address' }),
                      { limit: deps.defaultLimit, dailyLimit: deps.defaultDailyLimit },
                  )
                : undefined;

        return limited(verdict, 'address', hint);
    };

    const countAnonymous = async (): Promise<Access> => {
        if (!surface || !isVisitorSurface(surface) || !deps.visitorLimits()) {
            return countAddress();
        }

        const visitorId = deps.visitor(headers);

        if (visitorId === null) {
            return countCookieless();
        }

        const verdict = await thenBackstop(
            surface,
            await deps.hitVisitor(surface, visitorId, deps.anonymousLimits.address[surface]),
        );

        return limited(verdict, 'visitor');
    };

    if (!surface || !keys || !honorsKeys(surface)) {
        return countAnonymous();
    }

    const read = readApiKey(headers);

    if (read.kind === 'none') {
        return countAnonymous();
    }

    if (read.kind === 'conflict') {
        return { refusal: conflictingKeysProblem(), identity: anonymous };
    }

    if (read.kind === 'too-long') {
        return { refusal: invalidKeyProblem(), identity: anonymous, outcome: 'invalid' };
    }

    const countAccount = async (key: ValidKey): Promise<Access> => {
        const verdict = await deps.hitAccount(
            surface,
            key.accountId,
            accountLimit(key, deps.defaultLimit),
        );
        const identity: Identity = { kind: 'keyed', keyId: key.keyId, accountId: key.accountId };

        if (!verdict.allowed) {
            return {
                refusal: rateLimitedProblem(
                    verdict,
                    limitHeaders({ identity, verdict, tier: 'key' }),
                    'account',
                ),
                identity,
                verdict,
                outcome: 'limited',
                tier: 'key',
            };
        }

        const spent = (daily: RateVerdict, scope: 'account' | 'key'): Access => ({
            refusal: dailyQuotaProblem(
                daily,
                limitHeaders({ identity, verdict: daily, tier: 'key' }),
                scope,
            ),
            identity,
            verdict: daily,
            outcome: 'limited',
            tier: 'key',
        });

        const capKey = keyDailyCounterKey(key.keyId);

        if (key.dailyLimit !== null) {
            const capped = await deps.hitDaily(capKey, key.dailyLimit);

            if (!capped.allowed) {
                return spent(capped, 'key');
            }
        }

        const daily = await deps.hitDaily(
            accountDailyCounterKey(key.accountId),
            key.accountDailyLimit ?? deps.defaultDailyLimit,
        );

        if (!daily.allowed) {
            if (key.dailyLimit !== null) {
                await deps.refundDaily(capKey);
            }

            return spent(daily, 'account');
        }

        return { identity, verdict, outcome: 'allowed', tier: 'key' };
    };

    if (!deps.tagValid(read.key)) {
        return { refusal: invalidKeyProblem(), identity: anonymous, outcome: 'forged' };
    }

    const cached = await deps.verifier.cachedValid(read.key);

    if (cached) {
        return countAccount(cached);
    }

    const found = await deps.verifier.verify(read.key);

    if (found.kind === 'valid') {
        return countAccount(found);
    }

    const address = await countCookieless();

    if (found.kind === 'unavailable' || address.refusal) {
        return { ...address, outcome: address.refusal ? 'limited' : 'unavailable' };
    }

    return { refusal: invalidKeyProblem(), identity: anonymous, outcome: 'invalid' };
};
