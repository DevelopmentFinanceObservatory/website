/**
 * What the API key screens do with keys: a signed-in user's own, in the account panel
 * (src/lib/apiKeys/account, behind src/app/api/account/api-keys), and an operator's over every account
 * (src/app/(site)/admin/api-keys). The plugin's own HTTP
 * endpoints for keys stay closed (src/lib/auth/apiKeyOptions), so this is the
 * only way in.
 *
 * A user's own keys are listed and deleted by the plugin's server methods
 * (`listApiKeys`, `deleteApiKey`) on the request's session, so the plugin
 * decides which keys are whose, and checks a ban on delete. Creating takes
 * the session's user id, since the plugin refuses a create with a session
 * unless every server-only field is left unset. The operator functions read
 * and delete across accounts, which the plugin offers only to a key's owner,
 * so they query the plugin's table themselves; the caller has passed the
 * admin gate and passes the actor in.
 *
 * Rules, from docs/design/api-keys.md ("How It Would Fit"):
 *   - the prefix is ours (`dfo_k_`), never taken from a request
 *   - a key's owner is the id passed in; expiry, metadata, permissions and
 *     limits are never passed on, so every key has the plugin's defaults. The
 *     account's own limit (user.api_rate_limit) is the per-minute limit, and
 *     the key's `daily_limit` column, set only by an operator, is its daily
 *     API quota (src/lib/proxy/access)
 *   - revoking deletes the row: a disabled key could be switched back on
 *   - the full key is returned by the create call and nowhere else. Only its
 *     hash is stored, and neither the key nor the hash is logged
 *
 * Kept apart from the Next.js code, with the auth instance and database
 * passed in, so `node --test` can drive it on a test database.
 */
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { apikey, limitCounter, user } from '../../../db/schema.ts';
import { API_KEY_PREFIX } from '../auth/apiKeyOptions.ts';
import { likeContaining } from '../likePattern.ts';
import { dailyCounterKey, dailyUsage } from '../proxy/limitCounter.ts';
import { parseLabel } from './settings.ts';

/** The parts of the Better Auth instance this module uses. */
export type KeyAuth = {
    api: {
        createApiKey(args: {
            body: { userId: string; name?: string; prefix?: string };
        }): Promise<{ id: string; key: string }>;
        listApiKeys(args: {
            headers: Headers;
            query?: { sortBy?: string; sortDirection?: 'asc' | 'desc' };
        }): Promise<{ apiKeys: PluginKey[] }>;
        deleteApiKey(args: { headers: Headers; body: { keyId: string } }): Promise<unknown>;
    };
    $context: PromiseLike<{
        internalAdapter: {
            updateUser(id: string, data: { apiRateLimit: number | null }): Promise<unknown>;
        };
    }>;
};

/** A key as the plugin lists it; only these fields are read. */
type PluginKey = {
    id: string;
    name: string | null;
    start: string | null;
    createdAt: Date;
    lastRequest: Date | null;
};

/** The signed-in request a user's own key functions act for. */
export type Owner = { userId: string; headers: Headers };

export type DeleteResult = 'deleted' | 'not_found' | 'signed_out';

export type KeyDb = Pick<NodePgDatabase, 'select' | 'insert' | 'update' | 'delete'>;

export type KeyServiceOptions = {
    auth: KeyAuth;
    db: KeyDb;
    /** How many keys an account may hold; read per call so a change needs no restart. */
    maxPerAccount: () => number;
    /** A key's daily API calls when it sets none of its own; read per call. */
    defaultDailyLimit: () => number;
    /** One structured line per mutation. Never receives a key or a hash. */
    log?: (line: Record<string, unknown>) => void;
};

/** A key as its owner sees it: never the key or its hash. */
export type OwnKey = {
    id: string;
    name: string | null;
    start: string | null;
    createdAt: Date;
    // When the proxy last looked the key up (keyVerifier records it on a
    // cache miss), so up to about a minute behind the last call. Null until
    // the key is first used.
    lastRequest: Date | null;
    // The key's daily API calls: its own, else the deployment default.
    dailyLimit: number;
    // The key's own daily limit, null when it has none.
    customDailyLimit: number | null;
    // API calls counted against the key in the current UTC day, refused
    // calls included.
    usedToday: number;
};

/** A key and its account, as an operator sees it. */
export type AdminKey = OwnKey & {
    ownerId: string;
    ownerEmail: string;
    // The account's own limit, null for the default.
    accountLimit: number | null;
};

export type CreateResult =
    | { ok: true; id: string; key: string }
    | { ok: false; reason: 'label_invalid' | 'name_taken' | 'cap_reached' | 'no_such_account' };

