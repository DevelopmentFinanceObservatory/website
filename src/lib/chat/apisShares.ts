import { asRecord } from '../asRecord.ts';
import type { ShareMode } from './shareMode.ts';
import type { ShareKind } from './sharePrune.ts';
import {
    deleteShareToken,
    fenceShareTokens,
    listShareTokens,
    putShareToken,
    readShareToken,
    recordShareCleanup,
    unfenceShareTokens,
    type ShareTokenDb,
} from './shareTokens.ts';
import type { CardRef, FrameRef } from './widgets.ts';

/**
 * The website's calls to dfo-apis' share routes, and the only module that
 * knows their paths, bodies, and headers:
 *
 *   POST   {apis}/api/presentation/shares                         createShare
 *   GET    {apis}/api/presentation/shares/{id}                    readShare
 *   GET    {apis}/api/presentation/shares/{id}/history            readShareHistory
 *   POST   {apis}/api/presentation/shares/{id}/snapshot           (token) ownerShareWrite
 *   DELETE {apis}/api/presentation/shares/{id}                    (token) ownerShareWrite,
 *                                                                  createOwnedShare
 *   GET    {apis}/api/presentation/shares/{id}/slots/{n}          readSlotCard
 *   GET    {apis}/api/presentation/shares/{id}/slots/{n}/data     readSlotFile
 *
 * dfo-apis mints every share id. The website mints each create's `shw_`
 * write token (`mintWriteToken`), so a create that failed on the way can be
 * sent again with the same token and body and answer the share the first
 * one made. A signed-in owner's token is kept in `share_token`
 * (shareTokens.ts) and sent back in `x-dfo-write-token` to switch a live
 * share to snapshot or take a share down. A guest's share keeps no token, so
 * it stays as made. Every call names the browser's caller to dfo-apis
 * (`SharesBackend.nameCaller`), which counts the share allowance by it.
 *
 * Every call has 35 seconds (`CALL_DEADLINE_MS`), within any deadline the
 * backend's own `signal` sets. Every failure is a `SharesError` whose `code`
 * is machine-readable: the code of dfo-apis' refusal, or one of
 * `backend_unreachable`, `backend_timeout`, `backend_refused`,
 * `backend_invalid`. No free text of a refusal leaves this module.
 *
 * No database binding or path-alias dependency, so `node --test` imports it.
 */

export type SharesBackend = {
    base: string;
    fetch: typeof fetch;
    // Names the browser's caller on headers bound for dfo-apis
    // (`setApisCaller` in src/lib/proxy/caller.ts).
    nameCaller: (headers: Headers) => void;
    signal?: AbortSignal;
};

export class SharesError extends Error {
    readonly code: string;
    readonly status?: number;
    readonly retryable: boolean;
    readonly retryAfterS?: number;

    constructor(
        code: string,
        {
            status,
            retryable = false,
            retryAfterS,
        }: { status?: number; retryable?: boolean; retryAfterS?: number } = {},
    ) {
        super(`dfo-apis shares: ${code}`);
        this.name = 'SharesError';
        this.code = code;
        this.status = status;
        this.retryable = retryable;
        this.retryAfterS = retryAfterS;
    }
}

/** One numbered slot of a share. `card` is null for a slot a replacement
 *  left empty, and its `frame` null when dfo-apis recorded none. */
export type RecordSlot = {
    slot: number;
    card: (CardRef & { frame: FrameRef | null }) | null;
};

/** A share as dfo-apis holds it (`GET /api/presentation/shares/{id}`). */
export type ShareRecord = {
    id: string;
    kind: ShareKind;
    mode: ShareMode;
    title: string | null;
    slots: RecordSlot[];
    payload: unknown;
    createdAt: string;
};

/** One entry of what a share's slot showed (`GET .../shares/{id}/history`):
 *  the card and frame it began to show at `firstServedAt`, an ISO
 *  timestamp. `card` is null when the slot showed no card. */
export type ServedEntry = {
    slot: number;
    card: (CardRef & { frame: FrameRef }) | null;
    firstServedAt: string;
};

