'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { keyService, requireAdmin } from '@/lib/apiKeys/server';
import { parseEmailInput, parseLimitInput } from '@/lib/apiKeys/settings';

import type { CreatedState, DeleteState } from '@/components/organisms/ApiKeys/state';

/*
 * Admin actions (proof of concept). A server action is a POST anyone can
 * send, so each one runs the admin gate first (requireAdmin: everyone not
 * on ADMIN_EMAILS gets the 404 page) and the page's own check is no
 * substitute. Next.js refuses one whose Origin is not the page's host, which
 * is the CSRF check. Each mutation logs one structured line through the
 * service: the actor's email, the action, the key id and the account id,
 * never a key.
 */

const PATH = '/admin/api-keys';

const REFUSALS = {
    label_invalid: 'Give the key a label of 1 to 32 characters.',
    cap_reached: 'That account holds as many keys as it may.',
    no_such_account: 'No account has that email.',
} as const;

/** Creates a key for the account with the given email and answers with it, once. */
export const adminCreateKey = async (
    _previous: CreatedState,
    formData: FormData,
): Promise<CreatedState> => {
    const admin = await requireAdmin();
    const email = parseEmailInput(formData.get('email'));

    if (!email) {
        return { error: 'Enter the account’s email address.' };
    }

    const result = await keyService.adminCreate(admin.email, email, formData.get('label'));

    if (!result.ok) {
        return { error: REFUSALS[result.reason] };
    }

    revalidatePath(PATH);

    return { created: { id: result.id, key: result.key } };
};

/** Deletes any key. */
export const adminDeleteKey = async (
    _previous: DeleteState,
    formData: FormData,
): Promise<DeleteState> => {
    const admin = await requireAdmin();
    const keyId = formData.get('keyId');

    if (typeof keyId !== 'string' || !(await keyService.adminDelete(admin.email, keyId))) {
        return { error: 'That key was not found.' };
    }

    revalidatePath(PATH);

    return { error: null };
};

/** Sets or clears an account's limit, then returns to the page with what happened in `?limit=`. */
export const adminSetLimit = async (formData: FormData): Promise<void> => {
    const admin = await requireAdmin();
    const email = parseEmailInput(formData.get('email'));
    const limit = parseLimitInput(formData.get('limit'));

    if (!email || !limit.ok) {
        redirect(`${PATH}?limit=invalid`);
    }

    const done = await keyService.adminSetLimit(admin.email, email, limit.limit);

    revalidatePath(PATH);
    redirect(`${PATH}?limit=${done ? (limit.limit === null ? 'cleared' : 'saved') : 'no-account'}`);
};
