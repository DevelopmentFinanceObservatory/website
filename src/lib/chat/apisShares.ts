import type { ShareMode } from './shareMode.ts';
import type { ShareKind } from './sharePrune.ts';
import {
    deleteShareToken,
    putShareToken,
    readShareToken,
    type ShareTokenDb,
} from './shareTokens.ts';
import type { CardRef, FrameRef } from './widgets.ts';

/**
 * The website's calls to dfo-apis' share routes, and the only module that
 * knows their paths, bodies, and headers:
 *
 *   POST   {apis}/api/presentation/shares                         createShare
 *   GET    {apis}/api/presentation/shares/{id}                    readShare
 *   POST   {apis}/api/presentation/shares/{id}/snapshot           (token) ownerShareWrite
 *   DELETE {apis}/api/presentation/shares/{id}                    (token) ownerShareWrite
 *   GET    {apis}/api/presentation/shares/{id}/slots/{n}/data     readSlot
 *
 * dfo-apis mints every share id and a `shw_` write token, which a create
 * answers once. A signed-in owner's token is kept in `share_token`
 * (shareTokens.ts) and sent back in `x-dfo-write-token` to switch a live
 * share to snapshot or take a share down. A guest's share keeps no token, so
 * it stays as made. Every call names the browser's caller to dfo-apis
 * (`SharesBackend.nameCaller`), which counts the share allowance by it.
 *
 * Every failure is a `SharesError` whose `code` is machine-readable: the
 * code of dfo-apis' refusal, or one of `backend_unreachable`,
 * `backend_timeout`, `backend_refused`, `backend_invalid`. No free text of a
 * refusal leaves this module.
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

/** What a slot serves now: the card revision it shows, the frame it drew
 *  the rows on, and whether that is the newest data. */
export type SlotServed = {
    componentId: string;
    revision: number;
    frame: FrameRef;
    freshness: 'current' | 'stale' | 'pending';
};

export type CreateShareBody = {
    kind: ShareKind;
    latest: boolean;
    title: string;
    cards: CardRef[];
    payload: unknown;
};

export const SHARE_ID = /^[A-Za-z0-9]{8}$/;

const WRITE_TOKEN_HEADER = 'x-dfo-write-token';
const KINDS: readonly string[] = ['card', 'canvas', 'search', 'conversation'];
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
// dfo-apis' bound on a title.
const MAX_TITLE = 300;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const sharePath = (id: string): string => {
    // The id is the viewer's URL segment; only dfo-apis' own form reaches a path.
    if (!SHARE_ID.test(id)) {
        throw new SharesError('not_found', { status: 404 });
    }

    return `/api/presentation/shares/${id}`;
};

const refusalOf = async (res: Response): Promise<SharesError> => {
    const body: unknown = await res.json().catch(() => null);
    const code = isRecord(body) ? body['code'] : undefined;
    const wait = Number(res.headers.get('retry-after'));

    return new SharesError(typeof code === 'string' && CODE.test(code) ? code : 'backend_refused', {
        status: res.status,
        retryable: isRecord(body) && body['retryable'] === true,
        ...(Number.isFinite(wait) && wait > 0 ? { retryAfterS: wait } : {}),
    });
};

const send = async (
    backend: SharesBackend,
    path: string,
    init: { method?: string; body?: unknown; token?: string } = {},
): Promise<Response> => {
    const headers = new Headers({ accept: 'application/json' });

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
            signal: backend.signal,
        });
    } catch (error) {
        const timedOut =
            error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError');

        throw new SharesError(timedOut ? 'backend_timeout' : 'backend_unreachable');
    }

    if (!res.ok) {
        throw await refusalOf(res);
    }

    return res;
};

const json = async (res: Response): Promise<Record<string, unknown>> => {
    const body: unknown = await res.json().catch(() => null);

    if (!isRecord(body)) {
        throw new SharesError('backend_invalid');
    }

    return body;
};