/** A slot's card as dfo-apis drew it on the frame the slot serves: the
 *  component read's body, with `freshness`, and the reply's `ETag` and
 *  `Cache-Control`. `body` is null when dfo-apis answered 304 to the
 *  `If-None-Match` it was sent. */
export type SlotCard = {
    body: Record<string, unknown> | null;
    etag: string | null;
    cacheControl: string | null;
};

export type CreateShareBody = {
    kind: ShareKind;
    latest: boolean;
    title: string;
    cards: CardRef[];
    payload: unknown;
};

export const SHARE_ID = /^[A-Za-z0-9]{8}$/;

// One call's deadline. dfo-apis stops a Presentation route at 30 seconds
// (`PRESENTATION_COMPONENTS_TIMEOUT_SECONDS`), as the slot data route's
// `EXPORT_DEADLINE_MS` allows for.
const CALL_DEADLINE_MS = 35_000;

const WRITE_TOKEN_HEADER = 'x-dfo-write-token';
const WRITE_TOKEN_PREFIX = 'shw_';
// dfo-apis' form of a write token: 16 random bytes as unpadded url-safe
// base64.
const WRITE_TOKEN_BYTES = 16;
const KINDS: readonly string[] = ['card', 'canvas', 'search', 'conversation'];
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
// dfo-apis' bound on a title.
const MAX_TITLE = 300;
// dfo-apis' largest page of a share's history.
const HISTORY_PAGE = 500;

const sharePath = (id: string): string => {
    // The id is the viewer's URL segment, so only dfo-apis' own form reaches a path.
    if (!SHARE_ID.test(id)) {
        throw new SharesError('not_found', { status: 404 });
    }

    return `/api/presentation/shares/${id}`;
};

const refusalOf = async (res: Response): Promise<SharesError> => {
    const body = asRecord(await res.json().catch(() => null));
    const code = body?.['code'];
    const wait = Number(res.headers.get('retry-after'));

    return new SharesError(typeof code === 'string' && CODE.test(code) ? code : 'backend_refused', {
        status: res.status,
        retryable: body?.['retryable'] === true,
        ...(Number.isFinite(wait) && wait > 0 ? { retryAfterS: wait } : {}),
    });
};

const send = async (
    backend: SharesBackend,
    path: string,
    init: { method?: string; body?: unknown; token?: string; ifNoneMatch?: string | null } = {},
): Promise<Response> => {
    const headers = new Headers({ accept: 'application/json' });

    if (init.ifNoneMatch) {
        headers.set('if-none-match', init.ifNoneMatch);
    }

    backend.nameCaller(headers);

    if (init.body !== undefined) {
        headers.set('content-type', 'application/json');
    }

    if (init.token) {
        headers.set(WRITE_TOKEN_HEADER, init.token);
    }

    let res: Response;

    try {
        res = await backend.fetch(`${backend.base}${path}`, {
            method: init.method ?? 'GET',
            headers,
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            cache: 'no-store',
            redirect: 'manual',
            // A deadline per call, so a create's second try starts afresh.
            signal: AbortSignal.any([
                AbortSignal.timeout(CALL_DEADLINE_MS),
                ...(backend.signal ? [backend.signal] : []),
            ]),
        });
    } catch (error) {
        const timedOut =
            error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError');

        throw new SharesError(timedOut ? 'backend_timeout' : 'backend_unreachable');
    }

    // A 304 answers a request that sent `If-None-Match`.
    if (!res.ok && !(init.ifNoneMatch && res.status === 304)) {
        throw await refusalOf(res);
    }

    return res;
};

const json = async (res: Response): Promise<Record<string, unknown>> => {
    const body = asRecord(await res.json().catch(() => null));

    if (!body) {
        throw new SharesError('backend_invalid');
    }

    return body;
};

const frameOf = (value: unknown): FrameRef | null => {
    const frame = asRecord(value);

    return typeof frame?.['spec_id'] === 'string' && typeof frame['content_version'] === 'string'
        ? { spec_id: frame['spec_id'], content_version: frame['content_version'] }
        : null;
};