/** An account as an operator sees it in the user list. */
export type AdminUser = {
    id: string;
    email: string;
    name: string | null;
    createdAt: Date;
    // Keys that are enabled and not expired.
    activeKeys: number;
    // The account's own per-minute limit, null for the default.
    accountLimit: number | null;
};

export const defaultLog = (line: Record<string, unknown>): void => {
    console.log(JSON.stringify({ severity: 'INFO', ...line }));
};

const ownKeyColumns = {
    id: apikey.id,
    name: apikey.name,
    start: apikey.start,
    createdAt: apikey.createdAt,
    lastRequest: apikey.lastRequest,
};

// The most keys one operator list returns.
const ADMIN_LIST_LIMIT = 500;

const ADMIN_USERS_DEFAULT_LIMIT = 50;
const ADMIN_USERS_MAX_LIMIT = 500;

/** A positive whole number is a key's own daily limit; anything else is the default. */
const ownDaily = (value: number | null): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null;

/** The HTTP status of a Better Auth APIError, or undefined for any other throw. */
const statusOf = (error: unknown): number | undefined => {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;

    return typeof status === 'number' ? status : undefined;
};

export const createKeyService = ({
    auth,
    db,
    maxPerAccount,
    defaultDailyLimit,
    log = defaultLog,
}: KeyServiceOptions) => {
    const mint = (userId: string, label: string | null) =>
        // The prefix is passed even though the plugin's default is the same,
        // so no later change to the plugin options can open it to a request.
        auth.api.createApiKey({
            body: { userId, name: label ?? undefined, prefix: API_KEY_PREFIX },
        });

    const userIdByEmail = async (email: string): Promise<string | null> => {
        const [row] = await db
            .select({ id: user.id })
            .from(user)
            .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`)
            .limit(1);

        return row?.id ?? null;
    };

    // Whether the account holds a key named `name`, compared without regard to
    // case. `except` leaves one key out of the search.
    const nameTaken = async (accountId: string, name: string): Promise<boolean> => {
        const [row] = await db
            .select({ id: apikey.id })
            .from(apikey)
            .where(
                and(
                    eq(apikey.referenceId, accountId),
                    sql`lower(${apikey.name}) = ${name.toLowerCase()}`,
                ),
            )
            .limit(1);

        return row !== undefined;
    };

    // Creates in parallel can all pass `nameTaken`, as they can the cap, so
    // after the insert the oldest key of each name stands and `keyId` is
    // taken back when an older key holds its name. True when it was.
    const takeBackDuplicate = async (
        accountId: string,
        keyId: string,
        name: string,
    ): Promise<boolean> => {
        const [first] = await db
            .select({ id: apikey.id })
            .from(apikey)
            .where(
                and(
                    eq(apikey.referenceId, accountId),
                    sql`lower(${apikey.name}) = ${name.toLowerCase()}`,
                ),
            )
            .orderBy(asc(apikey.createdAt), asc(apikey.id))
            .limit(1);

        if (!first || first.id === keyId) {
            return false;
        }

        await db.delete(apikey).where(and(eq(apikey.id, keyId), eq(apikey.referenceId, accountId)));

        return true;
    };

    // The daily quota and today's count of each key, which the plugin's own
    // list knows nothing of.
    const withQuota = async <T extends { id: string }>(
        keys: T[],
    ): Promise<
        (T & { dailyLimit: number; customDailyLimit: number | null; usedToday: number })[]
    > => {
        if (keys.length === 0) {
            return [];
        }

        const ids = keys.map(({ id }) => id);
        const [limits, used] = await Promise.all([
            db
                .select({ id: apikey.id, custom: apikey.dailyLimit })
                .from(apikey)
                .where(inArray(apikey.id, ids)),
            dailyUsage(db, ids),
        ]);
        const custom = new Map(limits.map(({ id, custom }) => [id, ownDaily(custom)]));

        return keys.map((key) => {
            const own = custom.get(key.id) ?? null;

            return {
                ...key,
                dailyLimit: own ?? defaultDailyLimit(),
                customDailyLimit: own,
                usedToday: used.get(key.id) ?? 0,
            };
        });
    };

    return {
        /** The session user's keys, newest first, as the plugin lists them. */
        async listOwn({ headers }: Owner): Promise<OwnKey[]> {
            const { apiKeys } = await auth.api.listApiKeys({
                headers,
                query: { sortBy: 'createdAt', sortDirection: 'desc' },
            });

            return withQuota(
                apiKeys.map(({ id, name, start, createdAt, lastRequest }) => ({
                    id,
                    name,
                    start,
                    createdAt: new Date(createdAt),
                    lastRequest: lastRequest ? new Date(lastRequest) : null,
                })),
            );
        },

        /**
         * A new key for the user, unless the label is not usable, another of
         * the account's keys has that name (without regard to case), or the
         * account holds its cap. The full key is in this result and nowhere
         * after it.
         */
        async createOwn(userId: string, label: unknown): Promise<CreateResult> {
            const name = parseLabel(label);

            if (!name) {
                return { ok: false, reason: 'label_invalid' };
            }

            if (await nameTaken(userId, name)) {
                return { ok: false, reason: 'name_taken' };
            }

            const [held] = await db
                .select({ n: count() })
                .from(apikey)
                .where(eq(apikey.referenceId, userId));

            if ((held?.n ?? 0) >= maxPerAccount()) {
                return { ok: false, reason: 'cap_reached' };
            }

            const created = await mint(userId, name);

            // The count and the insert are apart, so creates in parallel can
            // all pass the count. The account's oldest `max` keys stand, and a
            // new key past them is taken back. A lock would not do: the
            // plugin's insert takes a second connection from the same pool.
            const max = maxPerAccount();
            const standing = await db
                .select({ id: apikey.id })
                .from(apikey)
                .where(eq(apikey.referenceId, userId))
                .orderBy(asc(apikey.createdAt), asc(apikey.id))
                .limit(max);

            if (!standing.some(({ id }) => id === created.id)) {
                await db
                    .delete(apikey)
                    .where(and(eq(apikey.id, created.id), eq(apikey.referenceId, userId)));

                return { ok: false, reason: 'cap_reached' };
            }

            if (await takeBackDuplicate(userId, created.id, name)) {
                return { ok: false, reason: 'name_taken' };
            }

            log({ message: 'api key created', by: 'owner', keyId: created.id, accountId: userId });

            return { ok: true, id: created.id, key: created.key };
        },

        /**
         * Deletes one of the session user's keys through the plugin, which
         * finds it only under its owner and refuses a banned user.
         */
        async deleteOwn({ userId, headers }: Owner, keyId: string): Promise<DeleteResult> {
            try {
                await auth.api.deleteApiKey({ headers, body: { keyId } });
            } catch (error) {
                const status = statusOf(error);

                if (status === 404) {
                    return 'not_found';
                }

                if (status === 401) {
                    return 'signed_out';
                }

                throw error;
            }

            log({ message: 'api key deleted', by: 'owner', keyId, accountId: userId });

            return 'deleted';
        },

        /** The account's own limit, or null for the default. */
        async accountLimit(userId: string): Promise<number | null> {
            const [row] = await db
                .select({ limit: user.apiRateLimit })
                .from(user)
                .where(eq(user.id, userId))
                .limit(1);

            return row?.limit ?? null;
        },

        // Operator functions. The caller has passed the admin gate.

        /** Every key with its owner, newest first, optionally of the accounts whose email contains `email`. */
        async adminList(email?: string): Promise<AdminKey[]> {
            const needle = email?.trim();
            const rows = await db
                .select({
                    ...ownKeyColumns,
                    ownerId: user.id,
                    ownerEmail: user.email,
                    accountLimit: user.apiRateLimit,
                })
                .from(apikey)
                .innerJoin(user, eq(user.id, apikey.referenceId))
                .where(needle ? ilike(user.email, likeContaining(needle)) : undefined)
                .orderBy(desc(apikey.createdAt))
                .limit(ADMIN_LIST_LIMIT);

            return withQuota(rows);
        },

        /**
         * One page of accounts, newest first. `total` counts every account and
         * `matched` those whose email contains `query` (case-insensitive,
         * wildcards literal); `users` is the page of the matched ones.
         */
        async adminListUsers({
            query,
            offset = 0,
            limit = ADMIN_USERS_DEFAULT_LIMIT,
        }: {
            query?: string;
            offset?: number;
            limit?: number;
        } = {}): Promise<{ total: number; matched: number; users: AdminUser[] }> {
            const needle = query?.trim();
            const where = needle ? ilike(user.email, likeContaining(needle)) : undefined;
            const [[all], [found], page] = await Promise.all([
                db.select({ n: count() }).from(user),
                db.select({ n: count() }).from(user).where(where),
                db
                    .select({
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        createdAt: user.createdAt,
                        accountLimit: user.apiRateLimit,
                    })
                    .from(user)
                    .where(where)
                    .orderBy(desc(user.createdAt), desc(user.id))
                    .offset(Math.max(0, Math.trunc(offset)))
                    .limit(Math.min(ADMIN_USERS_MAX_LIMIT, Math.max(1, Math.trunc(limit)))),
            ]);
            const active =
                page.length === 0
                    ? []
                    : await db
                          .select({ accountId: apikey.referenceId, n: count() })
                          .from(apikey)
                          .where(
                              and(
                                  inArray(
                                      apikey.referenceId,
                                      page.map(({ id }) => id),
                                  ),
                                  or(isNull(apikey.enabled), eq(apikey.enabled, true)),
                                  or(isNull(apikey.expiresAt), sql`${apikey.expiresAt} > now()`),
                              ),
                          )
                          .groupBy(apikey.referenceId);
            const keys = new Map(active.map(({ accountId, n }) => [accountId, n]));

            return {
                total: all?.n ?? 0,
                matched: found?.n ?? 0,
                users: page.map((row) => ({ ...row, activeKeys: keys.get(row.id) ?? 0 })),
            };
        },

        /** Every key of one account, newest first, with the owner. */
        async adminUserKeys(userId: string): Promise<AdminKey[]> {
            const rows = await db
                .select({
                    ...ownKeyColumns,
                    ownerId: user.id,
                    ownerEmail: user.email,
                    accountLimit: user.apiRateLimit,
                })
                .from(apikey)
                .innerJoin(user, eq(user.id, apikey.referenceId))
                .where(eq(apikey.referenceId, userId))
                .orderBy(desc(apikey.createdAt), desc(apikey.id))
                .limit(ADMIN_LIST_LIMIT);

            return withQuota(rows);
        },

        /**
         * A key for the account with this email, unless another of its keys
         * has that name. Not held to the account cap.
         */
        async adminCreate(actor: string, email: string, label: unknown): Promise<CreateResult> {
            const name = parseLabel(label);

            if (!name) {
                return { ok: false, reason: 'label_invalid' };
            }

            const accountId = await userIdByEmail(email);

            if (!accountId) {
                return { ok: false, reason: 'no_such_account' };
            }

            if (await nameTaken(accountId, name)) {
                return { ok: false, reason: 'name_taken' };
            }

            const created = await mint(accountId, name);

            if (await takeBackDuplicate(accountId, created.id, name)) {
                return { ok: false, reason: 'name_taken' };
            }

            log({
                message: 'api key admin',
                action: 'create',
                actor,
                keyId: created.id,
                accountId,
            });

            return { ok: true, id: created.id, key: created.key };
        },

        /** Deletes any key. False when there is none by that id. */
        async adminDelete(actor: string, keyId: string): Promise<boolean> {
            const gone = await db
                .delete(apikey)
                .where(eq(apikey.id, keyId))
                .returning({ id: apikey.id, accountId: apikey.referenceId });

            if (gone.length === 0) {
                return false;
            }

            log({
                message: 'api key admin',
                action: 'delete',
                actor,
                keyId,
                accountId: gone[0]!.accountId,
            });

            return true;
        },

        /**
         * Sets the daily API limit of one key, or clears it with null so the
         * deployment default applies. False when there is no such key. The
         * proxy's key cache holds the old limit for up to a minute.
         */
        async adminSetKeyDailyLimit(
            actor: string,
            keyId: string,
            limit: number | null,
        ): Promise<boolean> {
            const [row] = await db
                .update(apikey)
                .set({ dailyLimit: limit, updatedAt: new Date() })
                .where(eq(apikey.id, keyId))
                .returning({ accountId: apikey.referenceId });

            if (!row) {
                return false;
            }

            log({
                message: 'api key admin',
                action: limit === null ? 'clear-daily-limit' : 'set-daily-limit',
                actor,
                keyId,
                accountId: row.accountId,
                limit,
            });

            return true;
        },

        /**
         * Sets a key's API call count for the current UTC day back to 0, so a key
         * that used its daily quota works again at once. False when there is
         * no such key.
         */
        async adminResetKeyUsage(actor: string, keyId: string): Promise<boolean> {
            const [row] = await db
                .select({ accountId: apikey.referenceId })
                .from(apikey)
                .where(eq(apikey.id, keyId))
                .limit(1);

            if (!row) {
                return false;
            }

            await db.delete(limitCounter).where(eq(limitCounter.key, dailyCounterKey(keyId)));

            log({
                message: 'api key admin',
                action: 'reset-usage',
                actor,
                keyId,
                accountId: row.accountId,
            });

            return true;
        },

        /**
         * Sets the limit of the account with this email, or clears it with
         * null so the deployment default applies. False when there is no
         * such account. The proxy's key cache holds the old limit for up to a
         * minute.
         */
        async adminSetLimit(actor: string, email: string, limit: number | null): Promise<boolean> {
            const accountId = await userIdByEmail(email);

            if (!accountId) {
                return false;
            }

            const context = await auth.$context;

            await context.internalAdapter.updateUser(accountId, { apiRateLimit: limit });
            log({
                message: 'api key admin',
                action: limit === null ? 'clear-limit' : 'set-limit',
                actor,
                accountId,
                limit,
            });

            return true;
        },
    };
};

export type KeyService = ReturnType<typeof createKeyService>;
