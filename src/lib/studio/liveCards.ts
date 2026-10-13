import { canvasWidgetsOf } from '../chat/canvas.ts';
import type { SavedConversation } from '../chat/history.ts';
import { isLiveStudioShare, type StudioShareKind } from '../chat/shareMode.ts';
import type { CardInfo, Widget } from '../chat/widgets.ts';
import { shortDateText } from '../sources/updateDates.ts';
import type { LiveCard } from './liveBackend.ts';
import type { Description } from './description.ts';
import { cardDescription } from './infoPanel.ts';
import { describedBy, payloadDescription, payloadProvenance } from './payload.ts';
import { reviseWidget } from './widgets.ts';
import type { FactSummary } from './wire.ts';

/**
 * A live Studio share's viewer side: what the share pages hand the browser,
 * and how the browser fills each data card from
 * `POST /api/share/[id]/cards/[cardId]/refresh`.
 *
 * A live share's stored copy holds the numbers its cards showed when it was
 * made. `sharedViewOf` withholds them on the server, so neither the HTML nor
 * the props of `/s/[id]` and `/embed/[id]` carry them. Every data card
 * arrives as a held card, which keeps its id, kind, turn, and `ref` and
 * nothing it showed. `refreshLiveCards` then asks the refresh route for each
 * card, and `widgetFromLiveCard` draws the answer onto the held card. Text
 * cards, notes, title overrides, views, layout, and pins are the user's own
 * words and choices and pass through as stored.
 *
 * The module has no database, React, or path-alias dependency, so the share
 * pages, the client hook (`useLiveCards`), and `node --test` all import it.
 */

/** What a share page hands `Studio` or `EmbedView`. `createdAt` is an ISO
 *  timestamp: the moment the share's text was written. */
export type SharedView = {
    id: string;
    kind: StudioShareKind;
    saved: SavedConversation;
    live: boolean;
    createdAt: string;
};

type StoredWidget = SavedConversation['widgets'][number];

// A data card with everything it showed left out. The kind and the chart
// type stay because they are the card's shape (its footprint on the sheet
// and its natural view), and `ref` because it names what the card draws.
const heldCard = (widget: StoredWidget): StoredWidget => {
    const { id, turn } = widget;

    switch (widget.kind) {
        case 'text':
            return widget;
        case 'key_number':
            return { kind: 'key_number', id, turn, label: '', value: '', ref: widget.ref };
        case 'chart':
            return {
                kind: 'chart',
                id,
                turn,
                chartType: widget.chartType,
                title: '',
                categories: [],
                series: [],
                ref: widget.ref,
            };
        case 'table':
            return { kind: 'table', id, turn, title: '', columns: [], rows: [], ref: widget.ref };
    }
};

/** A stored canvas with every data card held: no title, value, series, row,
 *  source, or info a card showed when the share was made. */
export const withholdCardData = (saved: SavedConversation): SavedConversation => ({
    ...saved,
    widgets: (saved.widgets ?? []).map(heldCard),
});

/**
 * A stored Studio share as its page passes it to the client. A snapshot is
 * the stored copy itself. A live share (`isLiveStudioShare`) is the stored
 * copy with its data cards held.
 */
export const sharedViewOf = (row: {
    id: string;
    kind: string;
    mode: string | null;
    data: unknown;
    createdAt: Date;
}): SharedView => {
    const live = isLiveStudioShare(row);
    const saved = row.data as SavedConversation;

    return {
        id: row.id,
        kind: row.kind as StudioShareKind,
        saved: live ? withholdCardData(saved) : saved,
        live,
        createdAt: row.createdAt.toISOString(),
    };
};

/**
 * One data card of a live share, as the card components see it. `ready`
 * carries the refresh route's card, whose `payload.provenance` names the
 * frame it was drawn on, the revision it was refreshed from, and its
 * warnings. `error` carries the route's `code`, or one of
 * `LIVE_CLIENT_CODES`; `retryable` when the back end said asking again
 * might succeed; and `retryAt`, the moment (`LiveDeps.now`) from which a
 * request reaches the back end again, because the route stands on the
 * error it stored until then.
 */
export type LiveCardState =
    | { status: 'loading' }
    | { status: 'ready'; outcome: 'current' | 'redrawn'; card: LiveCard }
    | { status: 'error'; code: string; retryable?: boolean; retryAt?: number };

/** A settled card is every `LiveCardState` but `loading`. */
export type LiveCardOutcome = Exclude<LiveCardState, { status: 'loading' }>;

/** The live share a canvas is showing: its id, the moment it was made, the
 *  state of each of its data cards by widget id, and `retry`, which asks the
 *  refresh route for one failed card again. */
export type LiveCanvas = {
    shareId: string;
    createdAt: string | undefined;
    states: Record<string, LiveCardState>;
    retry: (cardId: string) => void;
};

