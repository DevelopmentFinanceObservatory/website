import { eq } from 'drizzle-orm';

import { share } from '../../../db/schema.ts';
import type { SavedConversation } from '../chat/history.ts';
import { isLiveStudioShare } from '../chat/shareMode.ts';
import type { ShareDb } from '../chat/shareWrites.ts';
import type { CardRef, Widget } from '../chat/widgets.ts';
import {
    BackendError,
    bounded,
    isServiceRef,
    liveBackendFrom,
    livePrincipal,
    readComponent,
    refreshDerived,
    refreshFrame,
    renderedExport,
    renderOnFrame,
    storedExport,
    type DrawnCard,
    type LiveBackend,
    type LiveCard,
} from './liveBackend.ts';
import { dataCardsOf } from './liveCards.ts';
import {
    leasedResult,
    liveWindowSeconds,
    pendingSeconds,
    REFRESH_DEADLINE_MS,
    ShareGone,
    storedResult,
    type LiveResult,
} from './liveShareResults.ts';

/**
 * A live Studio share's server side: what a share must hold to be live, the
 * refresh of one card on current data, and that card's rows.
 *
 * A live share's row is the browser's JSON, so the server takes one thing
 * from it, each data card's `ref` (a component id and a revision). The frame
 * a card stands on is read from that revision's stored intent in dfo-apis.
 * A card on a dataset frame (`spec_`) is checked by dfo-apis and, when the
 * data moved, drawn on the current frame. A card on a derived frame (`ops_`)
 * is checked and replayed by dfo-ai. A card whose data has not moved is the
 * stored revision's own read from dfo-apis, so no answer draws on the row's
 * numbers.
 *
 * `refreshResponse` and `dataResponse` are the bodies of
 * `POST /api/share/[id]/cards/[cardId]/refresh` and
 * `GET /api/share/[id]/cards/[cardId]/data`. They take the database handle,
 * the environment, and `fetch`, so `node --test` runs them against a test
 * database and a stubbed back end.
 */

type Env = Record<string, string | undefined>;

// `exportDeadlineMs` ends a stalled export (`EXPORT_DEADLINE_MS` when left
// out). A test shortens it.
export type LiveDeps = {
    db: ShareDb;
    env: Env;
    fetch: typeof fetch;
    exportDeadlineMs?: number;
};

// A viewer opening a live canvas starts one refresh per data card, and each
// can cost dfo-apis a head check and a render, so the cap bounds a share's
// cost to this many back-end refreshes per window.
export const LIVE_SHARE_MAX_DATA_CARDS = 20;

// The component reads that vet a new live share share this deadline.
const CREATE_CHECK_DEADLINE_MS = 15_000;

const SHARE_ID = /^[A-Za-z0-9]{8}$/;

/** Whether this deployment can make and serve live Studio shares: it holds
 *  the credential dfo-apis and dfo-ai ask of a refresh. */
export const liveSharingAvailable = (env: Env = process.env): boolean =>
    livePrincipal(env) !== null;

// A card's ref, when it names a component revision in the service's own form
// (`isServiceRef`), because the stored row is the browser's JSON and its ids
// end up in the paths of credentialed calls.
const refOf = (widget: Widget): CardRef | null => {
    const ref = widget.kind === 'text' ? undefined : widget.ref;

    return ref && isServiceRef(ref)
        ? { component_id: ref.component_id, revision: ref.revision }
        : null;
};

const isDatasetFrame = (specId: string): boolean => specId.startsWith('spec_');
const isDerivedFrame = (specId: string): boolean => specId.startsWith('ops_');

export type BlockedCard = {
    id: string;
    reason: 'missing_ref' | 'unknown_component' | 'unsupported_frame';
};

export type LiveShareRefusal =
    | { status: 503; body: { error: 'live_unavailable' } }
    | { status: 400; body: { error: 'live_too_many_cards'; limit: number; count: number } }
    | { status: 400; body: { error: 'live_cards_blocked'; cards: BlockedCard[] } }
    | { status: 502; body: { error: 'live_check_failed' } };

const blockOf = async (backend: LiveBackend, widget: Widget): Promise<BlockedCard | null> => {
    const ref = refOf(widget);

    if (!ref) {
        return { id: widget.id, reason: 'missing_ref' };
    }

    try {
        const { frame } = await readComponent(backend, ref);
        const refreshable =
            frame && (isDatasetFrame(frame.spec_id) || isDerivedFrame(frame.spec_id));

        return refreshable ? null : { id: widget.id, reason: 'unsupported_frame' };
    } catch (error) {
        // A 4xx is dfo-apis saying the ref names no component of its own.
        if (error instanceof BackendError && error.status && error.status < 500) {
            return { id: widget.id, reason: 'unknown_component' };
        }

        throw error;
    }
};

