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
 * route. Reading its state and resuming its turn also need the caller to own
 * it, so a guest, who owns nothing, gets neither. A conversation no account
 * owns (a guest's) stays open to the routes that drive a turn.
 */

// The routes that need the caller's own saved copy of the conversation.
const OWNER_ROUTES: ReadonlySet<string> = new Set(['state', 'resume']);

// The largest request body the proxy reads for its conversation id. A turn's
// body is a message and a few small members.
export const MAX_STUDIO_BODY_BYTES = 1_048_576;

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
 * in a single `conversation_id` query parameter; a repeated one is refused,
 * since the harness's query parser keeps the last value where
 * URLSearchParams keeps the first. Any other method carries a JSON object
 * body, which is forwarded as re-serialised here: the raw text never reaches
 * the harness, so a body the harness's JSON parser would read differently
 * (a repeated member, `NaN`) cannot name a conversation the proxy did not
 * check. The body loses `session_id`, which a harness older than the one this
 * page needs read as an alias of `conversation_id`, so only `conversation_id`
 * names the conversation whichever harness answers.
 */
export const canonicalStudioCall = (
    method: string,
    search: URLSearchParams,
    body: string | null,
): StudioCall | null => {
    const forwardedSearch = new URLSearchParams(search);

    if (method === 'GET' || method === 'HEAD') {
        const ids = search.getAll('conversation_id');

        return ids.length > 1
            ? null
            : { conversationId: ids[0] ?? null, search: forwardedSearch, body: null };
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

    return {
        conversationId: typeof id === 'string' ? id : null,
        search: forwardedSearch,
        body: JSON.stringify(members),
    };
};

/**
 * Whether a call on `route` about a conversation may reach the harness, for
 * the signed-in `userId` (null for a guest), given `owners`, the account
 * that owns its harness conversation (none or one). A null owner is an
 * account since deleted, and its conversation answers to nobody.
 */
export const admitsStudioCall = (
    route: string,
    userId: string | null,
    owners: readonly (string | null)[],
): boolean => {
    if (owners.some((owner) => owner === null || owner !== userId)) {
        return false;
    }

    return !OWNER_ROUTES.has(route) || (userId !== null && owners.includes(userId));
};

// How long the ownership check waits on the session and the saved
// conversations before it refuses the call as unavailable, and the
// Retry-After its refusal names.
export const OWNERSHIP_TIMEOUT_MS = 5_000;
export const OWNERSHIP_RETRY_SECONDS = 5;

export type StudioAccessRefusal = 'not_found' | 'too_large' | 'malformed' | 'unavailable';

export type StudioAccess =
    { refusal: StudioAccessRefusal; call: null } | { refusal: null; call: StudioCall | null };

/**
 * The proxy's ownership check for one Studio call: the call to forward
 * (canonicalStudioCall), or why it is refused. `readBody` reads the request
 * body (null when it is over MAX_STUDIO_BODY_BYTES), `readUserId` the
 * signed-in user, and `ownersOf` the account owning a harness conversation
 * (none or one). A signed-in call on a route that drives a turn, naming a
 * conversation no account owns, first claims it with `claimOwner`, which
 * binds the caller unless another account got there first and answers the
 * owner either way: of two accounts racing on a new conversation, one owns it
 * and the other is refused. The check reads the conversation id from the canonical call, and the
 * proxy forwards that call's query and body, so the conversation checked is
 * the conversation the harness reads. A call that cannot name one
 * conversation unambiguously is refused as `malformed`. A call that names
 * none goes on to the harness, which refuses it, except on a route that needs
 * the caller's own copy. A check whose reads fail, or have not answered
 * within `timeoutMs`, refuses the call as `unavailable`, since forwarding it
 * unchecked would open a saved conversation to anyone. An OPTIONS call is
 * forwarded as it came (`call` null).
 */
export const studioAccess = async ({
    route,
    method,
    search,
    readBody,
    readUserId,
    ownersOf,
    claimOwner,
    timeoutMs = OWNERSHIP_TIMEOUT_MS,
}: {
    route: string;
    method: string;
    search: URLSearchParams;
    readBody: () => Promise<string | null>;
    readUserId: () => Promise<string | null>;
    ownersOf: (conversationId: string) => Promise<(string | null)[]>;
    claimOwner: (conversationId: string, userId: string) => Promise<(string | null)[]>;
    timeoutMs?: number;
}): Promise<StudioAccess> => {
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

    if (call === null) {
        return { refusal: 'malformed', call: null };
    }

    const { conversationId } = call;

    if (conversationId === null) {
        return OWNER_ROUTES.has(route)
            ? { refusal: 'not_found', call: null }
            : { refusal: null, call };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        const read = async (): Promise<[string | null, (string | null)[]]> => {
            const [userId, owners] = await Promise.all([readUserId(), ownersOf(conversationId)]);

            return owners.length === 0 && userId !== null && !OWNER_ROUTES.has(route)
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

        return admitsStudioCall(route, userId, owners)
            ? { refusal: null, call }
            : { refusal: 'not_found', call: null };
    } catch (error) {
        console.error('studio: the conversation owner was not read', error);

        return { refusal: 'unavailable', call: null };
    } finally {
        clearTimeout(timer);
    }
};
