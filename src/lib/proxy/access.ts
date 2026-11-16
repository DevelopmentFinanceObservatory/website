/**
 * Who a call to the platform proxy is, and whether it is within its
 * allowance (src/lib/proxy/forward): one decision per call, made before the
 * call goes upstream. Kept apart from `forward` so `node --test` can drive it
 * with a fake limiter and key verifier.
 *
 * A call is anonymous, counted against its address as before, or keyed,
 * counted against the account that owns the key at the account's limit
 * (docs/design/api-keys.md, "The Proxy Check"):
 *
 *   no key                       anonymous
 *   valid key in the cache       counted against the account
 *   any other key                counted against the address first, so a
 *                                made-up key cannot cost more lookups than the
 *                                address could make calls, and refused with 429
 *                                when over; then looked up:
 *     invalid                    401, not anonymous
 *     store unavailable          anonymous, on the address count just made
 *     valid                      counted against the account as well
 *
 * A key sent on a surface that does not honor keys, or with keys switched
 * off (API_KEYS_ENABLED), is ignored: the call is anonymous and the key is
 * stripped before the call goes upstream by `forward`.
 */
import { conflictingKeysProblem, invalidKeyProblem, rateLimitedProblem } from './problem.ts';
import { readApiKey } from './apiKey.ts';
import type { KeyVerifier, ValidKey } from './keyVerifier.ts';
import type { RateVerdict } from './rateHeaders.ts';
import type { Surface } from './rateLimit.ts';
import { rateHeaders } from './rateHeaders.ts';

export type Identity = { kind: 'anonymous' } | { kind: 'keyed'; keyId: string; accountId: string };

/** What the usage line says happened to a keyed call. */
export type KeyOutcome = 'allowed' | 'limited' | 'invalid' | 'unavailable';

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
    // Count a call from an address against the surface's anonymous allowance.
    hitAddress: (surface: Surface, ip: string) => Promise<RateVerdict>;
    // Count a call from an account against `limit`.
    hitAccount: (surface: Surface, accountId: string, limit: number) => Promise<RateVerdict>;
    // The account's limit when it has none of its own.
    defaultLimit: number;
};

const accountLimit = (key: ValidKey, defaultLimit: number): number => key.rateLimit ?? defaultLimit;

/**
 * Decide the call. `keys` is whether this call honors a key at all (the
 * route's surface, and API_KEYS_ENABLED); `surface` unset means the call has
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

    if (!surface || !keys) {
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

        return verdict.allowed
            ? { identity, verdict, outcome: 'allowed' }
            : {
                  refusal: rateLimitedProblem(verdict, rateHeaders(verdict), 'account'),
                  identity,
                  verdict,
                  outcome: 'limited',
              };
    };

    const cached = await deps.verifier.cachedValid(read.key);

    if (cached) {
        return countAccount(cached);
    }

    const address = await countAddress();

    if (address.refusal) {
        return { ...address, outcome: 'limited' };
    }

    const found = await deps.verifier.verify(read.key);

    if (found.kind === 'valid') {
        return countAccount(found);
    }

    if (found.kind === 'invalid') {
        return { refusal: invalidKeyProblem(), identity: anonymous, outcome: 'invalid' };
    }

    return { ...address, outcome: 'unavailable' };
};
