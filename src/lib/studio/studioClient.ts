/**
 * Studio v1 transport: POST + SSE against the harness's `/api/studio/*`
 * routes, through our own Next proxy (same-origin, and the proxy adds the
 * bearer). Each `data:` line is one frame. Each `:`-prefixed keep-alive
 * comment goes to `onKeepAlive`, the page's sign that a quiet stream is still
 * open. A stream ends on `done`, on a pausing frame (`plan.proposed` or
 * `elicitation.request`, answered via `runInterrupt`) or on an `error` frame.
 * Transport failures surface as a synthetic `error` frame, so the UI has one
 * failure path.
 */

import type {
    ApplyChange,
    ApplyChoice,
    ApplyUnit,
    CancelRequest,
    ClientFeature,
    CompositionManifest,
    CompositionMutation,
    ConversationRead,
    InterruptResponse,
    MutationOperation,
    CardChanges,
    PlaceOption,
    PlacesLabel,
    PlacesOffer,
    PlacesOptions,
    PlanRevisionStaleError,
    ResumeRequest,
    StudioFrame,
    ToolError,
    TurnRequest,
    WindowOffer,
} from './wire';

import { asRecord } from '../asRecord.ts';
import { SIGN_IN_REQUIRED } from './studioAccess.ts';
import { isTextTooLong, TEXT_TOO_LONG_MESSAGE } from './interruptText.ts';
import type { LiveCard } from './liveBackend.ts';

/**
 * How long the page waits on a stop: a cancelled stream may run on this long
 * before the client closes it, and the cancel request is dropped after the
 * same time. The harness ends a cancelled stream within about 5 s.
 */
export const STOP_GRACE_MS = 10_000;

/**
 * How long the page waits on a stop of a plan-card switch. The harness reads
 * a stopped switch's stream on for up to its `SWITCH_REOFFER_SECONDS` (10 s)
 * to re-offer the plan, so this grace is that window plus 5 s for the
 * re-offer to arrive. A shorter one would close the stream on a live pause.
 */
export const SWITCH_STOP_GRACE_MS = 15_000;

const transportError = (detail: string): StudioFrame => ({
    event: 'error',
    seq: -1,
    error: {
        error: 'transient_unavailable',
        retry: 'retry_after_delay',
        detail,
    } as ToolError,
});

/** A problem document the site proxy answered with itself
 *  (src/lib/proxy/problem). It carries the `code`, the status of a harness
 *  that answered before the relay failed (`upstream_status`, null when the
 *  harness was not reached), and the Retry-After seconds. */
export type ProxyProblem = {
    code: string;
    upstreamStatus: number | null;
    retryAfterSeconds: number | null;
};

/** An HTTP refusal of a stream request: its status, the body's `detail`
 *  when it has one, the harness's ToolError when the body is one (with
 *  `current_plan` on a stale plan answer), and `proxy` when the site proxy
 *  refused the request itself. */
export type StreamRefusal = {
    status: number;
    detail: string | null;
    error: PlanRevisionStaleError | null;
    proxy?: ProxyProblem;
};

/** The response header every Studio stream names its turn's index in, from
 *  1. A refused request carries none. */
export const TURN_INDEX_HEADER = 'x-dfo-turn-index';

/** The turn index a stream's response names in TURN_INDEX_HEADER, or null
 *  when it names none or no positive integer. */
export const turnIndexOf = (headers: Headers): number | null => {
    const value = headers.get(TURN_INDEX_HEADER);
    const index = value !== null && /^\d+$/.test(value) ? Number(value) : 0;

    return index > 0 ? index : null;
};

/** What a stream reports to its caller. `onTurnIndex` hears the index of the
 *  turn an accepted stream carries, before its first frame. `onRefusal` sees
 *  an HTTP refusal, and `onUnreachable` a request that got no response at
 *  all (the fetch rejected), before the stream would report either as an
 *  `error` frame. Each returns true when it has dealt with it. `onBusyWait`
 *  hears the seconds a request waits because another stream holds the
 *  conversation (whileBusy), and null when the wait is over and the request
 *  goes again. Between the two the page holds no stream. */
export type StreamHandlers = {
    onFrame: (frame: StudioFrame) => void;
    onTurnIndex?: (index: number) => void;
    onKeepAlive?: () => void;
    onBusyWait?: (seconds: number | null) => void;
    onRefusal?: (refusal: StreamRefusal) => boolean;
    onUnreachable?: () => boolean;
    // A state read found the conversation begun afresh under its id, so the
    // stream's turn belongs to a session the harness dropped (carryOnTurn).
    onSessionGone?: () => void;
};

