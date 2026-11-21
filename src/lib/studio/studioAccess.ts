/**
 * Who may call the harness about a conversation. The proxy sends every Studio
 * call with one shared token, so the harness holds no per-user identity and a
 * conversation id is all a call names. The site holds the ownership: a saved
 * conversation (src/lib/chat/conversationStore) records its harness id
 * (`agentSessionId`) under the account that saved it.
 *
 * A conversation an account has saved answers only to that account, on every
 * route. Reading its state and resuming its turn also need the caller's own
 * saved copy, so a guest, who saves nothing, gets neither. A conversation no
 * account has saved (a guest's, or an account's first seconds before its
 * first save) stays open to the routes that drive a turn.
 */

// The routes that need the caller's own saved copy of the conversation.
const OWNER_ROUTES: ReadonlySet<string> = new Set(['state', 'resume']);

// The largest request body the proxy reads for its conversation id. A turn's
// body is a message and a few small members.
export const MAX_STUDIO_BODY_BYTES = 1_048_576;

/**
 * The conversation a Studio call names: the `conversation_id` query parameter
 * of a GET, else the `conversation_id` member of the JSON body. Null when it
 * names none, or the body is not a JSON object.
 */
export const studioConversationId = (
    method: string,
    search: URLSearchParams,
    body: string | null,
): string | null => {
    if (method === 'GET' || method === 'HEAD') {
        return search.get('conversation_id');
    }

    try {
        const parsed: unknown = JSON.parse(body ?? '');
        const id =
            parsed !== null && typeof parsed === 'object'
                ? (parsed as Record<string, unknown>).conversation_id
                : undefined;

        return typeof id === 'string' ? id : null;
    } catch {
        return null;
    }
};

/**
 * Whether a call on `route` about a conversation may reach the harness, for
 * the signed-in `userId` (null for a guest), given `owners`, the accounts
 * whose saved conversations hold its harness id.
 */
export const admitsStudioCall = (
    route: string,
    userId: string | null,
    owners: readonly string[],
): boolean => {
    if (owners.some((owner) => owner !== userId)) {
        return false;
    }

    return !OWNER_ROUTES.has(route) || (userId !== null && owners.includes(userId));
};

// How long the ownership check waits on the session and the saved
// conversations before it refuses the call as unavailable, and the
// Retry-After its refusal names.
export const OWNERSHIP_TIMEOUT_MS = 5_000;
export const OWNERSHIP_RETRY_SECONDS = 5;

export type StudioAccessRefusal = 'not_found' | 'too_large' | 'unavailable';

/**
 * The proxy's ownership check for one Studio call: null to forward it, or why
 * it is refused. `readBody` reads the request body (null when it is over
 * MAX_STUDIO_BODY_BYTES), `readUserId` the signed-in user, and `ownersOf` the
 * accounts holding a harness conversation id. A call that names no
 * conversation goes on to the harness, which refuses it, except on a route
 * that needs the caller's own copy. A check whose reads fail, or have not
 * answered within `timeoutMs`, refuses the call as `unavailable`, since
 * forwarding it unchecked would open a saved conversation to anyone.
 */
export const studioAccessRefusal = async ({
    route,
    method,
    search,
    readBody,
    readUserId,
    ownersOf,
    timeoutMs = OWNERSHIP_TIMEOUT_MS,
}: {
    route: string;
    method: string;
    search: URLSearchParams;
    readBody: () => Promise<string | null>;
    readUserId: () => Promise<string | null>;
    ownersOf: (conversationId: string) => Promise<string[]>;
    timeoutMs?: number;
}): Promise<StudioAccessRefusal | null> => {
    if (method === 'OPTIONS') {
        return null;
    }

    let body: string | null = null;

    if (method !== 'GET' && method !== 'HEAD') {
        body = await readBody();

        if (body === null) {
            return 'too_large';
        }
    }

    const conversationId = studioConversationId(method, search, body);

    if (conversationId === null) {
        return OWNER_ROUTES.has(route) ? 'not_found' : null;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        const [userId, owners] = await Promise.race([
            Promise.all([readUserId(), ownersOf(conversationId)]),
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`no answer within ${timeoutMs} ms`)),
                    timeoutMs,
                );
            }),
        ]);

        return admitsStudioCall(route, userId, owners) ? null : 'not_found';
    } catch (error) {
        console.error('studio: the conversation owner was not read', error);

        return 'unavailable';
    } finally {
        clearTimeout(timer);
    }
};