/**
 * Why `saved`, the pruned copy a share would store, cannot be a live share,
 * or null when it can: the deployment holds the credential, the canvas is
 * within the card cap, and every data card names a component revision in
 * dfo-apis that stands on a frame a refresh can check. No refresh runs here.
 */
export const liveShareRefusal = async (
    { env, fetch: fetcher }: Pick<LiveDeps, 'env' | 'fetch'>,
    saved: SavedConversation,
): Promise<LiveShareRefusal | null> => {
    const backend = liveBackendFrom(env, fetcher);

    if (!backend) {
        return { status: 503, body: { error: 'live_unavailable' } };
    }

    const cards = dataCardsOf(saved);

    if (cards.length > LIVE_SHARE_MAX_DATA_CARDS) {
        return {
            status: 400,
            body: {
                error: 'live_too_many_cards',
                limit: LIVE_SHARE_MAX_DATA_CARDS,
                count: cards.length,
            },
        };
    }

    const limited = bounded(backend, CREATE_CHECK_DEADLINE_MS);

    try {
        const blocked = (await Promise.all(cards.map((card) => blockOf(limited, card)))).filter(
            (block) => block !== null,
        );

        return blocked.length
            ? { status: 400, body: { error: 'live_cards_blocked', cards: blocked } }
            : null;
    } catch (error) {
        console.error('live share: card check failed', {
            error: error instanceof BackendError ? error.code : error,
        });

        return { status: 502, body: { error: 'live_check_failed' } };
    }
};

// The card's download exports the frame its render names.
const redrawn = ({ card, frame }: DrawnCard): LiveResult =>
    frame ? { status: 'redrawn', card, frame } : { status: 'error', code: 'backend_invalid' };

/**
 * One card of a live share on current data. Every failure, timeout, or
 * refusal of a back end is an `error` answer with its code.
 */
export const refreshCard = async (backend: LiveBackend, ref: CardRef): Promise<LiveResult> => {
    const limited = bounded(backend, REFRESH_DEADLINE_MS);

    try {
        const stored = await readComponent(limited, ref);

        if (stored.frame && isDatasetFrame(stored.frame.spec_id)) {
            const verdict = await refreshFrame(limited, stored.frame);

            if (verdict.status === 'pending') {
                return { status: 'pending', retryAfterS: pendingSeconds(verdict.retryAfterS) };
            }

            if (verdict.status === 'current') {
                return { status: 'current', card: stored.card };
            }

            return redrawn(await renderOnFrame(limited, ref, verdict.frame));
        }

        if (stored.frame && isDerivedFrame(stored.frame.spec_id)) {
            const verdict = await refreshDerived(limited, ref);

            if (verdict.status === 'pending') {
                return { status: 'pending', retryAfterS: pendingSeconds(verdict.retryAfterS) };
            }

            if (verdict.status === 'current') {
                return { status: 'current', card: stored.card };
            }

            return redrawn(verdict.drawn);
        }

        return { status: 'error', code: 'frame_unsupported' };
    } catch (error) {
        if (error instanceof BackendError) {
            return {
                status: 'error',
                code: error.code,
                ...(error.retryable ? { retryable: true } : {}),
            };
        }

        throw error;
    }
};

/** The ref of a data card a live share holds, or null: no such share, a
 *  share that is not a live canvas or card, or no such data card with a ref. */
const liveCardRef = async (
    db: ShareDb,
    shareId: string,
    cardId: string,
): Promise<CardRef | null> => {
    if (!SHARE_ID.test(shareId)) {
        return null;
    }

    const [row] = await db
        .select({ kind: share.kind, mode: share.mode, data: share.data })
        .from(share)
        .where(eq(share.id, shareId))
        .limit(1);

    if (!row || !isLiveStudioShare(row)) {
        return null;
    }

    const card = dataCardsOf(row.data as SavedConversation).find((widget) => widget.id === cardId);

    return card ? refOf(card) : null;
};

const NOT_CONFIGURED: LiveResult = { status: 'error', code: 'live_unavailable' };

const NO_STORE = { 'Cache-Control': 'no-store' };

const notFound = (): Response =>
    Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });

export type RefreshAnswer = {
    status: LiveResult['status'];
    card?: LiveCard;
    // A pending answer's wait, or how long an error answer stands.
    retry_after_s?: number;
    code?: string;
    retryable?: true;
};

const answerOf = (result: LiveResult): RefreshAnswer => ({
    status: result.status,
    ...('card' in result ? { card: result.card } : {}),
    ...(result.status === 'pending' ? { retry_after_s: result.retryAfterS } : {}),
    ...(result.status === 'error'
        ? {
              code: result.code,
              ...(result.retryable ? { retryable: true as const } : {}),
              ...(result.retryAfterS ? { retry_after_s: result.retryAfterS } : {}),
          }
        : {}),
});

