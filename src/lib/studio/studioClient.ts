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
    CancelRequest,
    CompositionManifest,
    CompositionMutation,
    ConversationRead,
    InterruptResponse,
    MutationOperation,
    PlanRevisionStaleError,
    ResumeRequest,
    StudioFrame,
    ToolError,
    TurnRequest,
} from './wire';

import { asRecord } from '../asRecord.ts';
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
 *  `error` frame. Each returns true when it has dealt with it. */
export type StreamHandlers = {
    onFrame: (frame: StudioFrame) => void;
    onTurnIndex?: (index: number) => void;
    onKeepAlive?: () => void;
    onRefusal?: (refusal: StreamRefusal) => boolean;
    onUnreachable?: () => boolean;
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

        try {
            const parsed = (await res.json()) as { detail?: unknown };

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

        onFrame(transportError(detail ?? `HTTP ${res.status}`));

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

/** Start (or continue) a turn. */
export const runTurn = (
    conversationId: string,
    message: string,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    extras?: Partial<
        Pick<TurnRequest, 'component_ref' | 'auto_add' | 'surface' | 'seed_spec' | 'after_turn'>
    >,
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            message,
            ...extras,
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
): Promise<void> =>
    streamStudio(
        'turn',
        {
            kind: 'turn.request',
            schema_version: 1,
            conversation_id: conversationId,
            apply_choice: { choice_id, option_id, turn, spec_id },
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
        'decision' | 'payload' | 'answers' | 'choice_id' | 'option_id' | 'plan_revision'
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
 * and send it again. `onWait` hears each wait. Any other refusal goes to
 * `handlers.onRefusal` as usual, and the busy answer ends in the wait.
 */
export const whileBusy = async (
    run: (handlers: StreamHandlers) => Promise<void>,
    handlers: StreamHandlers,
    signal?: AbortSignal,
    {
        onWait,
        sleep = abortableSleep,
    }: {
        onWait?: (seconds: number) => void;
        sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    } = {},
): Promise<void> => {
    for (;;) {
        // Set by the refusal handler during `run`, which the compiler cannot see.
        let wait = null as number | null;

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

        onWait?.(wait);
        await sleep(wait * 1000, signal);
    }
};

/**
 * The conversation as the harness holds it, with the closed turns after
 * `since`. Null on any failure, a 404 included, which the proxy answers for a
 * conversation that is not the signed-in user's.
 */
export const readState = async (
    conversationId: string,
    since: number,
    signal?: AbortSignal,
): Promise<ConversationRead | null> => {
    const query = new URLSearchParams({ conversation_id: conversationId, since: String(since) });

    try {
        const res = await fetch(`/api/studio/state?${query}`, { signal });

        return res.ok ? ((await res.json()) as ConversationRead) : null;
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw error;
        }

        return null;
    }
};

/** Mutate the canvas; resolves with the new (or unchanged) manifest. */
export const mutateComposition = async (
    conversationId: string,
    operations: MutationOperation[],
    expectedRevision?: number,
): Promise<CompositionManifest | null> => {
    const body: CompositionMutation = {
        kind: 'composition.mutate',
        schema_version: 1,
        conversation_id: conversationId,
        operations,
        ...(expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
    };

    const res = await fetch('/api/studio/composition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        return null;
    }

    return (await res.json()) as CompositionManifest;
};

/**
 * Stop the conversation's in-flight stream (the Stop button). Best-effort and
 * bounded: it always settles, within `timeoutMs`, because queued turns wait
 * on it.
 */
export const cancelTurn = async (
    conversationId: string,
    timeoutMs: number = STOP_GRACE_MS,
): Promise<void> => {
    const body: CancelRequest = {
        kind: 'turn.cancel',
        schema_version: 1,
        conversation_id: conversationId,
    };

    await fetch('/api/studio/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => {
        // Cancel is best-effort (a timeout lands here too); closing the
        // stream also stops the turn.
    });
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
