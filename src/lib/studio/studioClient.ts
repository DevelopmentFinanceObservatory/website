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
    ApplyChoice,
    ApplyUnit,
    CancelRequest,
    ClientFeature,
    CompositionManifest,
    CompositionMutation,
    ConversationRead,
    InterruptResponse,
    MutationOperation,
    PlanRevisionStaleError,
    PromptSource,
    ResumeRequest,
    Seed,
    StudioFrame,
    ToolError,
    TurnRequest,
} from './wire';

import { asRecord } from '../asRecord.ts';
import { SIGN_IN_REQUIRED } from './studioAccess.ts';
import { isTextTooLong, TEXT_TOO_LONG_MESSAGE } from './interruptText.ts';
import type { LiveCard } from './liveBackend.ts';
import { uuid } from '../uuid.ts';

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
    // `detail` is the failed fetch's message.
    onUnreachable?: (detail: string) => boolean;
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

        if (!onUnreachable?.((error as Error).message)) {
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

/** The members a message turn may carry beside its message. */
export type TurnExtras = Partial<
    Pick<
        TurnRequest,
        'component_ref' | 'auto_add' | 'surface' | 'seed_spec' | 'after_turn' | 'prompt_source'
    >
>;

/** The members a question handed over from Get Data carries: the seeds
 *  of the datasets the reader saw there, and the example its text came
 *  from (handoffPromptSource). Studio's arrival (useChat's send) and the
 *  turn Get Data starts for Studio to adopt (startHeldTurn) both build
 *  them here. */
export const handoffExtras = (
    seeds: Seed[] | null | undefined,
    source: PromptSource | undefined,
): TurnExtras => ({
    ...(seeds && { seed_spec: seeds }),
    ...(source && { prompt_source: source }),
});

/** The request body of a message turn. Studio's own turns (runTurn) and a
 *  turn Get Data starts for Studio to adopt (startHeldTurn) both build it
 *  here, so an adopted turn is the turn Studio would have sent. */
export const turnRequest = (
    conversationId: string,
    message: string,
    extras?: TurnExtras,
): TurnRequest => ({
    kind: 'turn.request',
    schema_version: 1,
    conversation_id: conversationId,
    message,
    ...extras,
    client_features: CLIENT_FEATURES,
});

/** Start (or continue) a turn. */
export const runTurn = (
    conversationId: string,
    message: string,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    extras?: TurnExtras,
): Promise<void> =>
    streamStudio('turn', turnRequest(conversationId, message, extras), handlers, signal);

/** Run a turn from a clicked `apply_choice` chip: the chip's choice, option,
 *  turn and reading, copied as offered, and no message. */
export const runApplyChoice = (
    conversationId: string,
    { choice_id, option_id, turn, spec_id }: ApplyChoice,
    handlers: StreamHandlers,
    signal?: AbortSignal,
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            apply_choice: { choice_id, option_id, turn, spec_id },
            client_features: CLIENT_FEATURES,
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
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            apply_unit: { component_id, spec_id, turn, unit },
            client_features: CLIENT_FEATURES,
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
): Promise<void> =>
    streamStudio(
        'resume',
        {
            kind: 'turn.resume',
            schema_version: 1,
            conversation_id: conversationId,
            turn_index: turnIndex,
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
 * `timeoutMs` in all, because queued turns wait on it. `keepalive` lets
 * the request outlive the page.
 */
export const cancelTurn = async (
    conversationId: string,
    turnIndex: number | null = null,
    timeoutMs: number = STOP_GRACE_MS,
    keepalive = false,
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
            ...(keepalive && { keepalive }),
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

// One report of a held turn's stream from before Studio adopted it.
type HeldEvent =
    | { kind: 'turn-index'; index: number }
    | { kind: 'frame'; frame: StudioFrame }
    | { kind: 'keep-alive' }
    | { kind: 'refusal'; refusal: StreamRefusal }
    | { kind: 'unreachable'; detail: string };

type HeldEntry = {
    conversationId: string;
    message: string;
    adopted: boolean;
    // The reports no stream has heard yet, in the order they came.
    events: HeldEvent[];
    turnIndex: number | null;
    // The adopting stream's handlers, which hear every report after adoption.
    listener: StreamHandlers | null;
    controller: AbortController;
    request: Promise<void>;
    // The turn index once the harness names it, or null once the request
    // ends without one.
    named: Promise<number | null>;
    cancelling: Promise<void> | null;
    // Whether the cancel goes with `keepalive`, set by a cancel that asks
    // for it and by a pagehide while the cancel waits on the turn index.
    keepalive: boolean;
    // Whether Get Data has moved to Studio (HeldTurnStart's `moved`).
    moved: boolean;
    // The timer that cancels the turn when Studio does not take it.
    deadline: ReturnType<typeof setTimeout> | undefined;
};

// What stays of a turn Studio took once it is done with it: the time until
// which a second take answers `adopted`.
type AdoptedMark = { adoptedUntil: number };

/** How long after Get Data moves to Studio a held turn waits for Studio to
 *  adopt it before it cancels itself. */
export const HELD_ADOPT_LIMIT_MS = 30_000;

/** How long a second take of a turn Studio is done with answers `adopted`,
 *  which covers Strict Mode's second run of Studio's arrival effect. */
export const ADOPTED_MARK_MS = 10_000;

// The held turns of this page load by token, and the marks of turns Studio
// took and is done with.
const heldTurns = new Map<string, HeldEntry | AdoptedMark>();

/** A turn started with startHeldTurn: the token Studio takes it by, a
 *  cancel for every way out of the hold except the move, and `moved` for
 *  the move itself. `cancel` asks the harness to cancel the turn once it
 *  has named the turn, within STOP_GRACE_MS, and closes the stream. The
 *  turn's prompt stays spent. Cancelling a turn Studio adopted does
 *  nothing. `keepalive` sends the cancel so that it outlives the page
 *  (pagehide). */
export type HeldTurnStart = {
    token: string;
    cancel: (options?: { keepalive?: boolean }) => Promise<void>;
    moved: () => void;
};

/** A held turn Studio took (takeHeldTurn). `run` is the turn's stream for
 *  useChat: it replays what the stream reported so far through `handlers`,
 *  then passes on the rest, and settles as the request does. Aborting
 *  `signal` closes the request. `cancel` cancels a turn Studio took and
 *  will not run, as HeldTurnStart's cancel does. */
export type HeldTurn = {
    conversationId: string;
    message: string;
    run: (handlers: StreamHandlers, signal: AbortSignal) => Promise<void>;
    cancel: () => Promise<void>;
};

const replayHeld = (event: HeldEvent, handlers: StreamHandlers) => {
    switch (event.kind) {
        case 'turn-index':
            handlers.onTurnIndex?.(event.index);
            break;
        case 'frame':
            handlers.onFrame(event.frame);
            break;
        case 'keep-alive':
            handlers.onKeepAlive?.();
            break;
        // A refusal or a failed request the handlers leave is an error
        // frame, as streamStudio makes it.
        case 'refusal':
            if (!handlers.onRefusal?.(event.refusal)) {
                handlers.onFrame(
                    transportError(event.refusal.detail ?? `HTTP ${event.refusal.status}`),
                );
            }
            break;
        case 'unreachable':
            if (!handlers.onUnreachable?.(event.detail)) {
                handlers.onFrame(transportError(event.detail));
            }
            break;
    }
};

// Drops `entry` and what it holds once its stream is over. A turn Studio
// took leaves its mark, so a second take answers `adopted`.
const releaseHeld = (token: string, entry: HeldEntry) => {
    clearTimeout(entry.deadline);
    entry.listener = null;
    entry.events = [];

    if (heldTurns.get(token) !== entry) {
        return;
    }

    if (entry.adopted) {
        heldTurns.set(token, { adoptedUntil: Date.now() + ADOPTED_MARK_MS });
    } else {
        heldTurns.delete(token);
    }
};

// The cancel goes at once when the turn is named, so a pagehide sends it
// before the page goes.
const sendHeldCancel = async (entry: HeldEntry): Promise<void> => {
    let index = entry.turnIndex;

    if (index === null) {
        // Undefined when the harness names no turn within the grace.
        const grace = new AbortController();
        const unnamed = abortableSleep(STOP_GRACE_MS, grace.signal).then(
            () => undefined,
            () => undefined,
        );

        index = (await Promise.race([entry.named, unnamed])) ?? null;
        grace.abort();
    }

    if (index !== null) {
        await cancelTurn(entry.conversationId, index, STOP_GRACE_MS, entry.keepalive);
    }

    entry.controller.abort();
};

// The cancel of every held turn, run once per turn. A turn cancelled before
// Studio took it stays in heldTurns until its cancel settles, for a
// pagehide to see, and takeHeldTurn answers null for it, so Studio posts
// its own on arrival.
const cancelHeld = (
    token: string,
    entry: HeldEntry,
    { keepalive = false }: { keepalive?: boolean } = {},
): Promise<void> => {
    clearTimeout(entry.deadline);
    entry.keepalive ||= keepalive;
    entry.cancelling ??= sendHeldCancel(entry).then(() => releaseHeld(token, entry));

    return entry.cancelling;
};

// A page that goes (a reload, a hard navigation, a closed tab) cancels
// every held turn Studio has not taken, with requests that outlive it. A
// cancel already waiting on the turn index goes with `keepalive` once the
// index arrives, if the page is still there to send it.
let watchingPageHide = false;
const cancelOnPageHide = () => {
    for (const [token, entry] of heldTurns) {
        if ('controller' in entry && !entry.adopted) {
            void cancelHeld(token, entry, { keepalive: true });
        }
    }
};

/**
 * Start the turn `message` for Studio to adopt (takeHeldTurn) under
 * `token`, under a fresh conversation id. It is an ordinary turn, and
 * spends its prompt when the harness admits it, whether or not Studio
 * adopts it. The stream's reports are kept until Studio adopts it.
 * `extras` are the turn's members as Studio would send them (turnRequest).
 *
 * The turn cancels itself when Studio has not taken it `adoptLimitMs`
 * after the move (HeldTurnStart's `moved`), and when the page goes
 * (`pagehide`) before Studio takes it. A pagehide before the harness has
 * named the turn sends nothing, since a cancel names its turn. That window
 * lasts from the request until its response headers arrive.
 */
export const startHeldTurn = ({
    token = uuid(),
    message,
    extras,
    adoptLimitMs = HELD_ADOPT_LIMIT_MS,
}: {
    token?: string;
    message: string;
    extras?: TurnExtras;
    adoptLimitMs?: number;
}): HeldTurnStart => {
    let name: (index: number | null) => void = () => {};
    const entry: HeldEntry = {
        conversationId: uuid(),
        message,
        adopted: false,
        events: [],
        turnIndex: null,
        listener: null,
        controller: new AbortController(),
        request: Promise.resolve(),
        named: new Promise((resolve) => {
            name = resolve;
        }),
        cancelling: null,
        keepalive: false,
        moved: false,
        deadline: undefined,
    };
    // Each report goes to the adopting stream, or waits for it.
    const report = (event: HeldEvent) => {
        entry.events.push(event);

        return true;
    };

    entry.request = streamStudio(
        'turn',
        turnRequest(entry.conversationId, message, extras),
        {
            onTurnIndex: (index) => {
                entry.turnIndex = index;
                name(index);

                if (entry.listener) {
                    entry.listener.onTurnIndex?.(index);
                } else {
                    report({ kind: 'turn-index', index });
                }
            },
            onFrame: (frame) =>
                entry.listener ? entry.listener.onFrame(frame) : report({ kind: 'frame', frame }),
            onKeepAlive: () =>
                entry.listener ? entry.listener.onKeepAlive?.() : report({ kind: 'keep-alive' }),
            onRefusal: (refusal) =>
                entry.listener
                    ? (entry.listener.onRefusal?.(refusal) ?? false)
                    : report({ kind: 'refusal', refusal }),
            onUnreachable: (detail) =>
                entry.listener
                    ? (entry.listener.onUnreachable?.(detail) ?? false)
                    : report({ kind: 'unreachable', detail }),
        },
        entry.controller.signal,
    );
    // Nobody may adopt the turn, so its rejection is handled here too.
    entry.request.then(
        () => name(null),
        () => name(null),
    );
    heldTurns.set(token, entry);

    if (!watchingPageHide && typeof window !== 'undefined') {
        watchingPageHide = true;
        window.addEventListener('pagehide', cancelOnPageHide);
    }

    return {
        token,
        cancel: (options) =>
            entry.adopted ? Promise.resolve() : cancelHeld(token, entry, options),
        moved: () => {
            if (entry.moved || entry.adopted || entry.cancelling) {
                return;
            }

            entry.moved = true;
            entry.deadline = setTimeout(() => void cancelHeld(token, entry), adoptLimitMs);
        },
    };
};

/**
 * The held turn under `token` (startHeldTurn), taken once. A later take
 * answers `adopted`, and a token this page load never started, or one
 * cancelled before Studio took it, answers null, for Studio to post its own
 * turn. The registry lets go of a taken turn once its stream settles, or
 * once Studio cancels it.
 */
export const takeHeldTurn = (token: string): HeldTurn | 'adopted' | null => {
    const entry = heldTurns.get(token);

    if (entry && 'adoptedUntil' in entry) {
        if (entry.adoptedUntil > Date.now()) {
            return 'adopted';
        }

        heldTurns.delete(token);

        return null;
    }

    if (!entry || (entry.cancelling && !entry.adopted)) {
        return null;
    }

    if (entry.adopted) {
        return 'adopted';
    }

    entry.adopted = true;
    clearTimeout(entry.deadline);

    return {
        conversationId: entry.conversationId,
        message: entry.message,
        run: (handlers, signal) => {
            const settled = entry.request.finally(() => releaseHeld(token, entry));

            if (signal.aborted) {
                entry.controller.abort();

                return settled;
            }

            signal.addEventListener('abort', () => entry.controller.abort(), { once: true });

            const events = entry.events;

            entry.events = [];
            entry.listener = handlers;

            for (const event of events) {
                replayHeld(event, handlers);
            }

            return settled;
        },
        cancel: () => cancelHeld(token, entry),
    };
};

/** The handlers the stream of the held turn under `token` reports to, or
 *  null when none do: before Studio adopts it, and once the registry lets
 *  go of it. Tests read it. */
export const heldTurnListener = (token: string): StreamHandlers | null => {
    const entry = heldTurns.get(token);

    return entry && 'listener' in entry ? entry.listener : null;
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
