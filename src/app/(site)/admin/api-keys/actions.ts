'use server';

import { revalidatePath } from 'next/cache';

import { keyService, requireAdmin } from '@/lib/apiKeys/server';
import {
    limitNotice,
    parseDailyLimitInput,
    parseEmailInput,
    parseLimitInput,
} from '@/lib/apiKeys/settings';

import type {
    AdminAccountKeys,
    AdminDoneResult,
    AdminKeyResult,
} from '@/components/organisms/ApiKeys/AdminState';

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
    name_taken: 'That account already has a key with that name.',
    cap_reached: 'That account holds as many keys as it may.',
    no_such_account: 'No account has that email.',
    keys_unavailable:
        'No key can be made while API_KEY_TAG_SECRETS is not set.',
    not_found: 'That key was not found.',
} as const;

const LIMIT_INVALID = 'Enter a positive whole number, or leave it empty for the default.';

/** One account's keys and daily quota, with today's API usage; null when the id is not a string or the read fails. */
export const adminLoadKeys = async (userId: unknown): Promise<AdminAccountKeys | null> => {
    await requireAdmin();

    if (typeof userId !== 'string' || !userId) {
        return null;
    }

    try {
        const [keys, quota] = await Promise.all([
            keyService.adminUserKeys(userId),
            keyService.accountQuota(userId),
        ]);

        return { keys, quota };
    } catch (error) {
        console.error("admin: an account's keys did not load", error);

        return null;
    }
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

/** Sets a key's own daily cap, or clears it (empty text) so the key spends only its account's quota. */
export const adminSetKeyLimit = async (
    keyId: unknown,
    limit: unknown,
): Promise<AdminDoneResult> => {
    const admin = await requireAdmin();
    const parsed = parseDailyLimitInput(limit);

    if (typeof keyId !== 'string' || !parsed.ok) {
        return { ok: false, error: LIMIT_INVALID };
    }

    if (!(await keyService.adminSetKeyDailyLimit(admin.email, keyId, parsed.limit))) {
        return { ok: false, error: REFUSALS.not_found };
    }

    revalidatePath(PATH);

    return { ok: true };
};

/** Sets an account's API call count for today back to 0, its keys' caps included. */
export const adminResetUsage = async (userId: unknown): Promise<AdminDoneResult> => {
    const admin = await requireAdmin();

    if (typeof userId !== 'string' || !(await keyService.adminResetUsage(admin.email, userId))) {
        return { ok: false, error: REFUSALS.no_such_account };
    }

    revalidatePath(PATH);

    return { ok: true };
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

/** Sets or clears an account's daily API quota (empty text clears it). */
export const adminSetDailyLimit = async (
    email: unknown,
    limit: unknown,
): Promise<AdminDoneResult> => {
    const admin = await requireAdmin();
    const address = parseEmailInput(email);
    const parsed = parseDailyLimitInput(limit);

    if (!address || !parsed.ok) {
        return { ok: false, error: LIMIT_INVALID };
    }

    const done = await keyService.adminSetDailyLimit(admin.email, address, parsed.limit);

    revalidatePath(PATH);

    return done
        ? { ok: true, message: limitNotice(parsed.limit === null ? 'cleared' : 'saved') }
        : { ok: false, error: limitNotice('no-account') ?? 'No account has that email.' };
};
