/**
 * Who may call the harness about a conversation. The proxy sends every Studio
 * call with one shared token, so the harness holds no per-user identity and a
 * conversation id is all a call names. The site holds the ownership: the
 * first account to drive a turn in a harness conversation, or to save a
 * conversation naming it, owns it, and nothing changes the owner afterwards
 * (`studioSessionOwner` in db/schema.ts, written by
 * src/lib/chat/conversationSave).
 *
 * A conversation an account owns answers only to that account, on every
 * route: a guest is asked to sign in (SIGN_IN_REQUIRED) and another account
 * is told there is no such conversation. Reading its state and resuming its
 * turn also need the caller to own it, so a guest, who owns nothing, gets
 * neither. A conversation no account owns (a guest's) stays open to the
 * routes that drive a turn. What keeps a conversation private is its id, a
 * random UUID the page mints. The refusals here reveal whether an id exists.
 *
 * The proxy checks a call in two steps. readStudioCall rebuilds the call it
 * forwards, before the rate limit, and reads no database. checkStudioOwner
 * reads and claims the owner inside forward()'s `admit` hook, after the rate
 * limit and before a turn spends a prompt, so a call the rate limit refuses
 * reads no owner row, and only a `turn` call writes one.
 */

// The routes that need the caller's own saved copy of the conversation.
const OWNER_ROUTES: ReadonlySet<string> = new Set(['state', 'resume']);

// The routes that drive a turn. Each names the conversation it acts on, so a
// call without one is refused here.
const DRIVE_ROUTES: ReadonlySet<string> = new Set(['turn', 'interrupt', 'cancel', 'composition']);

// Only a `turn` call claims, for the signed-in caller, a conversation no
// account owns.
const CLAIM_ROUTE = 'turn';

// The largest request body the proxy reads for its conversation id. A turn's
// body is a message and a few small members.
export const MAX_STUDIO_BODY_BYTES = 1_048_576;

/**
 * The problem code of a guest's call about a conversation an account owns
 * (HTTP 401). The page shows a sign-in message for it, and keeps the
 * conversation it holds.
 */
export const SIGN_IN_REQUIRED = 'sign_in_required';

/**
 * A Studio call in the one form the proxy both checks and forwards: the query
 * and body the harness receives, and the conversation they name (null when
 * they name none). The harness reads exactly `conversationId`, so the
 * ownership check and the harness agree on the conversation by construction.
 */
export type StudioCall = {
    conversationId: string | null;
    search: URLSearchParams;
    body: string | null;
};

/**
 * Rebuild a Studio call from its query and raw body, or null when it cannot
 * name one conversation unambiguously. A GET or HEAD names its conversation
 * in a single `conversation_id` query parameter. A repeated one is refused,
 * since the harness's query parser keeps the last value where
 * URLSearchParams keeps the first, and so is a `session_id` parameter, which
 * a harness older than the one this page needs read as an alias of
 * `conversation_id`. Any other method carries a JSON object body and no
 * query. The query is dropped, and the body is forwarded as re-serialised
 * here. The raw text never reaches the harness, so a body the harness's JSON
 * parser would read differently (a repeated member, `NaN`) cannot name a
 * conversation the proxy did not check. The body loses `session_id` for the
 * same older harness, so only `conversation_id` names the conversation
 * whichever harness answers.
 */
export const canonicalStudioCall = (
    method: string,
    search: URLSearchParams,
    body: string | null,
): StudioCall | null => {
    if (method === 'GET' || method === 'HEAD') {
        const ids = search.getAll('conversation_id');

        return ids.length > 1 || search.has('session_id')
            ? null
            : { conversationId: ids[0] ?? null, search: new URLSearchParams(search), body: null };
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(body ?? '');
    } catch {
        return null;
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }

    const members: Record<string, unknown> = { ...parsed };

    delete members.session_id;

    const id = members.conversation_id;

    if (id !== undefined && typeof id !== 'string') {
        return null;
    }

    return {
        conversationId: id ?? null,
        search: new URLSearchParams(),
        body: JSON.stringify(members),
    };
};

export type StudioCallRefusal = 'too_large' | 'malformed';

export type StudioCallRead =
    { refusal: StudioCallRefusal; call: null } | { refusal: null; call: StudioCall | null };