/** What one card of a live canvas is told about itself. Absent on a text
 *  card and on every card of a snapshot. */
export type CardLive = {
    shareId: string;
    createdAt: string | undefined;
    state: LiveCardState;
    retry: () => void;
};

export const cardLiveOf = (
    canvas: LiveCanvas | undefined,
    cardId: string,
): CardLive | undefined => {
    const state = canvas?.states[cardId];

    return canvas && state
        ? {
              shareId: canvas.shareId,
              createdAt: canvas.createdAt,
              state,
              retry: () => canvas.retry(cardId),
          }
        : undefined;
};

/** Whether a canvas carries the live note, which takes a live share with at
 *  least one data card on it. */
export const isLiveCanvas = (canvas: LiveCanvas | undefined): canvas is LiveCanvas =>
    canvas !== undefined && Object.keys(canvas.states).length > 0;

/**
 * The line a live canvas shows once. It says its data is current and its
 * titles and notes are as old as the share. The date is the UTC day of `createdAt`,
 * so the server's render and the browser's agree.
 */
export const liveNote = (createdAt: string | undefined): string => {
    const written = createdAt ? new Date(createdAt) : null;

    return written && !Number.isNaN(written.getTime())
        ? `Live data · titles and notes written ${shortDateText(written)}`
        : 'Live data';
};

/** The error codes the browser sets itself. Every other code is the refresh
 *  route's own. */
export const LIVE_CLIENT_CODES = {
    // No response from the site.
    network: 'network_error',
    // The card was still pending when `LIVE_PENDING_CEILING_MS` ran out.
    timeout: 'refresh_timeout',
    // A response outside the route's contract.
    invalid: 'refresh_invalid',
    // A non-2xx response that names no code.
    failed: 'refresh_failed',
    // The answer's payload resolves no component of the card's kind.
    unreadable: 'card_unreadable',
} as const;

/** What a failed card tells its reader, and whether asking again can help. */
export type LiveCardFailure = { message: string; retry: boolean };

const FAILURE_TRANSIENT: LiveCardFailure = {
    message: 'Current data is temporarily unavailable. Try again later.',
    retry: true,
};
const FAILURE_SWITCHED_OFF: LiveCardFailure = {
    message: 'Live data is unavailable for this link.',
    retry: false,
};
const FAILURE_PERMANENT: LiveCardFailure = {
    message: 'This card can no longer be refreshed.',
    retry: false,
};

// A fault of transport, time, or a back end's own health, so the same
// request can succeed later. The site's own codes, the browser's, and dfo-ai's
// `upstream_unavailable` (no answer from dfo-apis, a 5xx, or a refusal it
// marks retryable). A dfo-apis refusal is classed by its own `retryable`
// instead, which the route passes on.
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
    'backend_unreachable',
    'backend_timeout',
    'backend_refused',
    'backend_invalid',
    'refresh_failed',
    LIVE_CLIENT_CODES.network,
    LIVE_CLIENT_CODES.timeout,
    LIVE_CLIENT_CODES.invalid,
    'upstream_unavailable',
]);

// The site holds no credential, or a back end refuses the one it holds
// (dfo-apis' `refresh_not_permitted`, dfo-ai's `unauthorized`), or dfo-ai
// has no dfo-apis credential of its own (`refresh_not_configured`).
const SWITCHED_OFF_CODES: ReadonlySet<string> = new Set([
    'live_unavailable',
    'refresh_not_permitted',
    'unauthorized',
    'refresh_not_configured',
]);

/**
 * What a card's error says about asking again. `transient`: the same request
 * can succeed later, because the back end said so (`retryable`) or the code
 * is one of the site's, the browser's, or dfo-ai's transient codes.
 * `switched_off`: the site cannot refresh any card. `permanent`: every other
 * refusal, one that names the card itself (its component, frame, or recipe
 * is gone or cannot be redrawn), which the same request meets again.
 */
export type LiveFailureKind = 'transient' | 'switched_off' | 'permanent';

export const liveFailureKind = ({
    code,
    retryable = false,
}: {
    code: string;
    retryable?: boolean;
}): LiveFailureKind => {
    // A back end that says asking again might succeed is believed, whatever
    // its code, and dfo-apis' problem body carries it on every refusal.
    if (retryable || TRANSIENT_CODES.has(code)) {
        return 'transient';
    }

    return SWITCHED_OFF_CODES.has(code) ? 'switched_off' : 'permanent';
};

const FAILURES: Record<LiveFailureKind, LiveCardFailure> = {
    transient: FAILURE_TRANSIENT,
    switched_off: FAILURE_SWITCHED_OFF,
    permanent: FAILURE_PERMANENT,
};

