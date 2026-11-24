import 'server-only';

import { getUser } from '@/lib/auth/session';
import { keysEnabled } from '@/lib/proxy/forward';
import { problem, requestInvalidProblem } from '@/lib/proxy/problem';

import type { ApiKeysData, KeyView } from '@/components/organisms/ApiKeys/state';
import { keyService } from './server';
import { refuseCrossOrigin } from './sameOrigin';
import { maxKeysPerAccount } from './settings';

// The handlers behind /api/account/api-keys, which the account panel calls
// with fetch. A route handler is a request anyone can send, so each call
// reads the session itself, and a mutating one first checks that it came
// from a page of this site (./sameOrigin). An account only ever acts on its
// own keys: the owner is the session's user and nothing from the caller, and
// a delete goes through the plugin on the request's own session.
// Every answer, a refusal included, is `no-store`, since it holds a key or
// names an account's keys. A refusal is a problem document whose `detail` is
// the message the panel shows.

const NO_STORE = { 'Cache-Control': 'no-store' };

const SIGNED_OUT = 'Your session has ended. Sign in again.';
const NOT_FOUND = 'That key was not found.';

const refuse = (status: 401 | 403 | 404, code: string, detail: string): Response =>
    problem({ status, code, detail, retryable: false, headers: NO_STORE });

const signedOut = () => refuse(401, 'unauthorized', SIGNED_OUT);
const notFound = () => refuse(404, 'not_found', NOT_FOUND);

const REFUSALS = {
    label_invalid: () =>
        problem({
            status: 400,
            code: 'request_invalid',
            detail: 'Give the key a name of 1 to 32 characters.',
            retryable: false,
            extra: { pointer: '/label' },
            headers: NO_STORE,
        }),
    name_taken: () =>
        problem({
            status: 400,
            code: 'key_name_taken',
            detail: 'You already have a key with that name. Choose another.',
            retryable: false,
            extra: { pointer: '/label' },
            headers: NO_STORE,
        }),
    cap_reached: () =>
        refuse(
            403,
            'key_cap_reached',
            'You have as many keys as you may hold. Delete one to make another.',
        ),
    no_such_account: () => refuse(404, 'not_found', 'That account was not found.'),
} as const;

const issued = (key: string) => Response.json({ key }, { headers: NO_STORE });

/** The signed-in user's name, email, daily quota, keys and key cap. */
export const listKeys = async (request: Request): Promise<Response> => {
    const user = await getUser();

    if (!user) {
        return signedOut();
    }

    const [keys, quota] = await Promise.all([
        keyService.listOwn({ userId: user.id, headers: request.headers }),
        keyService.accountQuota(user.id),
    ]);
    const data: ApiKeysData = {
        user: { name: user.name, email: user.email },
        quota: { dailyLimit: quota.dailyLimit, usedToday: quota.usedToday },
        keys: keys.map((key): KeyView => ({
            id: key.id,
            name: key.name,
            start: key.start,
            tail: key.tail,
            createdAt: key.createdAt.toISOString(),
            lastRequest: key.lastRequest?.toISOString() ?? null,
            dailyCap: key.dailyCap,
            capUsedToday: key.capUsedToday,
        })),
        maxKeys: maxKeysPerAccount(process.env.API_KEYS_MAX_PER_ACCOUNT),
        keysEnabled: keysEnabled(),
    };

    return Response.json(data, { headers: NO_STORE });
};

/** Creates a key for the signed-in user from the body's `label` and answers with it, once. */
export const createKey = async (request: Request): Promise<Response> => {
    const crossOrigin = refuseCrossOrigin(request);

    if (crossOrigin) {
        return crossOrigin;
    }

    const user = await getUser();

    if (!user) {
        return signedOut();
    }

    const body: unknown = await request.json().catch(() => null);

    if (typeof body !== 'object' || body === null) {
        return requestInvalidProblem('Send a JSON object with a label.');
    }

    const result = await keyService.createOwn(user.id, 'label' in body ? body.label : undefined);

    return result.ok ? issued(result.key) : REFUSALS[result.reason]();
};

/** Deletes one of the signed-in user's keys. Another account's is "not found". */
export const deleteKey = async (request: Request, keyId: string): Promise<Response> => {
    const crossOrigin = refuseCrossOrigin(request);

    if (crossOrigin) {
        return crossOrigin;
    }

    const user = await getUser();

    if (!user) {
        return signedOut();
    }

    const result = await keyService.deleteOwn({ userId: user.id, headers: request.headers }, keyId);

    if (result === 'signed_out') {
        return signedOut();
    }

    return result === 'deleted'
        ? new Response(null, { status: 204, headers: NO_STORE })
        : notFound();
};
