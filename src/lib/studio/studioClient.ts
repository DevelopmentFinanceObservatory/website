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
    CancelRequest,
    CompositionManifest,
    CompositionMutation,
    InterruptResponse,
    MutationOperation,
    StudioFrame,
    ToolError,
    TurnRequest,
} from './wire';

/**
 * How long the page waits on a stop: a cancelled stream may run on this long
 * before the client closes it, and the cancel request is dropped after the
 * same time. The harness ends a cancelled stream within about 5 s.
 */
export const STOP_GRACE_MS = 10_000;

const transportError = (detail: string): StudioFrame => ({
    event: 'error',
    seq: -1,
    error: {
        error: 'transient_unavailable',
        retry: 'retry_after_delay',
        detail,
    } as ToolError,
});

/** An HTTP refusal of a stream request: its status, the body's `detail`
 *  when it has one, and the harness's ToolError when the body is one. */
export type StreamRefusal = { status: number; detail: string | null; error: ToolError | null };

/** What a stream reports to its caller. `onRefusal` sees an HTTP refusal
 *  before the stream would report it as an `error` frame, and returns true
 *  when it has dealt with it. */
export type StreamHandlers = {
    onFrame: (frame: StudioFrame) => void;
    onKeepAlive?: () => void;
    onRefusal?: (refusal: StreamRefusal) => boolean;
};

const asToolError = (body: unknown): ToolError | null =>
    body !== null &&
    typeof body === 'object' &&
    typeof (body as ToolError).error === 'string' &&
    typeof (body as ToolError).detail === 'string'
        ? (body as ToolError)
        : null;

const streamStudio = async (
    endpoint: 'turn' | 'interrupt',
    body: TurnRequest | InterruptResponse,
    { onFrame, onKeepAlive, onRefusal }: StreamHandlers,
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

        onFrame(transportError((error as Error).message));

        return;
    }

    if (!res.ok || !res.body) {
        let detail: string | null = null;
        let error: ToolError | null = null;

        try {
            const parsed = (await res.json()) as { detail?: unknown };

            error = asToolError(parsed);

            if (typeof parsed.detail === 'string') {
                detail = parsed.detail;
            }
        } catch {
            // Non-JSON body — the status line stands.
        }

        if (!res.ok && onRefusal?.({ status: res.status, detail, error })) {
            return;
        }

        onFrame(transportError(detail ?? `HTTP ${res.status}`));

        return;
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
    extras?: Partial<Pick<TurnRequest, 'component_ref' | 'auto_add' | 'surface' | 'seed_spec'>>,
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

/**
 * The resolved payload of one component revision, read through the site's
 * proxy of the Presentation API's read route. A `component.revised` frame
 * may leave its payload out; the card then reads it by id. Null on any
 * failure, and the card keeps what it holds.
 */
export const fetchComponentRevision = async (
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

        const body = (await res.json()) as { resolved_payload?: unknown };
        const payload = body.resolved_payload;

        return payload !== null && typeof payload === 'object'
            ? (payload as Record<string, unknown>)
            : null;
    } catch (error) {
        console.warn('component revision read failed', { componentId, revision, error });

        return null;
    }
};
