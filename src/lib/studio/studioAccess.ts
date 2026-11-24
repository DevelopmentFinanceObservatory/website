/**
 * Who may call the harness about a conversation. The proxy sends every Studio
 * call with one shared token, so the harness holds no per-user identity and a
 * conversation id is all a call names. The site holds the ownership in one
 * owner row per harness conversation (`studioSessionOwner` in db/schema.ts),
 * which nothing changes once written. Three writers race to insert it, and
 * the first wins. They are a signed-in turn's claim (checkStudioOwner), a
 * save naming the conversation (src/lib/chat/conversationSave), and the
 * owner read itself, which claims a conversation for the one account whose
 * saved conversations name it (src/lib/chat/conversationStore).
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
 * forwards, after the proxy counts the call against the rate limit
 * (studioProxy) and reads no database. checkStudioOwner reads and claims the
 * owner inside forward()'s `admit` hook, so a call the rate limit refuses
 * reads no owner row. A signed-in POST `turn` whose prompt the allowance
 * admits claims one, and so can any call that reaches the owner read, since
 * that read claims from saves.
 */

// The methods the harness serves on each route, and so the only ones the
// proxy forwards.
const STUDIO_METHODS: Readonly<Record<string, readonly string[]>> = {
    turn: ['POST'],
    interrupt: ['POST'],
    cancel: ['POST'],
    composition: ['POST'],
    resume: ['POST'],
    state: ['GET'],
};

/** The `Allow` header of a Studio route: its methods and OPTIONS. */
export const studioAllow = (route: string): string =>
    [...(STUDIO_METHODS[route] ?? []), 'OPTIONS'].join(', ');

// The routes that need the caller to own the conversation.
const OWNER_ROUTES: ReadonlySet<string> = new Set(['state', 'resume']);

// The routes that drive a turn. Each names the conversation it acts on, so a
// call without one is refused here.
const DRIVE_ROUTES: ReadonlySet<string> = new Set(['turn', 'interrupt', 'cancel', 'composition']);

// Only a `turn` call claims, for the signed-in caller, a conversation no
// account owns.
const CLAIM_ROUTE = 'turn';

// The largest request body the proxy reads for its conversation id on a
// route other than `turn`.
export const MAX_STUDIO_BODY_BYTES = 1_048_576;

// The largest `turn` body. Its `seed_spec` carries up to six Spec blocks of
// up to 1 MiB each beside the message. Equal to the harness's own cap,
// `MAX_TURN_REQUEST_BYTES` in dfo-ai's services/harness/src/harness/wire.py.
export const MAX_TURN_BODY_BYTES = 6 * 1_048_576 + 65_536;

/** The largest request body the proxy reads on `route`. */
export const maxStudioBodyBytes = (route: string): number =>
    route === CLAIM_ROUTE ? MAX_TURN_BODY_BYTES : MAX_STUDIO_BODY_BYTES;

/**
 * The longest conversation id the site accepts, on a Studio call and in a
 * save (src/lib/chat/conversationSave). The id is the text primary key of
 * its owner row, whose btree index refuses a key over about 2.7 KB. The page
 * mints a 36-character UUID.
 */
export const MAX_CONVERSATION_ID_CHARS = 256;

/**
 * Whether `id` can name a conversation: not empty, at most
 * MAX_CONVERSATION_ID_CHARS long, and free of control characters (U+0000
 * makes a Postgres read throw). `conversation.agent_session_id` and a saved
 * conversation's `sessionId` can still hold ids this refuses. Migration
 * 0027_clear_refused_harness_ids cleared the column only on databases that ran
 * it, which excludes the dev database, and the previous revision stores any id
 * while a deploy rolls out. readSavedConversation reads such an id as none.
 */
export const isConversationId = (id: string): boolean =>
    id.length > 0 && id.length <= MAX_CONVERSATION_ID_CHARS && !/\p{Cc}/u.test(id);

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
 * whichever harness answers. An id that fails isConversationId names no
 * conversation the site can own, and is refused.
 */
