import { defaultKeyHasher } from '@better-auth/api-key';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { apikey, user } from '../../../db/schema.ts';
import { hasKeyPrefix } from './apiKey.ts';

/**
 * Looks an API key up for the platform proxy (src/lib/proxy/forward). The
 * key store is the `apikey` table of the `@better-auth/api-key` plugin, in
 * the website's Postgres, and the plugin's own `verifyApiKey` is not used
 * here: it writes to the key's row on every call and reports a database
 * outage as an invalid key. This reads the row itself, keyed by the plugin's
 * own hash of the key (`defaultKeyHasher`: base64url SHA-256), joined to the
 * owning account's limit (`user.api_rate_limit`), and checks `enabled` and
 * `expires_at` itself.
 *
 * The answer is one of three, so the proxy can tell a bad key from a store it
 * cannot reach:
 *   valid        the key's public id, its account, the account's own limit
 *                and the key's own daily limit (each null for the deployment
 *                default) and when the key expires
 *   invalid      no such key, disabled, or expired
 *   unavailable  the read threw or timed out; the proxy fails open
 *
 * A small in-process cache keeps the common call off the database. A valid
 * entry lives CACHE_VALID_MS from the read, never extended, and never past
 * the key's own expiry, so a key deleted or an account limit lowered takes
 * effect on an instance within that time even while the store is down. An
 * invalid entry lives CACHE_INVALID_MS. An unavailable answer is not cached.
 * Neither the key nor its hash leaves this module except as the cache key
 * (hash only, in memory). A failed read or write logs only its error code.
 *
 * A lookup that finds a valid key also records its use: `apikey.last_request`
 * is set to the time of the lookup, which the key pages show as "last used".
 * It is written only on a cache miss, so at most about once per cache
 * lifetime per key per instance, and not on every call, which would put a
 * write on the request path. The write is fire and forget on the same pool:
 * the verdict does not wait for it, and a failed or slow write is logged at
 * most (the key's public id is not in the line) and changes nothing. An
 * invalid or unavailable answer writes nothing. The shown time is therefore
 * approximate, up to a cache lifetime behind the last call.
 */
export type KeyVerdict =
    | {
          kind: 'valid';
          // The plugin's `apikey.id`, the public name of the key in logs.
          keyId: string;
          accountId: string;
          // The account's own calls per window, or null for the default.
          rateLimit: number | null;
          // The key's own calls per UTC day on /mcp, or null for the default.
          dailyLimit: number | null;
          expiresAt: Date | null;
      }
    | { kind: 'invalid' }
    | { kind: 'unavailable' };

export type ValidKey = Extract<KeyVerdict, { kind: 'valid' }>;

export const CACHE_VALID_MS = 60_000;
export const CACHE_INVALID_MS = 30_000;
const CACHE_MAX_ENTRIES = 5_000;

/** Reads only; the pool behind it is src/lib/db's keyDb. */
export type KeyDb = Pick<NodePgDatabase, 'select' | 'update'>;

type Row = {
    id: string;
    referenceId: string;
    enabled: boolean | null;
    expiresAt: Date | null;
    apiRateLimit: number | null;
    dailyLimit: number | null;
};

type Entry = { verdict: KeyVerdict; until: number };

// A bounded map of verdicts by key hash. Insertion order is age, so a full
// map drops its oldest entry (after dropping whatever has expired).
const boundedCache = (max: number, now: () => number) => {
    const entries = new Map<string, Entry>();

    return {
        get(hash: string): KeyVerdict | undefined {
            const entry = entries.get(hash);

            if (!entry) {
                return undefined;
            }

            if (entry.until <= now()) {
                entries.delete(hash);

                return undefined;
            }

            return entry.verdict;
        },
        set(hash: string, verdict: KeyVerdict, until: number): void {
            entries.delete(hash);

            if (entries.size >= max) {
                for (const [key, entry] of entries) {
                    if (entry.until <= now()) {
                        entries.delete(key);
                    }
                }
            }

            if (entries.size >= max) {
                entries.delete(entries.keys().next().value!);
            }

            entries.set(hash, { verdict, until });
        },
        size: () => entries.size,
    };
};

/**
 * What went wrong, as a code and nothing more: the first `code` down the
 * error's cause chain (Postgres's SQLSTATE, Node's ECONNREFUSED), else its
 * name. Drizzle's DrizzleQueryError puts the query's parameters, the key's
 * hash among them, in its message, so the error itself is never logged.
 */
