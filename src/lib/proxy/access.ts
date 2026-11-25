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
 *                                allowance (LIMITS), and on the address's
 *                                backstop
 *   no valid token               counted against the address's cookieless
 *                                count at the cookieless allowance, and on
 *                                the address's backstop; a 429 names what an
 *                                API key gives while keys are on
 *
 * The backstop counts every anonymous call at the address, so it is the
 * most an address gets however many tokens it mints. The cookieless count
 * is a counter of its own, which a call with a valid token never touches,
 * so readers with tokens do not spend a cookieless caller's allowance, and
 * a cookieless caller reaches its own limit before the backstop. A call
 * whose key the store does not hold, or cannot check, is counted as a
 * cookieless call. With visitor limits off, an anonymous call on 'api' or
 * 'datasets' is counted against its address at LIMITS, with no backstop,
 * and on 'mcp' and 'pin' always, with nothing more.
 *
 * Such a call is also counted in a UTC day: on its own daily count, the
 * visitor's (visitorDailyCounterKey) or else the address's cookieless one
 * (cookielessDailyCounterKey), and on the address's daily ceiling
 * (addressDailyCounterKey), which every anonymous call there spends. Past a
 * daily count the call is a 429 `allowance_exhausted` until 00:00 UTC,
 * which names what an API key gives while keys are on. A caller that
 * counts with `daily` false (the Studio and stored-file downloads, through
 * countAnonymous in src/lib/proxy/forward) skips the daily counts, and a
 * daily count whose allowance is 0 is skipped.
 *
 * All of a call's anonymous counts are taken at once (`admit`, admitHit in
 * src/lib/proxy/limitCounter): the address's backstop and ceiling are read
 * first, and an address over either refuses the call before any count of
 * its own is written, so fresh visitor ids from such an address cost no
 * rows. Then the call's own per-minute count, then its own daily count,
 * then the backstop and ceiling are spent, each only once the one before
 * admits the call.
 *
 * Every refusal of a counted call says whose count refused it (`scope`):
 * the visitor's, the address's (its cookieless, backstop or ceiling count,
 * or its count with visitor limits off), the account's or the key's. Its
 * `tier` is the count the call was taken as, so a visitor refused by its
 * address's backstop is tier `visitor`, scope `address`.
 */
import {
    conflictingKeysProblem,
    cookielessLimitedProblem,
    anonymousDailyProblem,
    dailyQuotaProblem,
    invalidKeyProblem,
    rateLimitedProblem,
} from './problem.ts';
import { readApiKey } from './apiKey.ts';
import {
    accountDailyCounterKey,
    addressCounterKey,
    addressDailyCounterKey,
    backstopCounterKey,
    cookielessCounterKey,
    cookielessDailyCounterKey,
    isDailyStage,
    keyDailyCounterKey,
    visitorCounterKey,
    visitorDailyCounterKey,
    type Admission,
    type AdmissionPlan,
} from './limitCounter.ts';
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

/**
 * Whose count refused a call: a visitor's, an address's, an account's
 * (its per-minute limit or daily quota) or one key's daily cap.
 */
export type LimitScope = 'visitor' | 'address' | 'account' | 'key';

/** The response header that carries a counted call's LimitTier to the request log. */
export const LIMIT_TIER_HEADER = 'x-dfo-limit-tier';

/** The surfaces a visitor token counts on, the ones a key counts on. */
export type VisitorSurface = 'api' | 'datasets';

/**
 * The anonymous allowances per window: `address` for an address with
 * visitor limits off (LIMITS, which a visitor also gets), `cookieless` for
 * an address's calls with no valid visitor token, and `backstop` for all of
 * an address's anonymous calls while visitor limits are on. Per UTC day,
 * `daily` is a visitor's anonymous calls or an address's cookieless ones, and
 * `dailyAddress` all of an address's anonymous calls; 0 is no cap.
 */
export type AnonymousLimits = {
    address: Record<Surface, number>;
    cookieless: Record<VisitorSurface, number>;
    backstop: Record<VisitorSurface, number>;
    daily: Record<VisitorSurface, number>;
    dailyAddress: Record<VisitorSurface, number>;
};

export type Identity = { kind: 'anonymous' } | { kind: 'keyed'; keyId: string; accountId: string };

/** What the usage line says happened to a keyed call. */
export type KeyOutcome = 'allowed' | 'limited' | 'invalid' | 'forged' | 'unavailable';

/**
 * The decision. `refusal` is the answer when the call is not forwarded.
 * `verdict` is what the rate headers say, when a count ran. `outcome` is set
 * when the call carried a key that was looked at, and is what the usage line
 * (forward) reports. `tier` is the count a counted call was taken as, and
 * `scope` whose count refused it, on a 429.
 */
export type Access = {
    refusal?: Response;
    identity: Identity;
    verdict?: RateVerdict;
    outcome?: KeyOutcome;
    tier?: LimitTier;
    scope?: LimitScope;
};

