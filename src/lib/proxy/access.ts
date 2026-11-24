/**
 * Who a call to the platform proxy is, and whether it is within its
 * allowance (src/lib/proxy/forward): one decision per call, made before the
 * call goes upstream. Kept apart from `forward` so `node --test` can drive it
 * with a fake limiter and key verifier.
 *
 * A call is anonymous, counted against its address as before, or keyed,
 * counted against the account that owns the key at the account's limit,
 * against the account's daily quota, which every key of the account spends,
 * and against the key's own daily cap when it has one
 * (docs/design/api-keys.md, "The Proxy Check"). Keys are honoured on the 'api' and 'datasets' surfaces
 * (`honorsKeys`). Every key carries a tag signed by a server secret
 * (src/lib/auth/keyTag), checked first, so a made-up key costs no read and no
 * count:
 *
 *   no key                       anonymous
 *   bad tag                      401, no lookup, no count (outcome `forged`)
 *   good tag, valid in the cache counted against the account, then its
 *                                daily quota, then the key's cap if any; the
 *                                headers report the account's per-minute
 *                                count, or the daily count that refuses
 *   good tag, otherwise looked up:
 *     valid                      counted against the account, never the
 *                                address, so keyed callers behind a shared
 *                                address are not held to its limit
 *     invalid                    counted against the address, as a deleted
 *                                key still has a good tag, then 401 (429 when
 *                                the address is over its limit)
 *     store unavailable          anonymous, counted against the address
 *
 * A key sent on a surface that does not honour keys ('mcp' and 'pin'), or
 * with keys switched off (API_KEYS_ENABLED), is ignored: the call is
 * anonymous and the key is stripped before the call goes upstream by
 * `forward`.
 */
import {
    conflictingKeysProblem,
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
};

export type AccessDeps = {
    verifier: KeyVerifier;
    // Whether the key's tag is one a server secret made (src/lib/auth/keyTag).
    tagValid: (key: string) => boolean;
    // Count a call from an address against the surface's anonymous allowance.
    hitAddress: (surface: Surface, ip: string) => Promise<RateVerdict>;
    // Count a call from an account against `limit`.
    hitAccount: (surface: Surface, accountId: string, limit: number) => Promise<RateVerdict>;
    // Count a call on a daily counter (accountDailyCounterKey,
    // keyDailyCounterKey) against `limit`.
    hitDaily: (counterKey: string, limit: number) => Promise<RateVerdict>;
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

const accountLimit = (key: ValidKey, defaultLimit: number): number => key.rateLimit ?? defaultLimit;

/**
 * Decide the call. `keys` is whether the route and the deployment accept a
 * key at all (the route's `keys` option, and API_KEYS_ENABLED); the surface
 * must honour keys as well (`honorsKeys`). `surface` unset means the call has
 * no limit and no key check.
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
    const countAddress = async (): Promise<Access> => {
        const verdict = surface ? await deps.hitAddress(surface, ip) : undefined;

        return verdict && !verdict.allowed
            ? {
                  refusal: rateLimitedProblem(verdict, rateHeaders(verdict)),
                  identity: anonymous,
                  verdict,
              }
            : { identity: anonymous, verdict };
    };

    if (!surface || !keys || !honorsKeys(surface)) {
        return countAddress();
    }

    const read = readApiKey(headers);

    if (read.kind === 'none') {
        return countAddress();
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
                refusal: rateLimitedProblem(verdict, rateHeaders(verdict), 'account'),
                identity,
                verdict,
                outcome: 'limited',
            };
        }

        const spent = (daily: RateVerdict, scope: 'account' | 'key'): Access => ({
            refusal: dailyQuotaProblem(daily, rateHeaders(daily), scope),
            identity,
            verdict: daily,
            outcome: 'limited',
        });
        const daily = await deps.hitDaily(
            accountDailyCounterKey(key.accountId),
            key.accountDailyLimit ?? deps.defaultDailyLimit,
        );

        if (!daily.allowed) {
            return spent(daily, 'account');
        }

        if (key.dailyLimit !== null) {
            const capped = await deps.hitDaily(keyDailyCounterKey(key.keyId), key.dailyLimit);

            if (!capped.allowed) {
                return spent(capped, 'key');
            }
        }

        return { identity, verdict, outcome: 'allowed' };
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

    const address = await countAddress();

    if (found.kind === 'unavailable' || address.refusal) {
        return { ...address, outcome: address.refusal ? 'limited' : 'unavailable' };
    }

    return { refusal: invalidKeyProblem(), identity: anonymous, outcome: 'invalid' };
};
