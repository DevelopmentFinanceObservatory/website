'use server';

import { revalidatePath } from 'next/cache';

import { keyService, requireAdmin } from '@/lib/apiKeys/server';
import {
    limitNotice,
    parseDailyLimitInput,
    parseEmailInput,
    parseLimitInput,
} from '@/lib/apiKeys/settings';

import type { AdminDoneResult, AdminKeyResult } from '@/components/organisms/ApiKeys/AdminState';
import type { AdminKey } from '@/lib/apiKeys/service';

/*
 * Admin actions. A server action is a POST anyone can send, so each one runs
 * the admin gate first (requireAdmin: everyone not on ADMIN_EMAILS gets the
 * 404 page) and the page's own check is no substitute. Arguments arrive from
 * the network, so each is narrowed before use. Next.js refuses an action
 * whose Origin is not the page's host, which is the CSRF check. Each
 * mutation logs one structured line through the service: the actor's email,
 * the action, the key id and the account id, never a key.
 */

const PATH = '/admin/api-keys';

const REFUSALS = {
    label_invalid: 'Give the key a name of 1 to 32 characters.',
    cap_reached: 'That account holds as many keys as it may.',
    no_such_account: 'No account has that email.',
    not_found: 'That key was not found.',
} as const;

const LIMIT_INVALID = 'Enter a positive whole number, or leave it empty for the default.';

/** One account's keys, with today's MCP usage; null when the id is not a string. */
export const adminLoadKeys = async (userId: unknown): Promise<AdminKey[] | null> => {
    await requireAdmin();

    return typeof userId === 'string' && userId ? keyService.adminUserKeys(userId) : null;
};

/** Creates a key for the account with the given email and answers with it, once. */
export const adminCreateKey = async (email: unknown, label: unknown): Promise<AdminKeyResult> => {
    const admin = await requireAdmin();
    const address = parseEmailInput(email);

    if (!address) {
        return { ok: false, error: 'That account has no valid email address.' };
    }

    const result = await keyService.adminCreate(admin.email, address, label);

    if (!result.ok) {
        return { ok: false, error: REFUSALS[result.reason] };
    }

    revalidatePath(PATH);

    return { ok: true, created: { id: result.id, key: result.key } };
};

/** Deletes any key. */
export const adminDeleteKey = async (keyId: unknown): Promise<AdminDoneResult> => {
    const admin = await requireAdmin();

    if (typeof keyId !== 'string' || !(await keyService.adminDelete(admin.email, keyId))) {
        return { ok: false, error: REFUSALS.not_found };
    }

    revalidatePath(PATH);

    return { ok: true };
};

/** Sets a key's own daily limit, or clears it (empty text) to put the key on the default. */
export const adminSetKeyLimit = async (
    keyId: unknown,
    limit: unknown,
): Promise<AdminDoneResult> => {
    const admin = await requireAdmin();
    const parsed = parseDailyLimitInput(limit);

    if (typeof keyId !== 'string' || !parsed.ok) {
        return { ok: false, error: LIMIT_INVALID };
    }

    return (await keyService.adminSetKeyDailyLimit(admin.email, keyId, parsed.limit))
        ? { ok: true }
        : { ok: false, error: REFUSALS.not_found };
};

/** Sets a key's MCP call count for today back to 0. */
export const adminResetKeyUsage = async (keyId: unknown): Promise<AdminDoneResult> => {
    const admin = await requireAdmin();

    return typeof keyId === 'string' && (await keyService.adminResetKeyUsage(admin.email, keyId))
        ? { ok: true }
        : { ok: false, error: REFUSALS.not_found };
};

/** Sets or clears an account's per-minute limit (empty text clears it). */
export const adminSetLimit = async (email: unknown, limit: unknown): Promise<AdminDoneResult> => {
    const admin = await requireAdmin();
    const address = parseEmailInput(email);
    const parsed = parseLimitInput(limit);

    if (!address || !parsed.ok) {
        return { ok: false, error: LIMIT_INVALID };
    }

    const done = await keyService.adminSetLimit(admin.email, address, parsed.limit);

    revalidatePath(PATH);

    return done
        ? { ok: true, message: limitNotice(parsed.limit === null ? 'cleared' : 'saved') }
        : { ok: false, error: limitNotice('no-account') ?? 'No account has that email.' };
};