export const canonicalStudioCall = (
    method: string,
    search: URLSearchParams,
    body: string | null,
): StudioCall | null => {
    if (method === 'GET' || method === 'HEAD') {
        const ids = search.getAll('conversation_id');

        return ids.length > 1 ||
            search.has('session_id') ||
            (ids[0] !== undefined && !isConversationId(ids[0]))
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

    if (id !== undefined && (typeof id !== 'string' || !isConversationId(id))) {
        return null;
    }

    return {
        conversationId: id ?? null,
        search: new URLSearchParams(),
        body: JSON.stringify(members),
    };
};

/**
 * Why the proxy answers a call itself: a body over the route's cap
 * (`too_large`), a call that cannot name one conversation unambiguously
 * (`malformed`), a method the route does not serve (`method_not_allowed`),
 * or an OPTIONS call (`options`), which the proxy answers with the route's
 * methods and never forwards.
 */
export type StudioCallRefusal = 'too_large' | 'malformed' | 'method_not_allowed' | 'options';

export type StudioCallRead =
    { refusal: StudioCallRefusal; call: null } | { refusal: null; call: StudioCall };

/**
 * The call the proxy forwards on `route` (canonicalStudioCall), or why it
 * cannot build one. `readBody` reads the request body, null when it is over
 * `maxBytes`, which is the route's cap (maxStudioBodyBytes). A call that
 * cannot name one conversation unambiguously is `malformed`, as is a body
 * whose `conversation_id` is not a string. A method checks first, so an
 * OPTIONS call or a method the route does not serve reads no body.
 */
export const readStudioCall = async ({
    route,
    method,
    search,
    readBody,
}: {
    route: string;
    method: string;
    search: URLSearchParams;
    readBody: (maxBytes: number) => Promise<string | null>;
}): Promise<StudioCallRead> => {
    if (method === 'OPTIONS') {
        return { refusal: 'options', call: null };
    }

    if (!STUDIO_METHODS[route]?.includes(method)) {
        return { refusal: 'method_not_allowed', call: null };
    }

    let body: string | null = null;

    if (method !== 'GET' && method !== 'HEAD') {
        body = await readBody(maxStudioBodyBytes(route));

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

// How long the ownership check waits on each of its reads (the session and
// the owner row, then a turn's claim) before it refuses the call as
// unavailable, and the Retry-After its refusal names.
export const OWNERSHIP_TIMEOUT_MS = 5_000;
export const OWNERSHIP_RETRY_SECONDS = 5;

// `work`'s answer, or a rejection once `timeoutMs` passes first.
const withinTimeout = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            work,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`no answer within ${timeoutMs} ms`)),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
};

/**
 * The proxy's admission of one Studio call about `conversationId`, run in
 * forward()'s `admit` hook: the refusal to answer with, or null to forward
 * the call. `refuse` turns an ownership refusal (studioOwnerRefusal) into
 * that answer. `readUserId` reads the signed-in user, `ownersOf` the account
 * owning a harness conversation (none or one), and `claimOwner` binds the
 * caller to a conversation unless another account got there first,
 * answering the owner either way.
 *
 * A call on a route that drives a turn, or that needs the caller to own the
 * conversation, names one or is refused. The owner is read first, so a
 * caller the owner refuses spends nothing. A `turn` then spends its prompt
 * through `spend`, whose refusal is the answer. Only after that does a
 * signed-in turn claim a conversation no account owns. Of two accounts
 * racing on a new conversation, one owns it and the other is refused
 * `not_found`, and the proxy gives that turn's prompt back as it does for
 * any turn that does not start (meterTurn in src/lib/studio/spendPrompt).
 *
 * Each read that fails, or has not answered within `timeoutMs`, refuses the
 * call as `unavailable`, since forwarding it unchecked would open an owned
 * conversation to anyone. A claim starts only after the owner read has
 * answered in time. An owner read the timeout gave up on starts no claim,
 * though a claim from saves inside that read can land after it.
 */
export const checkStudioOwner = async <R>({
    route,
    conversationId,
    readUserId,
    ownersOf,
    claimOwner,
    spend,
    refuse,
    timeoutMs = OWNERSHIP_TIMEOUT_MS,
}: {
    route: string;
    conversationId: string | null;
    readUserId: () => Promise<string | null>;
    ownersOf: (conversationId: string) => Promise<(string | null)[]>;
    claimOwner: (conversationId: string, userId: string) => Promise<(string | null)[]>;
    spend?: () => Promise<R | null>;
    refuse: (refusal: StudioOwnerRefusal) => R;
    timeoutMs?: number;
}): Promise<R | null> => {
    if (conversationId === null) {
        return OWNER_ROUTES.has(route) || DRIVE_ROUTES.has(route) ? refuse('not_found') : null;
    }

    let userId: string | null;
    let owners: (string | null)[];

    try {
        [userId, owners] = await withinTimeout(
            Promise.all([readUserId(), ownersOf(conversationId)]),
            timeoutMs,
        );
    } catch (error) {
        console.error('studio: the conversation owner was not read', error);

        return refuse('unavailable');
    }

    const ownerRefusal = studioOwnerRefusal(route, userId, owners);

    if (ownerRefusal) {
        return refuse(ownerRefusal);
    }

    const spendRefusal = (await spend?.()) ?? null;

    if (spendRefusal !== null) {
        return spendRefusal;
    }

    if (route !== CLAIM_ROUTE || userId === null || owners.length > 0) {
        return null;
    }

    try {
        owners = await withinTimeout(claimOwner(conversationId, userId), timeoutMs);
    } catch (error) {
        console.error('studio: the conversation owner was not claimed', error);

        return refuse('unavailable');
    }

    const claimRefusal = studioOwnerRefusal(route, userId, owners);

    return claimRefusal ? refuse(claimRefusal) : null;
};