export type AccessDeps = {
    verifier: KeyVerifier;
    // Whether the key's tag is one a server secret made (src/lib/auth/keyTag).
    tagValid: (key: string) => boolean;
    // Count a call from an address against `limit`: 'mcp' and 'pin'.
    hitAddress: (surface: Surface, ip: string, limit: number) => Promise<RateVerdict>;
    // Count an anonymous call on 'api' or 'datasets' on the counters of
    // `plan` (admitHit in ./limitCounter).
    admit: (plan: AdmissionPlan) => Promise<Admission>;
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
 * check. `daily` false leaves an anonymous call off the daily allowances.
 */
export const decideAccess = async (
    deps: AccessDeps,
    {
        surface,
        keys,
        headers,
        ip,
        daily,
    }: {
        surface: Surface | undefined;
        keys: boolean;
        headers: Headers;
        ip: string;
        daily: boolean;
    },
): Promise<Access> => {
    const anonymous: Identity = { kind: 'anonymous' };
    // A count of the address alone, as 'mcp' and 'pin' are counted.
    const limited = (verdict: RateVerdict, tier: LimitTier): Access =>
        verdict.allowed
            ? { identity: anonymous, verdict, tier }
            : {
                  refusal: rateLimitedProblem(
                      verdict,
                      limitHeaders({ identity: anonymous, verdict, tier }),
                  ),
                  identity: anonymous,
                  verdict,
                  tier,
                  scope: 'address',
              };

    // An anonymous call, by visitor or by address. `cookieless` counts it
    // as a call with no valid visitor token whatever it carries: a key the
    // store does not hold or cannot check.
    const countAnonymous = async (cookieless = false): Promise<Access> => {
        if (!surface) {
            return { identity: anonymous };
        }

        if (!isVisitorSurface(surface)) {
            return limited(
                await deps.hitAddress(surface, ip, deps.anonymousLimits.address[surface]),
                'address',
            );
        }

        const limits = deps.anonymousLimits;
        const visitorsOn = deps.visitorLimits();
        const visitorId = visitorsOn && !cookieless ? deps.visitor(headers) : null;
        const tier: LimitTier = visitorId === null ? 'address' : 'visitor';
        const dayLimit = daily ? limits.daily[surface] : 0;
        const ceilingLimit = daily ? limits.dailyAddress[surface] : 0;
        const plan: AdmissionPlan = {
            minute:
                visitorId !== null
                    ? { key: visitorCounterKey(surface, visitorId), limit: limits.address[surface] }
                    : visitorsOn
                      ? {
                            key: cookielessCounterKey(surface, ip),
                            limit: limits.cookieless[surface],
                        }
                      : { key: addressCounterKey(surface, ip), limit: limits.address[surface] },
        };

        if (visitorsOn) {
            plan.backstop = {
                key: backstopCounterKey(surface, ip),
                limit: limits.backstop[surface],
            };
        }

        if (dayLimit > 0) {
            plan.day = {
                key:
                    visitorId === null
                        ? cookielessDailyCounterKey(surface, ip)
                        : visitorDailyCounterKey(surface, visitorId),
                limit: dayLimit,
            };
        }

        if (ceilingLimit > 0) {
            plan.ceiling = { key: addressDailyCounterKey(surface, ip), limit: ceilingLimit };
        }

        const { refusedBy, verdicts } = await deps.admit(plan);

        if (refusedBy === null) {
            return { identity: anonymous, verdict: verdicts.minute, tier };
        }

        const verdict = verdicts[refusedBy]!;
        const own = refusedBy === 'minute' || refusedBy === 'day';
        const scope = own && visitorId !== null ? 'visitor' : 'address';
        const refused: Access = { identity: anonymous, verdict, tier, scope };
        const rate = limitHeaders(refused);

        if (isDailyStage(refusedBy)) {
            const whose = !own
                ? 'address'
                : visitorId !== null
                  ? 'visitor'
                  : visitorsOn
                    ? 'cookieless'
                    : 'address';

            return {
                ...refused,
                refusal: anonymousDailyProblem(
                    verdict,
                    rate,
                    whose,
                    keys ? { dailyLimit: deps.defaultDailyLimit } : undefined,
                ),
            };
        }

        return {
            ...refused,
            refusal:
                visitorsOn && visitorId === null && keys
                    ? cookielessLimitedProblem(verdict, rate, {
                          limit: deps.defaultLimit,
                          dailyLimit: deps.defaultDailyLimit,
                      })
                    : rateLimitedProblem(verdict, rate, scope),
        };
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
                scope: 'account',
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
            scope,
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

    const address = await countAnonymous(true);

    if (found.kind === 'unavailable' || address.refusal) {
        return { ...address, outcome: address.refusal ? 'limited' : 'unavailable' };
    }

    // The call spent the address's counts, so the 401 carries them and the tier.
    return {
        ...address,
        refusal: invalidKeyProblem(limitHeaders(address)),
        outcome: 'invalid',
    };
};