const slotOf = (raw: unknown): RecordSlot => {
    const value = asRecord(raw);

    if (!value || !Number.isSafeInteger(value['slot'])) {
        throw new SharesError('backend_invalid');
    }

    if (value['card'] === null) {
        return { slot: value['slot'] as number, card: null };
    }

    const card = asRecord(value['card']);

    if (
        !card ||
        typeof card['component_id'] !== 'string' ||
        !Number.isSafeInteger(card['revision'])
    ) {
        throw new SharesError('backend_invalid');
    }

    return {
        slot: value['slot'] as number,
        card: {
            component_id: card['component_id'],
            revision: card['revision'] as number,
            frame: frameOf(card['frame']),
        },
    };
};

const servedOf = (raw: unknown): ServedEntry => {
    const value = asRecord(raw);
    const slot = value?.['slot'];
    const firstServedAt = value?.['first_served_at'];

    if (!value || !Number.isSafeInteger(slot) || typeof firstServedAt !== 'string') {
        throw new SharesError('backend_invalid');
    }

    if (value['frame'] === null) {
        return { slot: slot as number, card: null, firstServedAt };
    }

    const frame = frameOf(value['frame']);
    const componentId = value['component_id'];

    if (!frame || typeof componentId !== 'string' || !Number.isSafeInteger(value['revision'])) {
        throw new SharesError('backend_invalid');
    }

    return {
        slot: slot as number,
        card: { component_id: componentId, revision: value['revision'] as number, frame },
        firstServedAt,
    };
};

/** A new `shw_` write token in dfo-apis' form. */
export const mintWriteToken = (): string =>
    `${WRITE_TOKEN_PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(WRITE_TOKEN_BYTES))).toString('base64url')}`;

// A create worth sending again: no answer, or a server fault dfo-apis calls
// passing. A refusal of the request itself, and a spent allowance, would
// meet the same answer.
const isRetryableCreate = (error: unknown): boolean =>
    error instanceof SharesError &&
    (error.status === undefined || (error.retryable && error.status >= 500));

/** Make a share under a write token minted here. A create that fails in a
 *  way a second try can outlive is sent once more, with the same token and
 *  body, which dfo-apis answers with the share the first create made if it
 *  made one. Returns the share's id and the write token dfo-apis answers. */
export const createShare = async (
    backend: SharesBackend,
    { kind, latest, title, cards, payload }: CreateShareBody,
): Promise<{ id: string; writeToken: string }> => {
    const writeToken = mintWriteToken();
    const request = {
        method: 'POST',
        body: {
            kind,
            latest,
            // Cut by code point, as dfo-apis counts, so no surrogate pair is split.
            title: Array.from(title.trim()).slice(0, MAX_TITLE).join('') || null,
            cards,
            payload,
            write_token: writeToken,
        },
    };
    const create = async () => json(await send(backend, '/api/presentation/shares', request));
    const body = await create().catch((error: unknown) => {
        if (isRetryableCreate(error)) {
            return create();
        }

        throw error;
    });
    // The reply's token is the one dfo-apis holds, which is the one sent here.
    const { id, write_token: held } = body;

    if (typeof id !== 'string' || !SHARE_ID.test(id) || typeof held !== 'string') {
        throw new SharesError('backend_invalid');
    }

    return { id, writeToken: held };
};

/** A share, or null when no share has this id. */
export const readShare = async (
    backend: SharesBackend,
    id: string,
): Promise<ShareRecord | null> => {
    let body: Record<string, unknown>;

    try {
        body = await json(await send(backend, sharePath(id)));
    } catch (error) {
        if (error instanceof SharesError && error.status === 404) {
            return null;
        }

        throw error;
    }

    const { kind, mode, title, slots, payload, created_at: createdAt } = body;

    if (
        body['id'] !== id ||
        typeof kind !== 'string' ||
        !KINDS.includes(kind) ||
        (mode !== 'live' && mode !== 'snapshot') ||
        (title !== null && typeof title !== 'string') ||
        !Array.isArray(slots) ||
        typeof createdAt !== 'string'
    ) {
        throw new SharesError('backend_invalid');
    }

    return {
        id,
        kind: kind as ShareKind,
        mode,
        title,
        slots: slots.map(slotOf),
        payload: payload ?? null,
        createdAt,
    };
};