/** The message for a failed card. */
export const liveCardFailure = (error: { code: string; retryable?: boolean }): LiveCardFailure =>
    FAILURES[liveFailureKind(error)];

/** How many refresh requests one canvas has in flight at once. */
export const LIVE_REFRESH_CONCURRENCY = 4;

/** How long a card may stay pending, from its first request, before it
 *  shows an error. */
export const LIVE_PENDING_CEILING_MS = 180_000;

// The route's own deadline for a refresh is 75 seconds (`REFRESH_DEADLINE_MS`).
const REQUEST_TIMEOUT_MS = 90_000;

// The route sends 2 to 60. A value outside that is held to it.
const RETRY_MIN_S = 2;
const RETRY_MAX_S = 60;
const RETRY_DEFAULT_S = 5;

export type LiveDeps = {
    fetch: typeof fetch;
    now: () => number;
    // Resolves after `ms`, or at once when `signal` aborts.
    sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

type ErrorAnswer = { status: 'error'; code: string; retryable?: boolean; retryAfterS?: number };

type Answer =
    | Exclude<LiveCardOutcome, { status: 'error' }>
    | ErrorAnswer
    | { status: 'pending'; retryAfterMs: number };

const failure = (code: string): ErrorAnswer => ({ status: 'error', code });

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isLiveCard = (value: unknown): value is LiveCard =>
    isRecord(value) &&
    typeof value['component_id'] === 'string' &&
    Number.isInteger(value['revision']) &&
    isRecord(value['payload']) &&
    isRecord(value['fact_summary']);

const readAnswer = (ok: boolean, body: unknown): Answer => {
    if (!isRecord(body)) {
        return failure(ok ? LIVE_CLIENT_CODES.invalid : LIVE_CLIENT_CODES.failed);
    }

    if (!ok) {
        const { error } = body;

        return failure(typeof error === 'string' && error ? error : LIVE_CLIENT_CODES.failed);
    }

    const { status, card, code } = body;

    if ((status === 'current' || status === 'redrawn') && isLiveCard(card)) {
        return { status: 'ready', outcome: status, card };
    }

    if (status === 'pending') {
        const seconds = body['retry_after_s'];
        const held =
            typeof seconds === 'number' && Number.isFinite(seconds)
                ? Math.min(Math.max(seconds, RETRY_MIN_S), RETRY_MAX_S)
                : RETRY_DEFAULT_S;

        return { status: 'pending', retryAfterMs: held * 1000 };
    }

    if (status === 'error') {
        const wait = body['retry_after_s'];

        return {
            ...failure(typeof code === 'string' && code ? code : LIVE_CLIENT_CODES.failed),
            ...(body['retryable'] === true ? { retryable: true } : {}),
            ...(typeof wait === 'number' && Number.isFinite(wait) && wait > 0
                ? { retryAfterS: wait }
                : {}),
        };
    }

    return failure(LIVE_CLIENT_CODES.invalid);
};

export const refreshUrl = (shareId: string, cardId: string): string =>
    `/api/share/${encodeURIComponent(shareId)}/cards/${encodeURIComponent(cardId)}/refresh`;

const askOnce = async (
    { fetch: fetcher }: LiveDeps,
    url: string,
    signal: AbortSignal,
): Promise<Answer> => {
    try {
        const response = await fetcher(url, {
            method: 'POST',
            signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        });

        return readAnswer(response.ok, await response.json().catch(() => null));
    } catch {
        // No response: the network failed, the request timed out, or the
        // caller aborted (and then discards the answer).
        return failure(LIVE_CLIENT_CODES.network);
    }
};

type Gate = <T>(task: () => Promise<T>) => Promise<T>;

// At most `max` tasks run at once. A finishing task hands its place to the
// longest waiter, so a late caller cannot take it first.
const gateOf = (max: number): Gate => {
    let running = 0;
    const waiting: (() => void)[] = [];

    return async (task) => {
        if (running < max) {
            running += 1;
        } else {
            await new Promise<void>((resolve) => waiting.push(resolve));
        }

        try {
            return await task();
        } finally {
            const next = waiting.shift();

            if (next) {
                next();
            } else {
                running -= 1;
            }
        }
    };
};

// One card to its settled answer. A pending card waits out the route's
// `retry_after_s` outside the gate, so it holds no request slot meanwhile.
const refreshLiveCard = async (
    deps: LiveDeps,
    gate: Gate,
    url: string,
    signal: AbortSignal,
): Promise<LiveCardOutcome> => {
    const started = deps.now();

    for (;;) {
        const answer = await gate(() => askOnce(deps, url, signal));

        if (answer.status === 'error') {
            const { retryAfterS, ...error } = answer;

            return {
                ...error,
                ...(retryAfterS ? { retryAt: deps.now() + retryAfterS * 1000 } : {}),
            };
        }

        if (answer.status !== 'pending') {
            return answer;
        }

        if (deps.now() - started + answer.retryAfterMs > LIVE_PENDING_CEILING_MS) {
            return { status: 'error', code: LIVE_CLIENT_CODES.timeout };
        }

        await deps.sleep(answer.retryAfterMs, signal);

        if (signal.aborted) {
            return { status: 'error', code: LIVE_CLIENT_CODES.network };
        }
    }
};

/**
 * Refresh the named cards of a live share, `LIVE_REFRESH_CONCURRENCY`
 * requests at a time, and report each card through `onSettled` as soon as
 * its own answer arrives. A `pending` answer is asked again after its
 * `retry_after_s` until `LIVE_PENDING_CEILING_MS` has passed since the
 * card's first request. Every failure is that card's `error` outcome. After
 * `signal` aborts nothing more is reported. Resolves when every card has
 * settled.
 */
export const refreshLiveCards = async (
    deps: LiveDeps,
    {
        shareId,
        cardIds,
        signal,
        onSettled,
    }: {
        shareId: string;
        cardIds: string[];
        signal: AbortSignal;
        onSettled: (cardId: string, outcome: LiveCardOutcome) => void;
    },
): Promise<void> => {
    const gate = gateOf(LIVE_REFRESH_CONCURRENCY);

    await Promise.all(
        cardIds.map(async (cardId) => {
            const outcome = await refreshLiveCard(deps, gate, refreshUrl(shareId, cardId), signal);

            if (!signal.aborted) {
                onSettled(cardId, outcome);
            }
        }),
    );
};

// The card face and its More Info read the Studio stream's fact summary,
// which carries an attribution that dfo-apis' closed summary does not. The
// attribution is built from the envelope's sources and the summary's
// StatVars. The summary's `unit` text is one of the shapes the Studio
// summary's `unit` takes, so it passes through as dfo-apis gave it.
const factsOf = (
    { component_id, revision, payload, fact_summary: facts }: LiveCard,
    description: Description | undefined,
): FactSummary => {
    // A described card names its sources in its description; its
    // provenance holds lineage only.
    const sources = description
        ? description.sources.map(({ label }) => label)
        : (payloadProvenance(payload)?.sources ?? []).map(({ name }) => name);
    const indicators = new Set(
        facts.series.map(({ coordinates }) => coordinates['stat_var']).filter(Boolean),
    );

    return {
        component_id,
        revision,
        series: facts.series.map(({ id, label, point_count }) => ({ id, label, point_count })),
        attribution: {
            label: sources.join(', '),
            source_count: sources.length,
            indicator_count: indicators.size,
        },
        window: facts.window,
        unit: facts.unit,
    };
};

/**
 * A held card drawn from the refresh route's card: title, drawing, values,
 * `ref`, `frame`, `source`, and `info` all come from the answer, through
 * `reviseWidget`. Null when the answer's payload resolves no component of
 * the held card's kind, which leaves nothing to draw.
 */
export const widgetFromLiveCard = (held: Widget, card: LiveCard): Widget | null => {
    try {
        // The route's card is a component revision without the stream's
        // envelope fields, which `reviseWidget` does not read.
        const read = payloadDescription(card.payload);
        const drawn = reviseWidget(
            held,
            {
                event: 'component.revised',
                seq: 0,
                changed: [],
                component_id: card.component_id,
                revision: card.revision,
                payload: card.payload,
                fact_summary: factsOf(card, describedBy(read)),
            },
            read,
        );

        return drawn.kind !== 'text' && drawn.data ? drawn : null;
    } catch {
        // A payload or fact summary outside the platform's shape.
        return null;
    }
};

/** What a card's data leaves out, one sentence each, wherever the card is
 *  shown: the owner's Studio, a snapshot, an embed, or a live share. A
 *  described card reads the sentences of its coverage gaps, and its other
 *  caveats stay in More Info. A legacy card reads the coverage gaps its
 *  provenance warned of. */
export const leftOutOf = (
    info: Pick<CardInfo, 'leftOut' | 'description'> | null | undefined,
): string[] => {
    const description = info && cardDescription(info);

    return description
        ? description.caveats.filter(({ kind }) => kind === 'coverage_gap').map(({ text }) => text)
        : (info?.leftOut ?? []);
};

/** A data card of a live canvas: every card but the user's text cards and
 *  the agent's notes. */
export const isLiveDataCard = (widget: Widget): boolean => widget.kind !== 'text';

/** The cards of a shared canvas that draw data: every card the canvas shows
 *  (`canvasWidgetsOf`) other than a text card. */
export const dataCardsOf = (saved: SavedConversation): Widget[] =>
    canvasWidgetsOf(saved).filter(isLiveDataCard);
