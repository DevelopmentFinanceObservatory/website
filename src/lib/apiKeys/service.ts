/**
 * What the API key pages do with keys: a signed-in user's own (src/app/(site)/account/api-keys) and
 * an operator's over every account (src/app/(site)/admin/api-keys). The plugin's own HTTP
 * endpoints for keys stay closed (src/lib/auth/apiKeyOptions), so this is the
 * only way in. It decides nothing about who may call: the caller has already
 * checked the session or the admin gate (adminGate) and passes the user id or
 * the actor in. A user's functions take the user id and never a key's owner,
 * so a key is found only under its owner.
 *
 * Rules, from docs/design/api-keys.md ("How It Would Fit"):
 *   - the prefix is ours (`dfo_live_`), never taken from a request
 *   - a key's owner is the id passed in; expiry, metadata, permissions and
 *     limits are never passed on, so every key has the plugin's defaults and
 *     the account's own limit (user.api_rate_limit) is the one limit
 *   - revoking deletes the row: a disabled key could be switched back on
 *   - the full key is returned by the create call and nowhere else. Only its
 *     hash is stored, and neither the key nor the hash is logged
 *
 * Kept apart from the Next.js code, with the auth instance and database
 * passed in, so `node --test` can drive it on a test database.
 */
import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { apikey, user } from '../../../db/schema.ts';
import { API_KEY_PREFIX } from '../auth/apiKeyOptions.ts';
import { parseLabel } from './settings.ts';

/** The parts of the Better Auth instance this module uses. */
export type KeyAuth = {
    api: {
        createApiKey(args: {
            body: { userId: string; name?: string; prefix?: string };
        }): Promise<{ id: string; key: string }>;
    };
    $context: PromiseLike<{
        internalAdapter: {
            updateUser(id: string, data: { apiRateLimit: number | null }): Promise<unknown>;
        };
    }>;
};

export type KeyDb = Pick<NodePgDatabase, 'select' | 'delete'>;

export type KeyServiceOptions = {
    auth: KeyAuth;
    db: KeyDb;
    /** How many keys an account may hold; read per call so a change needs no restart. */
    maxPerAccount: () => number;
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
    | { ok: false; reason: 'label_invalid' | 'cap_reached' | 'no_such_account' };

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

/** `value` as a LIKE pattern's literal text. */
const likeLiteral = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export const createKeyService = ({
    auth,
    db,
    maxPerAccount,
    log = defaultLog,
}: KeyServiceOptions) => {
    const mint = (userId: string, label: string) =>
        // The prefix is passed even though the plugin's default is the same,
        // so no later change to the plugin options can open it to a request.
        auth.api.createApiKey({ body: { userId, name: label, prefix: API_KEY_PREFIX } });

    const userIdByEmail = async (email: string): Promise<string | null> => {
        const [row] = await db
            .select({ id: user.id })
            .from(user)
            .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`)
            .limit(1);

        return row?.id ?? null;
    };

    return {
        /** The user's keys, newest first. */
        async listOwn(userId: string): Promise<OwnKey[]> {
            return db
                .select(ownKeyColumns)
                .from(apikey)
                .where(eq(apikey.referenceId, userId))
                .orderBy(desc(apikey.createdAt));
        },

        /**
         * A new key for the user, unless the label is not usable or the
         * account holds its cap. The full key is in this result and nowhere
         * after it.
         */
        async createOwn(userId: string, label: unknown): Promise<CreateResult> {
            const name = parseLabel(label);

            if (!name) {
                return { ok: false, reason: 'label_invalid' };
            }

            const [held] = await db
                .select({ n: count() })
                .from(apikey)
                .where(eq(apikey.referenceId, userId));

            if ((held?.n ?? 0) >= maxPerAccount()) {
                return { ok: false, reason: 'cap_reached' };
            }

            const created = await mint(userId, name);

            log({ message: 'api key created', by: 'owner', keyId: created.id, accountId: userId });

            return { ok: true, id: created.id, key: created.key };
        },

        /** Deletes the user's key. False when it is not theirs, or not there. */
        async deleteOwn(userId: string, keyId: string): Promise<boolean> {
            const gone = await db
                .delete(apikey)
                .where(and(eq(apikey.id, keyId), eq(apikey.referenceId, userId)))
                .returning({ id: apikey.id });

            if (gone.length === 0) {
                return false;
            }

            log({ message: 'api key deleted', by: 'owner', keyId, accountId: userId });

            return true;
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
                .where(needle ? ilike(user.email, `%${likeLiteral(needle)}%`) : undefined)
                .orderBy(desc(apikey.createdAt))
                .limit(ADMIN_LIST_LIMIT);

            return rows;
        },

        /** A key for the account with this email. Not held to the account cap. */
        async adminCreate(actor: string, email: string, label: unknown): Promise<CreateResult> {
            const name = parseLabel(label);

            if (!name) {
                return { ok: false, reason: 'label_invalid' };
            }

            const accountId = await userIdByEmail(email);

            if (!accountId) {
                return { ok: false, reason: 'no_such_account' };
            }

            const created = await mint(accountId, name);

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