/** One page of what each slot of a share showed, newest first, an entry
 *  each time it changed: the page after `before`, or the newest page when
 *  `before` is null. `next` is the cursor of the page after this one, or
 *  null at the end of the history. dfo-apis records an entry at every write
 *  and at each read that serves something new. */
export const readShareHistory = async (
    backend: SharesBackend,
    id: string,
    before: string | null = null,
): Promise<{ served: ServedEntry[]; next: string | null }> => {
    const query = new URLSearchParams({
        limit: String(HISTORY_PAGE),
        ...(before === null ? {} : { before }),
    });
    const body = await json(await send(backend, `${sharePath(id)}/history?${query}`));
    const next = body['next'] ?? null;

    // A cursor that names the page just read would read it again.
    if (
        body['id'] !== id ||
        !Array.isArray(body['served']) ||
        (next !== null && (typeof next !== 'string' || next === before))
    ) {
        throw new SharesError('backend_invalid');
    }

    return { served: body['served'].map(servedOf), next };
};

/** Slot `slot` (from 1) of a share: its card drawn on the frame the slot
 *  serves. Reading it is what has dfo-apis check a live slot for newer data,
 *  at most once per 15 minutes, and record the frame in the share's history.
 *  `ifNoneMatch` goes to dfo-apis as it came. */
export const readSlotCard = async (
    backend: SharesBackend,
    id: string,
    slot: number,
    ifNoneMatch: string | null = null,
): Promise<SlotCard> => {
    const res = await send(backend, `${sharePath(id)}/slots/${slot}`, { ifNoneMatch });
    const etag = res.headers.get('etag');
    const cacheControl = res.headers.get('cache-control');

    return { body: res.status === 304 ? null : await json(res), etag, cacheControl };
};

/** The rows behind slot `slot`'s card on the frame the slot serves, as a
 *  file. dfo-apis' slot data route takes the same `format` and `bundle` as
 *  the component export (a bundle is refused for JSON) and refuses a value
 *  it cannot write with 400, so both go through as given. */
export const readSlotFile = async (
    backend: SharesBackend,
    id: string,
    slot: number,
    { format, bundle }: { format: string; bundle: string },
): Promise<Response> =>
    send(backend, `${sharePath(id)}/slots/${slot}/data?${new URLSearchParams({ format, bundle })}`);

// Take down the share `id` with its write token.
const takeDown = (backend: SharesBackend, id: string, token: string): Promise<Response> =>
    send(backend, sharePath(id), { method: 'DELETE', token });

/**
 * Make a share and keep its write token for `userId`, the signed-in maker.
 * A guest's share (`userId` null) keeps no token, so nobody can change or
 * remove it. When the token cannot be kept, because the write fails,
 * another user's row holds the id, or the maker's account is being deleted,
 * the new share is deleted with it and a retryable `token_not_kept` is
 * thrown, so no share is left that its maker cannot manage. When that
 * take-down fails too, the share and its token go to `share_cleanup` for an
 * operator. A second try makes a share under a new id.
 */
export const createOwnedShare = async (
    { db, backend }: { db: ShareTokenDb; backend: SharesBackend },
    userId: string | null,
    body: CreateShareBody,
): Promise<{ id: string }> => {
    const { id, writeToken } = await createShare(backend, body);

    if (!userId) {
        return { id };
    }

    const kept: unknown = await putShareToken(db, { shareId: id, userId, writeToken }).catch(
        (error: unknown) => error,
    );

    if (kept === true) {
        return { id };
    }

    const removed = await takeDown(backend, id, writeToken)
        .then(() => 'deleted')
        .catch((refusal: unknown) =>
            refusal instanceof SharesError ? refusal.code : String(refusal),
        );

    console.error('share: the write token was not kept, so the share was taken down', {
        share: id,
        removed,
        error:
            kept === false
                ? "another user holds its write token, or the maker's account is going"
                : String(kept),
    });

    if (removed !== 'deleted' && removed !== 'not_found') {
        await recordShareCleanup(db, { shareId: id, userId, writeToken, reason: removed });
    }

    throw new SharesError('token_not_kept', { retryable: true });
};