/**
 * `POST /api/share/[id]/cards/[cardId]/refresh`. 404 unless the share is
 * live and holds the card as a data card with a ref. Otherwise 200 with the
 * card's answer, which is `error` with a code when the card could not be
 * refreshed, so one failing card leaves the rest of the page standing.
 */
export const refreshResponse = async (
    { db, env, fetch: fetcher }: LiveDeps,
    shareId: string,
    cardId: string,
): Promise<Response> => {
    const ref = await liveCardRef(db, shareId, cardId);

    if (!ref) {
        return notFound();
    }

    const backend = liveBackendFrom(env, fetcher);

    try {
        const result = backend
            ? await leasedResult(db, { shareId, cardId }, liveWindowSeconds(env), () =>
                  refreshCard(backend, ref),
              )
            : NOT_CONFIGURED;

        return Response.json(answerOf(result), { headers: NO_STORE });
    } catch (error) {
        // The owner deleted the share, or switched it to snapshot, since the
        // card was found.
        if (error instanceof ShareGone) {
            return notFound();
        }

        throw error;
    }
};

// One export call. dfo-apis stops a component route at 30 seconds
// (`PRESENTATION_COMPONENTS_TIMEOUT_SECONDS`) and answers `timeout`, so the
// site waits 5 seconds longer for that answer, and ends a stalled call
// before it holds a public request open, well inside the 75 second refresh
// deadline.
export const EXPORT_DEADLINE_MS = 35_000;

const EXPORT_HEADERS = ['content-type', 'content-disposition', 'content-length'];

// The statuses with which dfo-apis refuses an export request itself: a
// format it cannot write, or rows that are gone.
const REQUEST_REFUSALS = [400, 404, 422];

// A download that cannot be served answers JSON under an error status, so a
// browser does not save it as the file: 503 with Retry-After while the
// card's refresh is pending, dfo-apis' own status for a refusal of the
// export request (`REQUEST_REFUSALS`), and 502 for everything else.
const noFile = (result: LiveResult & { status: 'pending' | 'error' }, status = 502): Response =>
    result.status === 'pending'
        ? Response.json(answerOf(result), {
              status: 503,
              headers: { ...NO_STORE, 'Retry-After': String(result.retryAfterS) },
          })
        : Response.json(answerOf(result), { status, headers: NO_STORE });

/**
 * `GET /api/share/[id]/cards/[cardId]/data?format=&bundle=`. The rows of
 * the card the last refresh answered with, from dfo-apis' export on the
 * frame a `redrawn` card was drawn on, or from the public export of the
 * stored revision for a `current` card. A card with no such answer is
 * refreshed first.
 */
export const dataResponse = async (
    { db, env, fetch: fetcher, exportDeadlineMs = EXPORT_DEADLINE_MS }: LiveDeps,
    shareId: string,
    cardId: string,
    query: URLSearchParams,
): Promise<Response> => {
    const ref = await liveCardRef(db, shareId, cardId);

    if (!ref) {
        return notFound();
    }

    const backend = liveBackendFrom(env, fetcher);

    if (!backend) {
        return noFile({ status: 'error', code: 'live_unavailable' });
    }

    const key = { shareId, cardId };
    const stored = await storedResult(db, key);
    let result: LiveResult;

    try {
        result =
            stored?.status === 'current' || stored?.status === 'redrawn'
                ? stored
                : await leasedResult(db, key, liveWindowSeconds(env), () =>
                      refreshCard(backend, ref),
                  );
    } catch (error) {
        if (error instanceof ShareGone) {
            return notFound();
        }

        throw error;
    }

    if (result.status === 'pending' || result.status === 'error') {
        return noFile(result);
    }

    const options = {
        format: query.get('format') ?? undefined,
        bundle: query.get('bundle') ?? undefined,
    };

    const exporting = bounded(backend, exportDeadlineMs);

    try {
        const upstream =
            result.status === 'redrawn'
                ? await renderedExport(exporting, ref, result.frame, options)
                : await storedExport(exporting, ref, options);
        const headers = new Headers(NO_STORE);

        for (const name of EXPORT_HEADERS) {
            const value = upstream.headers.get(name);

            if (value) {
                headers.set(name, value);
            }
        }

        return new Response(upstream.body, { headers });
    } catch (error) {
        if (!(error instanceof BackendError)) {
            throw error;
        }

        const status = REQUEST_REFUSALS.find((refusal) => refusal === error.status) ?? 502;

        return noFile(
            { status: 'error', code: error.code, ...(error.retryable ? { retryable: true } : {}) },
            status,
        );
    }
};