const frameOf = (value: unknown): FrameRef | null =>
    isRecord(value) &&
    typeof value['spec_id'] === 'string' &&
    typeof value['content_version'] === 'string'
        ? { spec_id: value['spec_id'], content_version: value['content_version'] }
        : null;

const slotOf = (value: unknown): RecordSlot => {
    if (!isRecord(value) || !Number.isSafeInteger(value['slot'])) {
        throw new SharesError('backend_invalid');
    }

    const card = value['card'];

    if (card === null) {
        return { slot: value['slot'] as number, card: null };
    }

    if (
        !isRecord(card) ||
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

/** Make a share. Returns its id and write token. */
export const createShare = async (
    backend: SharesBackend,
    { kind, latest, title, cards, payload }: CreateShareBody,
): Promise<{ id: string; writeToken: string }> => {
    const body = await json(
        await send(backend, '/api/presentation/shares', {
            method: 'POST',
            body: {
                kind,
                latest,
                title: title.trim().slice(0, MAX_TITLE) || null,
                cards,
                payload,
            },
        }),
    );
    const { id, write_token: writeToken } = body;

    if (typeof id !== 'string' || !SHARE_ID.test(id) || typeof writeToken !== 'string') {
        throw new SharesError('backend_invalid');
    }

    return { id, writeToken };
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

/** What slot `slot` (from 1) of a share serves now. Reading it is what has
 *  dfo-apis check a live slot for newer data, at most once per 15 minutes,
 *  and record the frame in the share's history. */
export const readSlot = async (
    backend: SharesBackend,
    id: string,
    slot: number,
): Promise<SlotServed> => {
    const body = await json(await send(backend, `${sharePath(id)}/slots/${slot}/data?format=json`));
    const { component_id: componentId, revision, freshness } = body;
    const frame = frameOf(body['frame']);

    if (
        typeof componentId !== 'string' ||
        !Number.isSafeInteger(revision) ||
        !frame ||
        (freshness !== 'current' && freshness !== 'stale' && freshness !== 'pending')
    ) {
        throw new SharesError('backend_invalid');
    }

    return { componentId, revision: revision as number, frame, freshness };
};

/**
 * Make a share and keep its write token for `userId`, the signed-in maker.
 * A guest's share (`userId` null) keeps no token, so nobody can change or
 * remove it.
 */
export const createOwnedShare = async (
    { db, backend }: { db: ShareTokenDb; backend: SharesBackend },
    userId: string | null,
    body: CreateShareBody,
): Promise<{ id: string }> => {
    const { id, writeToken } = await createShare(backend, body);

    if (userId) {
        await putShareToken(db, { shareId: id, userId, writeToken });
    }

    return { id };
};

/**
 * A signed-in owner's write to their own share: `snapshot` turns a live
 * share into a snapshot under the same URLs, `delete` takes it down and
 * drops the token. `not_found` covers a share that does not exist, one the
 * caller holds no token for, and one whose token dfo-apis refuses, so the
 * answer does not reveal which ids are taken. Any other refusal throws.
 */
export const ownerShareWrite = async (
    { db, backend }: { db: ShareTokenDb; backend: SharesBackend },
    { shareId, userId, action }: { shareId: string; userId: string; action: 'snapshot' | 'delete' },
): Promise<'done' | 'not_found'> => {
    if (!SHARE_ID.test(shareId)) {
        return 'not_found';
    }

    const token = await readShareToken(db, { shareId, userId });

    if (!token) {
        return 'not_found';
    }

    try {
        await send(
            backend,
            action === 'delete' ? sharePath(shareId) : `${sharePath(shareId)}/snapshot`,
            { method: action === 'delete' ? 'DELETE' : 'POST', token },
        );
    } catch (error) {
        if (!(error instanceof SharesError) || (error.status !== 404 && error.status !== 403)) {
            throw error;
        }

        // The share is gone, or the token no longer grants it.
        await deleteShareToken(db, { shareId, userId });

        return 'not_found';
    }

    if (action === 'delete') {
        await deleteShareToken(db, { shareId, userId });
    }

    return 'done';
};