const asToolError = (body: unknown): PlanRevisionStaleError | null =>
    body !== null &&
    typeof body === 'object' &&
    typeof (body as ToolError).error === 'string' &&
    typeof (body as ToolError).detail === 'string'
        ? (body as ToolError)
        : null;

// The proxy's problem documents carry a `code` and no harness `error`.
const asProxyProblem = (body: unknown, headers: Headers): ProxyProblem | null => {
    if (body === null || typeof body !== 'object' || 'error' in body) {
        return null;
    }

    const { code, upstream_status: upstreamStatus } = body as Record<string, unknown>;
    const retryAfter = Number.parseInt(headers.get('retry-after') ?? '', 10);

    return typeof code === 'string'
        ? {
              code,
              upstreamStatus: typeof upstreamStatus === 'number' ? upstreamStatus : null,
              retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null,
          }
        : null;
};

const streamStudio = async (
    endpoint: 'turn' | 'interrupt' | 'resume',
    body: TurnRequest | InterruptResponse | ResumeRequest,
    { onFrame, onTurnIndex, onKeepAlive, onRefusal, onUnreachable }: StreamHandlers,
    signal?: AbortSignal,
): Promise<void> => {
    let res: Response;

    try {
        res = await fetch(`/api/studio/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify(body),
            signal,
        });
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw error;
        }

        if (!onUnreachable?.()) {
            onFrame(transportError((error as Error).message));
        }

        return;
    }

    if (!res.ok || !res.body) {
        let detail: string | null = null;
        let error: PlanRevisionStaleError | null = null;
        let proxy: ProxyProblem | null = null;
        let tooLong = false;

        try {
            const parsed = (await res.json()) as { detail?: unknown };

            tooLong = endpoint === 'interrupt' && isTextTooLong(res.status, parsed);

            error = asToolError(parsed);
            proxy = asProxyProblem(parsed, res.headers);

            if (typeof parsed.detail === 'string') {
                detail = parsed.detail;
            }
        } catch {
            // Non-JSON body — the status line stands.
        }

        if (
            !res.ok &&
            onRefusal?.({ status: res.status, detail, error, ...(proxy && { proxy }) })
        ) {
            return;
        }

        onFrame(transportError(tooLong ? TEXT_TOO_LONG_MESSAGE : (detail ?? `HTTP ${res.status}`)));

        return;
    }

    const turnIndex = turnIndexOf(res.headers);

    if (turnIndex !== null) {
        onTurnIndex?.(turnIndex);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const flush = (chunk: string) => {
        for (const line of chunk.split('\n')) {
            if (line.startsWith(':')) {
                onKeepAlive?.();
                continue;
            }

            if (!line.startsWith('data:')) {
                continue;
            }

            const payload = line.slice(5).trim();

            if (!payload) {
                continue;
            }

            try {
                onFrame(JSON.parse(payload) as StudioFrame);
            } catch {
                // A garbled line — skip it rather than kill the stream.
            }
        }
    };

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });

        let boundary: number;

        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            flush(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
        }
    }

    if (buffer.trim()) {
        flush(buffer);
    }
};

/** The question forms the Studio renders, sent on every turn and answer. */
export const CLIENT_FEATURES: ClientFeature[] = ['unit_question', 'multi_select'];

/** What a page asks of every stream it starts: `holdRemovals`, that the
 *  harness hold a removal's `composition.updated` until after the turn's
 *  next drawing line. A page that leaves it out sends the body without the
 *  member. */
export type StreamAsk = { holdRemovals?: boolean };

const askOf = ({ holdRemovals }: StreamAsk = {}) => (holdRemovals ? { hold_removals: true } : {});

/** Start (or continue) a turn. */
export const runTurn = (
    conversationId: string,
    message: string,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    extras?: Partial<
        Pick<
            TurnRequest,
            'component_ref' | 'auto_add' | 'surface' | 'seed_spec' | 'after_turn' | 'prompt_source'
        >
    >,
    ask?: StreamAsk,
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            message,
            ...extras,
            client_features: CLIENT_FEATURES,
            ...askOf(ask),
        },
        handlers,
        signal,
    );

/** Run a turn from a clicked `apply_choice` chip: the chip's choice, option,
 *  turn and reading, copied as offered, and no message. */
export const runApplyChoice = (
    conversationId: string,
    { choice_id, option_id, turn, spec_id }: ApplyChoice,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    ask?: StreamAsk,
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            apply_choice: { choice_id, option_id, turn, spec_id },
            client_features: CLIENT_FEATURES,
            ...askOf(ask),
        },
        handlers,
        signal,
    );

/** Run a turn that moves a card to another unit: the card, the reading it
 *  shows, the turn that drew it and the unit, and no message. */
export const runApplyUnit = (
    conversationId: string,
    { component_id, spec_id, turn, unit }: ApplyUnit,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    ask?: StreamAsk,
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            apply_unit: { component_id, spec_id, turn, unit },
            client_features: CLIENT_FEATURES,
            ...askOf(ask),
        },
        handlers,
        signal,
    );

/** Run a turn that changes a card's years or places: the card, the reading
 *  its offer names and the change, and no message. */
export const runApplyChange = (
    conversationId: string,
    { component_id, spec_id, change }: ApplyChange,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    ask?: StreamAsk,
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            apply_change: { component_id, spec_id, change },
            client_features: CLIENT_FEATURES,
            ...askOf(ask),
        },
        handlers,
        signal,
    );

/** Answer a pause; the response is a NEW stream continuing the same turn. */
export const runInterrupt = (
    conversationId: string,
    interruptId: string,
    reply: Pick<
        InterruptResponse,
        'decision' | 'payload' | 'answers' | 'choice_id' | 'option_id' | 'plan_revision' | 'unit'
    >,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    ask?: StreamAsk,
): Promise<void> =>
    streamStudio(
        'interrupt',
        {
            kind: 'interrupt.response',
            schema_version: 1,
            conversation_id: conversationId,
            interrupt_id: interruptId,
            ...reply,
            client_features: CLIENT_FEATURES,
            ...askOf(ask),
        },
        handlers,
        signal,
    );

/** Carry on the conversation's open turn `turnIndex`, which is running with
 *  no stream holding it; the response is a new stream continuing the turn. */
export const runResume = (
    conversationId: string,
    turnIndex: number,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    ask?: StreamAsk,
): Promise<void> =>
    streamStudio(
        'resume',
        {
            kind: 'turn.resume',
            schema_version: 1,
            conversation_id: conversationId,
            turn_index: turnIndex,
            ...askOf(ask),
        },
        handlers,
        signal,
    );

/**
 * The seconds to wait before asking again when `refusal` says another stream
 * holds the conversation (409 `transient_unavailable`), or null for any other
 * refusal. The wait is at least a second, so a lease about to lapse is not
 * asked about in a tight loop.
 */
export const busyRetryAfter = (refusal: StreamRefusal): number | null =>
    refusal.status === 409 && refusal.error?.error === 'transient_unavailable'
        ? Math.max(1, refusal.error.retry_after_seconds ?? 1)
        : null;

/**
 * Where a stream's request stands, which decides what Stop does
 * (stopAction). `unsent`: the request has not started, or it sleeps in
 * whileBusy because another stream holds the conversation. `sent`: a send is
 * on its way and the harness has not answered it. `admitted`: the harness
 * named the stream's turn (`onTurnIndex`) or sent a frame.
 */
export type RequestPhase = 'unsent' | 'sent' | 'admitted';

/**
 * What Stop does to a stream. `cancel` says when the harness is asked to
 * cancel the turn: `now`, `on-admit` (once the response names the turn), or
 * `none`. `abort` says when the request is closed: `now`, or `after-grace`,
 * reading the stream until the harness ends it (STOP_GRACE_MS). `refunded`
 * marks the prompt of a `metered` request (a POST turn) the site's meter
 * gives back, since a turn the harness never admitted was refused or never
 * sent.
 */
export type StopAction = {
    cancel: 'now' | 'on-admit' | 'none';
    abort: 'now' | 'after-grace';
    refunded: boolean;
};

/**
 * What Stop does in `phase` (see RequestPhase). An admitted turn is
 * cancelled at once. A sent request is left open: a harness that admits it
 * after the client has gone holds the turn open with no stream, so the
 * cancel goes out once the response names the turn, and a refusal gives the
 * prompt back then. An unsent request ends at once with no cancel, since the
 * turn running may be another stream's. Stop is for the turn the page shows,
 * so on a page that watches another tab's turn it cancels that turn. The
 * cancel names the turn where the harness named it (cancelTurn).
 */
export const stopAction = ({
    phase,
    metered,
}: {
    phase: RequestPhase;
    metered: boolean;
}): StopAction => {
    switch (phase) {
        case 'admitted':
            return { cancel: 'now', abort: 'after-grace', refunded: false };
        case 'sent':
            return { cancel: 'on-admit', abort: 'after-grace', refunded: false };
        case 'unsent':
            return { cancel: 'none', abort: 'now', refunded: metered };
    }
};

/**
 * `handlers` with a record of where the request stands (`phase`), the turn
 * the harness named for it (`turnIndex`, null until named), and what a Stop
 * does to it. The caller calls `start` as the request starts, and `stop` on
 * Stop, which returns the StopAction to carry out. A Stop while the request
 * was `sent` is decided again when the harness answers: `onStopChange`
 * hears the action for `admitted` once the response names the turn, by
 * which time `turnIndex` names it, and the one for `unsent` when the answer
 * is to wait while another stream holds the conversation (whileBusy). A
 * stream that carries on turn `admittedTurn`, which the harness admitted
 * already (a reopened page's), starts `admitted` with that turn. Its Stop
 * then cancels at once. A later frame may come after another turn has
 * begun, so a cancel deferred to it could name the wrong turn.
 */
export const watchAdmission = (
    handlers: StreamHandlers,
    {
        onStopChange,
        admittedTurn = null,
    }: { onStopChange?: (action: StopAction) => void; admittedTurn?: number | null } = {},
): {
    handlers: StreamHandlers;
    phase: () => RequestPhase;
    turnIndex: () => number | null;
    start: () => void;
    stop: (metered: boolean) => StopAction;
} => {
    let phase: RequestPhase = 'unsent';
    let turnIndex = admittedTurn;
    // Set by a Stop that waits on the harness's answer to decide again.
    let waiting: { metered: boolean } | null = null;

    const enter = (next: RequestPhase) => {
        if (phase === 'admitted') {
            return;
        }

        phase = next;

        if (waiting && next !== 'sent') {
            const action = stopAction({ phase: next, metered: waiting.metered });

            waiting = null;
            onStopChange?.(action);
        }
    };

    return {
        handlers: {
            ...handlers,
            onTurnIndex: (index) => {
                turnIndex = index;
                enter('admitted');
                handlers.onTurnIndex?.(index);
            },
            onFrame: (frame) => {
                enter('admitted');
                handlers.onFrame(frame);
            },
            onBusyWait: (seconds) => {
                enter(seconds === null ? 'sent' : 'unsent');
                handlers.onBusyWait?.(seconds);
            },
        },
        phase: () => phase,
        turnIndex: () => turnIndex,
        start: () => enter(admittedTurn === null ? 'sent' : 'admitted'),
        stop: (metered) => {
            const action = stopAction({ phase, metered });

            waiting = action.cancel === 'on-admit' ? { metered } : null;

            return action;
        },
    };
};

/** Whether a turn request naming `after_turn` was refused because a later
 *  turn began first (409 `edit_conflict`, `constraint_id: "turn_moved"`). */
export const isTurnMoved = (refusal: StreamRefusal): boolean =>
    refusal.status === 409 && refusal.error?.constraint_id === 'turn_moved';

/** Resolves after `ms`, or rejects with an AbortError when `signal` aborts. */
export const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        const aborted = () => {
            clearTimeout(timer);
            reject(new DOMException('The wait was aborted.', 'AbortError'));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', aborted);
            resolve();
        }, ms);

        if (signal?.aborted) {
            aborted();
        } else {
            signal?.addEventListener('abort', aborted, { once: true });
        }
    });

/**
 * Run the stream request `run` and, while the harness answers that another
 * stream holds the conversation (busyRetryAfter), wait the seconds it names
 * and send it again. `handlers.onBusyWait` hears each wait start and end. A
 * `signal` aborted during a wait rejects with an AbortError and sends
 * nothing more. Any other refusal goes to `handlers.onRefusal` as usual,
 * and the busy answer ends in the wait.
 */
export const whileBusy = async (
    run: (handlers: StreamHandlers) => Promise<void>,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    {
        sleep = abortableSleep,
    }: { sleep?: (ms: number, signal?: AbortSignal) => Promise<void> } = {},
): Promise<void> => {
    for (;;) {
        // Set by the refusal handler during `run`.
        let wait: number | null = null;

        await run({
            ...handlers,
            onRefusal: (refusal) => {
                wait = busyRetryAfter(refusal);

                return wait !== null || (handlers.onRefusal?.(refusal) ?? false);
            },
        });

        if (wait === null) {
            return;
        }

        handlers.onBusyWait?.(wait);
        await sleep(wait * 1000, signal);
        handlers.onBusyWait?.(null);
    }
};

/** A refusal's body: the harness's ToolError when it is one, and the proxy's
 *  problem document when the site proxy refused the request itself. */
const readRefusal = async (
    res: Response,
): Promise<{ error: PlanRevisionStaleError | null; proxy: ProxyProblem | null }> => {
    try {
        const parsed: unknown = await res.json();

        return { error: asToolError(parsed), proxy: asProxyProblem(parsed, res.headers) };
    } catch {
        return { error: null, proxy: null };
    }
};

/** Whether a refusal says the harness holds no conversation under the id it
 *  names (404 `not_found` at `/conversation_id`): the harness session behind
 *  the page is gone. The proxy's own 404 carries no pointer. */
export const isSessionGone = ({
    status,
    error,
}: {
    status: number;
    error: ToolError | null;
}): boolean =>
    status === 404 && error?.error === 'not_found' && error.pointer === '/conversation_id';

/** Whether the proxy refused a guest's call about a conversation an account
 *  owns (401 SIGN_IN_REQUIRED). */
export const isSignInRequired = ({
    status,
    proxy,
}: {
    status: number;
    proxy?: ProxyProblem | null;
}): boolean => status === 401 && proxy?.code === SIGN_IN_REQUIRED;

/** A state read the harness or the proxy refused for a reason the page acts
 *  on: the harness holds no such conversation (`session_gone`), or the
 *  conversation is an account's and the caller is a guest
 *  (`sign_in_required`). `http` is the refusal as a stream request would
 *  have heard it, for a stream that reads the state (carryOnTurn). */
export type StateRefusal = {
    refusal: 'session_gone' | 'sign_in_required';
    http: StreamRefusal;
};

export const isStateRefusal = (answer: ConversationRead | StateRefusal): answer is StateRefusal =>
    'refusal' in answer;

/** How many times readState asks while the answer is 503
 *  `transient_unavailable`. */
export const STATE_READ_ATTEMPTS = 3;

/**
 * The conversation as the harness holds it, with the closed turns after
 * `since`. A 503 `transient_unavailable`, from the harness or the proxy, is
 * asked again after the seconds it names, up to STATE_READ_ATTEMPTS times in
 * all. A refusal the page acts on is a StateRefusal. Null on any other
 * failure, the proxy's 404 for a conversation another account owns included.
 */
export const readState = async (
    conversationId: string,
    since: number,
    signal?: AbortSignal,
    sleep: (ms: number, signal?: AbortSignal) => Promise<void> = abortableSleep,
): Promise<ConversationRead | StateRefusal | null> => {
    const query = new URLSearchParams({ conversation_id: conversationId, since: String(since) });

    for (let attempt = 1; ; attempt += 1) {
        let res: Response;

        try {
            res = await fetch(`/api/studio/state?${query}`, { signal });

            if (res.ok) {
                return (await res.json()) as ConversationRead;
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw error;
            }

            return null;
        }

        const { error, proxy } = await readRefusal(res);
        const http: StreamRefusal = {
            status: res.status,
            detail: error?.detail ?? null,
            error,
            ...(proxy && { proxy }),
        };

        if (isSessionGone(http)) {
            return { refusal: 'session_gone', http };
        }

        if (isSignInRequired(http)) {
            return { refusal: 'sign_in_required', http };
        }

        const transient =
            res.status === 503 &&
            (error?.error === 'transient_unavailable' || proxy?.code === 'transient_unavailable');

        if (!transient || attempt >= STATE_READ_ATTEMPTS) {
            return null;
        }

        const seconds = error?.retry_after_seconds ?? proxy?.retryAfterSeconds ?? 1;

        await sleep(Math.max(1, seconds) * 1000, signal);
    }
};

/** The places a card's role can change to (`options`), or why they could not
 *  be read: `retry` says a later read may succeed (the harness or the proxy
 *  was unavailable, or no answer came), and `detail` is the harness's words
 *  for a refusal it gave. */
export type PlaceOptionsRead =
    | { kind: 'options'; options: PlaceOption[]; truncated: boolean }
    | {
          kind: 'failed';
          status: number | null;
          code: string | null;
          detail: string | null;
          retry: boolean;
      };

/** The places answer of GET /api/studio/places for `componentId` and `role`,
 *  narrowed: its options with a non-empty id and a label, and whether the
 *  list is cut. Null for an answer about another card or role, or without an
 *  options list. */
export const placesOptionsOf = (
    body: unknown,
    componentId: string,
    role: string,
): PlacesOptions | null => {
    const record = asRecord(body);
    const options = record?.['options'];

    if (
        !record ||
        record['component_id'] !== componentId ||
        record['role'] !== role ||
        !Array.isArray(options)
    ) {
        return null;
    }

    return {
        component_id: componentId,
        role,
        options: options.flatMap((entry: unknown): PlaceOption[] => {
            const option = asRecord(entry);
            const id = option?.['id'];
            const label = option?.['label'];

            return typeof id === 'string' && id !== '' && typeof label === 'string'
                ? [{ id, label }]
                : [];
        }),
        truncated: record['truncated'] === true,
    };
};

// The span a years offer may cover. A year outside it is a fault in the
// frame, and a wider span would make the years picker list thousands of years.
const FIRST_OFFER_YEAR = 1900;
const LAST_OFFER_YEAR = 2200;

const isWhole = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value);

const isYear = (value: unknown): value is number =>
    isWhole(value) && value >= FIRST_OFFER_YEAR && value <= LAST_OFFER_YEAR;

const windowOfferOf = (value: unknown): WindowOffer | null => {
    const record = asRecord(value);
    const start = record?.['start_year'];
    const end = record?.['end_year'];
    const first = record?.['first_year'];
    const last = record?.['last_year'];
    const missing: unknown = record?.['missing_years'] ?? [];
    const missingYears = Array.isArray(missing) ? missing.filter(isWhole) : [];

    if (
        !isYear(start) ||
        !isYear(end) ||
        !isYear(first) ||
        !isYear(last) ||
        first > last ||
        start < first ||
        end > last ||
        start > end ||
        (record?.['single'] === true && start !== end) ||
        !Array.isArray(missing) ||
        missingYears.length !== missing.length
    ) {
        return null;
    }

    return {
        start_year: start,
        end_year: end,
        first_year: first,
        last_year: last,
        ...(missingYears.length > 0 && { missing_years: missingYears }),
        ...(record?.['single'] === true && { single: true }),
    };
};

const placesOfferOf = (value: unknown): PlacesOffer[] => {
    const record = asRecord(value);
    const role = record?.['role'];
    const multiple = record?.['multiple'];
    const chosen = record?.['chosen'];

    if (typeof role !== 'string' || typeof multiple !== 'boolean' || !Array.isArray(chosen)) {
        return [];
    }

    const places = chosen.flatMap((entry: unknown): PlaceOption[] => {
        const place = asRecord(entry);
        const id = place?.['id'];
        const label = place?.['label'];

        return typeof id === 'string' && typeof label === 'string' ? [{ id, label }] : [];
    });

    if (places.length !== chosen.length) return [];

    const max = record?.['max'];
    const label = asRecord(record?.['label']);
    const word = (form: keyof PlacesLabel): string | undefined => {
        const value = label?.[form];

        return typeof value === 'string' && value.trim() !== '' ? value : undefined;
    };
    const singular = word('singular');
    const plural = word('plural');

    return [
        {
            role,
            multiple,
            chosen: places,
            ...(typeof max === 'number' && Number.isInteger(max) && max >= 1 && { max }),
            ...((singular || plural) && {
                label: { ...(singular && { singular }), ...(plural && { plural }) },
            }),
        },
    ];
};

/** A frame's or stored card's `card_changes`, narrowed: a `window` with whole
 *  years inside 1900 to 2200, the drawn range inside the data's, one year
 *  when `single`, and `missing_years` whole years; each `places` entry with a
 *  string `role`, a boolean `multiple` and `chosen` places of string `id` and
 *  `label`, keeping a whole `max` of 1 or more and the non-blank forms of
 *  `label`. A part that fails is dropped and the others stand. Null without a
 *  `spec_id`. */
export const cardChangesOf = (value: unknown): CardChanges | null => {
    const record = asRecord(value);
    const specId = record?.['spec_id'];

    if (!record || typeof specId !== 'string' || specId === '') return null;

    const window = record['window'] == null ? null : windowOfferOf(record['window']);
    const places = Array.isArray(record['places']) ? record['places'].flatMap(placesOfferOf) : [];

    return {
        spec_id: specId,
        ...(window && { window }),
        ...(places.length > 0 && { places }),
    };
};

// A read the caller aborted, which ends in silence. A timeout aborts with a
// TimeoutError, which reads as no answer.
const isAbort = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';

/**
 * Read the places role `role` of card `componentId` can change to. The read
 * spends no prompt. A 5xx, a 429 or no answer may succeed later, unless the
 * refusal says `do_not_retry` (`capability_unavailable` from a deployment
 * that lists no places); the harness's 4xx refusals (`scope_choice_stale`
 * for a card off the canvas, `change_not_offered` for a role it does not
 * offer, `not_found` for the conversation) will not.
 */
export const runPlaceOptions = async (
    conversationId: string,
    componentId: string,
    role: string,
    signal?: AbortSignal,
): Promise<PlaceOptionsRead> => {
    const query = new URLSearchParams({
        conversation_id: conversationId,
        component_id: componentId,
        role,
    });
    let res: Response;

    try {
        res = await fetch(`/api/studio/places?${query}`, { signal });
    } catch (error) {
        if (isAbort(error)) throw error;

        // No answer, or none before the signal's timeout.
        console.warn('places read failed', { componentId, role, error });

        return { kind: 'failed', status: null, code: null, detail: null, retry: true };
    }

    if (res.ok) {
        let body: unknown;

        try {
            body = await res.json();
        } catch (error) {
            if (isAbort(error)) throw error;

            body = null;
        }

        const read = placesOptionsOf(body, componentId, role);

        if (!read) {
            console.warn('places read answered outside the contract', {
                componentId,
                role,
                members: Object.keys(asRecord(body) ?? {}),
            });
        }

        return read
            ? { kind: 'options', options: read.options, truncated: read.truncated }
            : { kind: 'failed', status: res.status, code: null, detail: null, retry: true };
    }

    const { error, proxy } = await readRefusal(res);

    return {
        kind: 'failed',
        status: res.status,
        code: error?.constraint_id ?? error?.error ?? proxy?.code ?? null,
        detail: error?.detail ?? null,
        retry: error?.retry !== 'do_not_retry' && (res.status >= 500 || res.status === 429),
    };
};

/** A canvas edit the harness or the proxy refused: the response's status,
 *  and its body as readRefusal reads it. */
export class CompositionRefusal extends Error {
    readonly status: number;
    readonly error: ToolError | null;
    readonly proxy: ProxyProblem | null;

    constructor(status: number, error: ToolError | null, proxy: ProxyProblem | null) {
        super(error?.detail ?? `the canvas edit was refused: HTTP ${status}`);
        this.name = 'CompositionRefusal';
        this.status = status;
        this.error = error;
        this.proxy = proxy;
    }
}

/** Whether a refused canvas edit names a card the composition holds no block
 *  for (404 `not_found` at `/operations/component_id`). For a `remove`, the
 *  harness has taken the card off already, or never held it. */
export const isNoBlock = (refusal: CompositionRefusal): boolean =>
    refusal.status === 404 &&
    refusal.error?.error === 'not_found' &&
    refusal.error.pointer === '/operations/component_id';

/** Whether a refused canvas edit named a revision the composition has moved
 *  past (409 `edit_conflict`, retry `refresh_then_retry`, no constraint):
 *  read the canvas again before sending it again. */
export const isStaleRevision = (refusal: CompositionRefusal): boolean =>
    refusal.status === 409 &&
    refusal.error?.error === 'edit_conflict' &&
    refusal.error.retry === 'refresh_then_retry' &&
    !refusal.error.constraint_id;

/** Mutate the canvas; resolves with the new (or unchanged) manifest, and
 *  rejects with a CompositionRefusal when the request is refused. Sent
 *  against `expectedRevision` of composition `compositionId` when given. */
export const mutateComposition = async (
    conversationId: string,
    operations: MutationOperation[],
    expectedRevision?: number,
    compositionId?: string,
): Promise<CompositionManifest> => {
    const body: CompositionMutation = {
        kind: 'composition.mutate',
        schema_version: 1,
        conversation_id: conversationId,
        ...(compositionId !== undefined ? { composition_id: compositionId } : {}),
        operations,
        ...(expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
    };

    const res = await fetch('/api/studio/composition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const { error, proxy } = await readRefusal(res);

        throw new CompositionRefusal(res.status, error, proxy);
    }

    return (await res.json()) as CompositionManifest;
};

/** How a cancel went: the harness took it (`stopped`), it answered that the
 *  conversation's latest turn is another than the one named (`moved`), or
 *  no answer came (`unanswered`). */
export type CancelAnswer = 'stopped' | 'moved' | 'unanswered';

// Whether a 422 answer refuses `turn_index` as a member the request may not
// carry: FastAPI's validation answer of a harness from before it, whose
// `detail` entries name the member's location.
const refusesTurnIndex = (body: unknown): boolean => {
    const detail = asRecord(body)?.['detail'];

    return (
        Array.isArray(detail) &&
        detail.some((entry) => {
            const loc = asRecord(entry)?.['loc'];

            return Array.isArray(loc) && loc.at(-1) === 'turn_index';
        })
    );
};

/**
 * Stop the conversation's in-flight stream (the Stop button, or leaving the
 * conversation). `turnIndex` names the turn to stop, as the harness named it
 * (the stream's `x-dfo-turn-index` header, or the state read a carried-on
 * turn came from). The harness answers `turn_moved` and stops nothing when
 * the conversation's latest turn is another. One that names the turn sent
 * met the turn's claim mid-way, so the cancel goes once more. Null stops
 * whatever turn the conversation runs. A harness from before `turn_index`
 * refuses the member 422 (refusesTurnIndex), and the cancel goes again
 * without it. Best-effort and bounded: it always settles, within
 * `timeoutMs` in all, because queued turns wait on it.
 */
export const cancelTurn = async (
    conversationId: string,
    turnIndex: number | null = null,
    timeoutMs: number = STOP_GRACE_MS,
): Promise<CancelAnswer> => {
    const signal = AbortSignal.timeout(timeoutMs);
    const send = (index: number | null) => {
        const body: CancelRequest = {
            kind: 'turn.cancel',
            schema_version: 1,
            conversation_id: conversationId,
            ...(index !== null && { turn_index: index }),
        };

        return fetch('/api/studio/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });
    };

    // The answer to one send: how it went, and for `moved` the latest turn
    // the harness named.
    const answerOf = async (res: Response): Promise<[CancelAnswer, unknown]> => {
        if (!res.ok) {
            return ['unanswered', null];
        }

        const body = res.status === 200 ? asRecord(await res.json().catch(() => null)) : null;

        return body?.['code'] === 'turn_moved' ? ['moved', body['turn_index']] : ['stopped', null];
    };

    try {
        let res = await send(turnIndex);

        if (
            res.status === 422 &&
            turnIndex !== null &&
            refusesTurnIndex(
                await res
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            res = await send(null);
        }

        const [answer, latest] = await answerOf(res);

        if (answer === 'moved' && latest === turnIndex) {
            return (await answerOf(await send(turnIndex)))[0];
        }

        return answer;
    } catch {
        // Cancel is best-effort (a timeout lands here too); closing the
        // stream also stops the turn.
        return 'unanswered';
    }
};

/** One component revision as the Presentation API's read route answers it:
 *  the resolved payload (`payload`), dfo-apis' fact summary, and the
 *  catalogue it minted under. */
export type ComponentRead = LiveCard & { catalog_version: string };

// One component revision's read body, through the site's proxy of the
// Presentation API's read route. Null on any failure, logged with the ids.
const readComponentBody = async (
    componentId: string,
    revision: number,
): Promise<Record<string, unknown> | null> => {
    try {
        const res = await fetch(
            `/api/presentation/components/${encodeURIComponent(componentId)}?revision=${revision}`,
        );

        if (!res.ok) {
            console.warn('component revision read failed', {
                componentId,
                revision,
                status: res.status,
            });

            return null;
        }

        return asRecord(await res.json()) ?? null;
    } catch (error) {
        console.warn('component revision read failed', { componentId, revision, error });

        return null;
    }
};

/** One component revision as the Presentation API reads it, enough to draw
 *  a card the page never saw. Null on any failure, or for an answer without
 *  a payload and fact summary. */
export const readComponent = async (
    componentId: string,
    revision: number,
): Promise<ComponentRead | null> => {
    const body = await readComponentBody(componentId, revision);

    const payload = asRecord(body?.['resolved_payload']);
    const facts = asRecord(body?.['fact_summary']);
    const catalog = body?.['catalog_version'];

    return payload && facts && Array.isArray(facts['series'])
        ? {
              component_id: componentId,
              revision,
              catalog_version: typeof catalog === 'string' ? catalog : '',
              payload,
              fact_summary: facts as ComponentRead['fact_summary'],
          }
        : null;
};

/**
 * The resolved payload of one component revision. A `component.revised`
 * frame may leave its payload out; the card then reads it by id. Null on any
 * failure, and the card keeps what it holds.
 */
export const fetchComponentRevision = async (
    componentId: string,
    revision: number,
): Promise<Record<string, unknown> | null> => {
    return asRecord((await readComponentBody(componentId, revision))?.['resolved_payload']) ?? null;
};
