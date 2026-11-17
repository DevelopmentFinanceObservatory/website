'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { keyService } from '@/lib/apiKeys/server';
import { getUser } from '@/lib/auth/session';

import type { CreatedState, DeleteState } from '@/components/organisms/ApiKeys/state';

// Server actions are POSTs anyone can send, so each one reads the session
// itself. Next.js also refuses one whose Origin is not the page's host, which
// is the CSRF check. An account only ever acts on its own keys: the owner is
// the session's user and nothing from the form, and a delete goes through the
// plugin on the request's own session.

const PATH = '/account/api-keys';

const SIGNED_OUT = 'Your session has ended. Sign in again.';
const NOT_FOUND = 'That key was not found.';

const REFUSALS = {
    label_invalid: 'Give the key a label of 1 to 32 characters.',
    cap_reached: 'This account has as many keys as it may hold. Delete one to make another.',
    no_such_account: 'That account was not found.',
} as const;

/** Creates a key for the signed-in user and answers with it, once. */
export const createKey = async (
    _previous: CreatedState,
    formData: FormData,
): Promise<CreatedState> => {
    const user = await getUser();

    if (!user) {
        return { error: SIGNED_OUT };
    }

    const result = await keyService.createOwn(user.id, formData.get('label'));

    if (!result.ok) {
        return { error: REFUSALS[result.reason] };
    }

    revalidatePath(PATH);

    return { created: { id: result.id, key: result.key } };
};

/** Deletes one of the signed-in user's keys. Another account's is "not found". */
export const deleteKey = async (
    _previous: DeleteState,
    formData: FormData,
): Promise<DeleteState> => {
    const user = await getUser();
    const keyId = formData.get('keyId');

    if (!user) {
        return { error: SIGNED_OUT };
    }

    if (typeof keyId !== 'string') {
        return { error: NOT_FOUND };
    }

    const result = await keyService.deleteOwn({ userId: user.id, headers: await headers() }, keyId);

    if (result !== 'deleted') {
        return { error: result === 'signed_out' ? SIGNED_OUT : NOT_FOUND };
    }

    revalidatePath(PATH);

    return { error: null };
};