export const errorCode = (error: unknown): string => {
    for (let e: unknown = error, depth = 0; e && depth < 5; depth += 1) {
        const code = (e as { code?: unknown }).code;

        if (typeof code === 'string' && code) {
            return code;
        }

        e = (e as { cause?: unknown }).cause;
    }

    return error instanceof Error ? error.name : typeof error;
};

/** A positive whole number is an account's or key's own limit; anything else is the default. */
const ownLimit = (value: number | null): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null;

export type KeyVerifier = {
    /** The verdict for `key`: from the cache, else one read of the key store. */
    verify(key: string): Promise<KeyVerdict>;
    /**
     * The cached verdict for `key` when it is a valid one, which answers
     * without a lookup, and undefined otherwise.
     */
    cachedValid(key: string): Promise<ValidKey | undefined>;
    /** How many verdicts are cached, valid and invalid together. */
    cacheSize(): number;
};

export const createKeyVerifier = (
    db: KeyDb,
    {
        now = Date.now,
        validMs = CACHE_VALID_MS,
        invalidMs = CACHE_INVALID_MS,
        maxEntries = CACHE_MAX_ENTRIES,
        log = (message, code) => console.warn(message, { code }),
    }: {
        now?: () => number;
        validMs?: number;
        invalidMs?: number;
        maxEntries?: number;
        log?: (message: string, code: string) => void;
    } = {},
): KeyVerifier => {
    // Apart, so a flood of made-up keys cannot push real ones out.
    const valid = boundedCache(maxEntries, now);
    const invalid = boundedCache(maxEntries, now);
    // One read per hash at a time: callers arriving during it share it.
    const reading = new Map<string, Promise<KeyVerdict>>();

    // Records the key's use. Never throws, and nothing waits on it.
    const touch = (keyId: string): void => {
        void (async () => {
            try {
                await db
                    .update(apikey)
                    .set({ lastRequest: new Date(now()) })
                    .where(eq(apikey.id, keyId));
            } catch (error) {
                log('api key last use not recorded', errorCode(error));
            }
        })();
    };

    const read = async (hash: string): Promise<KeyVerdict> => {
        let rows: Row[];

        try {
            rows = await db
                .select({
                    id: apikey.id,
                    referenceId: apikey.referenceId,
                    enabled: apikey.enabled,
                    expiresAt: apikey.expiresAt,
                    apiRateLimit: user.apiRateLimit,
                    dailyLimit: apikey.dailyLimit,
                })
                .from(apikey)
                .innerJoin(user, eq(user.id, apikey.referenceId))
                .where(eq(apikey.key, hash))
                .limit(1);
        } catch (error) {
            log('api key store unavailable, treating the call as anonymous', errorCode(error));

            return { kind: 'unavailable' };
        }

        const row = rows[0];
        const at = now();

        if (!row || row.enabled === false || (row.expiresAt && row.expiresAt.getTime() <= at)) {
            invalid.set(hash, { kind: 'invalid' }, at + invalidMs);

            return { kind: 'invalid' };
        }

        const verdict: ValidKey = {
            kind: 'valid',
            keyId: row.id,
            accountId: row.referenceId,
            rateLimit: ownLimit(row.apiRateLimit),
            dailyLimit: ownLimit(row.dailyLimit),
            expiresAt: row.expiresAt,
        };

        valid.set(hash, verdict, Math.min(at + validMs, row.expiresAt?.getTime() ?? Infinity));
        touch(row.id);

        return verdict;
    };

    const cached = (hash: string): KeyVerdict | undefined => valid.get(hash) ?? invalid.get(hash);

    return {
        cacheSize: () => valid.size() + invalid.size(),
        async cachedValid(key) {
            if (!hasKeyPrefix(key)) {
                return undefined;
            }

            const verdict = valid.get(await defaultKeyHasher(key));

            return verdict?.kind === 'valid' ? verdict : undefined;
        },
        async verify(key) {
            // Nothing of ours is shaped otherwise, so there is nothing to look up.
            if (!hasKeyPrefix(key)) {
                return { kind: 'invalid' };
            }

            const hash = await defaultKeyHasher(key);
            const known = cached(hash);

            if (known) {
                return known;
            }

            let pending = reading.get(hash);

            if (!pending) {
                pending = read(hash).finally(() => reading.delete(hash));
                reading.set(hash, pending);
            }

            return pending;
        },
    };
};