/**
 * The call the proxy forwards (canonicalStudioCall), or why it cannot build
 * one. `readBody` reads the request body, null when it is over
 * MAX_STUDIO_BODY_BYTES. A call that cannot name one conversation
 * unambiguously is `malformed`, as is a body whose `conversation_id` is not a
 * string. An OPTIONS call reads nothing and goes on with no query and no body
 * (`call` null).
 */
export const readStudioCall = async ({
    method,
    search,
    readBody,
}: {
    method: string;
    search: URLSearchParams;
    readBody: () => Promise<string | null>;
}): Promise<StudioCallRead> => {
    if (method === 'OPTIONS') {
        return { refusal: null, call: null };
    }

    let body: string | null = null;

    if (method !== 'GET' && method !== 'HEAD') {
        body = await readBody();

        if (body === null) {
            return { refusal: 'too_large', call: null };
        }
    }

    const call = canonicalStudioCall(method, search, body);

    return call === null ? { refusal: 'malformed', call: null } : { refusal: null, call };
};

export type StudioOwnerRefusal = typeof SIGN_IN_REQUIRED | 'not_found' | 'unavailable';

/**
 * Why a call on `route` about a conversation may not reach the harness, or
 * null when it may, for the signed-in `userId` (null for a guest), given
 * `owners`, the account that owns its harness conversation (none or one). A
 * null owner is an account since deleted, and its conversation answers to
 * nobody.
 */
export const studioOwnerRefusal = (
    route: string,
    userId: string | null,
    owners: readonly (string | null)[],
): StudioOwnerRefusal | null => {
    if (owners.includes(null)) {
        return 'not_found';
    }

    if (owners.length > 0) {
        if (userId === null) {
            return SIGN_IN_REQUIRED;
        }

        return owners.every((owner) => owner === userId) ? null : 'not_found';
    }

    return OWNER_ROUTES.has(route) ? 'not_found' : null;
};

// How long the ownership check waits on the session and the saved
// conversations before it refuses the call as unavailable, and the
// Retry-After its refusal names.
export const OWNERSHIP_TIMEOUT_MS = 5_000;
export const OWNERSHIP_RETRY_SECONDS = 5;

/**
 * The proxy's ownership check for one Studio call about `conversationId`,
 * run in forward()'s `admit` hook: why it is refused (studioOwnerRefusal), or
 * null. `readUserId` reads the signed-in user, and `ownersOf` the account
 * owning a harness conversation (none or one). A signed-in turn naming a
 * conversation no account owns first claims it with `claimOwner`, which
 * binds the caller unless another account got there first and answers the
 * owner either way: of two accounts racing on a new conversation, one owns it
 * and the other is refused. A call that names no conversation goes on to the
 * harness, which refuses it, except on a route that needs the caller's own
 * copy, and on a route that drives a turn, which always names one. A check
 * whose reads fail, or have not answered within `timeoutMs`, refuses the call
 * as `unavailable`, since forwarding it unchecked would open a saved
 * conversation to anyone.
 */
export const checkStudioOwner = async ({
    route,
    conversationId,
    readUserId,
    ownersOf,
    claimOwner,
    timeoutMs = OWNERSHIP_TIMEOUT_MS,
}: {
    route: string;
    conversationId: string | null;
    readUserId: () => Promise<string | null>;
    ownersOf: (conversationId: string) => Promise<(string | null)[]>;
    claimOwner: (conversationId: string, userId: string) => Promise<(string | null)[]>;
    timeoutMs?: number;
}): Promise<StudioOwnerRefusal | null> => {
    if (conversationId === null) {
        return OWNER_ROUTES.has(route) || DRIVE_ROUTES.has(route) ? 'not_found' : null;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        const read = async (): Promise<[string | null, (string | null)[]]> => {
            const [userId, owners] = await Promise.all([readUserId(), ownersOf(conversationId)]);

            return owners.length === 0 && userId !== null && route === CLAIM_ROUTE
                ? [userId, await claimOwner(conversationId, userId)]
                : [userId, owners];
        };
        const [userId, owners] = await Promise.race([
            read(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`no answer within ${timeoutMs} ms`)),
                    timeoutMs,
                );
            }),
        ]);

        return studioOwnerRefusal(route, userId, owners);
    } catch (error) {
        console.error('studio: the conversation owner was not read', error);

        return 'unavailable';
    } finally {
        clearTimeout(timer);
    }
};