// The refusals that say the share is gone or its token grants nothing.
const isLostShare = ({ code }: SharesError): boolean =>
    code === 'not_found' || code.startsWith('write_token_');

// The kinds a switch to snapshot applies to. A conversation share is always
// a snapshot, and a search share has no slots for dfo-apis to pin.
const SWITCHABLE_KINDS: readonly ShareKind[] = ['canvas', 'card'];

/**
 * A signed-in owner's write to their own share: `snapshot` turns a live
 * canvas or card share into a snapshot under the same URLs, `delete` takes
 * it down and drops the token. `not_found` covers a share that does not
 * exist, one the caller holds no token for, and one whose token dfo-apis
 * refuses (`not_found`, `write_token_*`), so the answer does not reveal
 * which ids are taken. The stored token is dropped only in those cases.
 * `unsupported_kind` answers a switch of a search or conversation share.
 * Any other refusal throws with its code, and the token stays.
 */
export const ownerShareWrite = async (
    { db, backend }: { db: ShareTokenDb; backend: SharesBackend },
    { shareId, userId, action }: { shareId: string; userId: string; action: 'snapshot' | 'delete' },
): Promise<'done' | 'not_found' | 'unsupported_kind'> => {
    if (!SHARE_ID.test(shareId)) {
        return 'not_found';
    }

    const token = await readShareToken(db, { shareId, userId });

    if (!token) {
        return 'not_found';
    }

    try {
        if (action === 'snapshot') {
            const record = await readShare(backend, shareId);

            if (!record) {
                throw new SharesError('not_found', { status: 404 });
            }

            if (!SWITCHABLE_KINDS.includes(record.kind)) {
                return 'unsupported_kind';
            }
        }

        await send(
            backend,
            action === 'delete' ? sharePath(shareId) : `${sharePath(shareId)}/snapshot`,
            { method: action === 'delete' ? 'DELETE' : 'POST', token },
        );
    } catch (error) {
        if (!(error instanceof SharesError) || !isLostShare(error)) {
            throw error;
        }

        await deleteShareToken(db, { shareId, userId });

        return 'not_found';
    }

    if (action === 'delete') {
        await deleteShareToken(db, { shareId, userId });
    }

    return 'done';
};

/**
 * Take down every share `userId` keeps a write token for, before their
 * account is deleted, dropping each token once its share is gone. First the
 * account is fenced (`fenceShareTokens`), so a share made meanwhile either
 * stores its token before the list is read or is taken down by its own
 * create. A share dfo-apis no longer has (`not_found`) counts as taken down.
 * A share whose token dfo-apis refuses (`write_token_*`) is kept in
 * `share_cleanup` with that token and logged, for an operator to take down
 * with dfo-apis' `datasets-maintenance take-down-share <id>`, and does
 * not block the deletion. Any other failure lifts the fence and throws, and
 * the shares not yet taken down keep their tokens, so the account can be
 * deleted again later and no share is left without one.
 */
export const takeDownUserShares = async (
    { db, backend }: { db: ShareTokenDb; backend: SharesBackend },
    userId: string,
): Promise<void> => {
    await fenceShareTokens(db, userId);

    try {
        for (const { shareId, writeToken } of await listShareTokens(db, userId)) {
            await takeDown(backend, shareId, writeToken).catch(async (error: unknown) => {
                if (!(error instanceof SharesError && isLostShare(error))) {
                    throw error;
                }

                if (error.code !== 'not_found') {
                    console.error('share: dfo-apis refused the write token, kept for cleanup', {
                        share: shareId,
                        code: error.code,
                    });
                    await recordShareCleanup(db, {
                        shareId,
                        userId,
                        writeToken,
                        reason: error.code,
                    });
                }
            });
            await deleteShareToken(db, { shareId, userId });
        }
    } catch (error) {
        await unfenceShareTokens(db, userId).catch((cause: unknown) => {
            console.error('share: the account stays fenced after its deletion stopped', {
                cause: String(cause),
            });
        });

        throw error;
    }
};
