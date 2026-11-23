import type { CanvasBaseline } from './composition.ts';
import { abortableSleep, CompositionRefusal } from './studioClient.ts';
import type { CompositionManifest, MutationOperation } from './wire.ts';

/** How many times a canvas edit is sent while the answer is 503
 *  `transient_unavailable`. */
export const CANVAS_EDIT_ATTEMPTS = 3;

/** How many times a canvas edit is sent while the answer is a busy 409.
 *  Each send counts against the proxy's per-address rate limit. */
export const CANVAS_EDIT_BUSY_ATTEMPTS = 5;

/**
 * The seconds to wait before sending a canvas edit again after `failure`,
 * the `attempt`-th answer with its status: another request holds the
 * conversation (409 `transient_unavailable`, up to CANVAS_EDIT_BUSY_ATTEMPTS
 * sends), or the harness or the proxy is briefly unavailable (503
 * `transient_unavailable`, up to CANVAS_EDIT_ATTEMPTS sends). At least a
 * second. Null for any other failure, and once the sends run out, which is
 * final.
 */
export const canvasEditRetryAfter = (failure: unknown, attempt: number): number | null => {
    if (!(failure instanceof CompositionRefusal)) {
        return null;
    }

    const { status, error, proxy } = failure;
    const transient =
        error?.error === 'transient_unavailable' || proxy?.code === 'transient_unavailable';
    const retried =
        transient &&
        ((status === 409 && attempt < CANVAS_EDIT_BUSY_ATTEMPTS) ||
            (status === 503 && attempt < CANVAS_EDIT_ATTEMPTS));

    return retried
        ? Math.max(1, error?.retry_after_seconds ?? proxy?.retryAfterSeconds ?? 1)
        : null;
};

/** Serialise each session's canvas edits, so a Remove then an Add land in
 *  order. An edit refused as busy or briefly unavailable
 *  (canvasEditRetryAfter) is sent again after the wait the refusal names,
 *  and holds the edits behind it meanwhile. Busy and unavailable answers
 *  count apart, so a long busy spell leaves the 503 sends intact. `reset`
 *  drops the answers of edits sent before it, and ends the wait of an edit
 *  waiting to be sent again, which then stops. `enqueue` resolves true when
 *  the harness answered the edit with a manifest. */
export const createCanvasEdits = ({
    mutate,
    onManifest,
    onFailure,
    sleep = abortableSleep,
}: {
    mutate: (
        session: string,
        operations: MutationOperation[],
    ) => Promise<CompositionManifest | null>;
    onManifest: (manifest: CompositionManifest) => void;
    onFailure: (operations: MutationOperation[], error: unknown) => void;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}) => {
    let generation = 0;
    // Aborted by `reset`, which ends the waits of the edits sent before it.
    let leaving = new AbortController();
    const chains = new Map<string, Promise<unknown>>();

    return {
        reset: () => {
            generation += 1;
            leaving.abort();
            leaving = new AbortController();
        },
        enqueue: (session: string, operations: MutationOperation[]): Promise<boolean> => {
            const queuedGeneration = generation;
            const { signal } = leaving;
            const chain = (chains.get(session) ?? Promise.resolve()).then(async () => {
                // The sends answered so far, by status.
                const answered = new Map<number, number>();

                for (;;) {
                    let failure: unknown;

                    try {
                        const manifest = await mutate(session, operations);

                        if (manifest) {
                            if (queuedGeneration === generation) {
                                onManifest(manifest);
                            }

                            return true;
                        }
                    } catch (error) {
                        failure = error;
                    }

                    const status = failure instanceof CompositionRefusal ? failure.status : 0;
                    const attempt = (answered.get(status) ?? 0) + 1;

                    answered.set(status, attempt);

                    const wait = canvasEditRetryAfter(failure, attempt);

                    if (wait !== null && queuedGeneration === generation) {
                        const woke = await sleep(wait * 1000, signal).then(
                            () => true,
                            () => false,
                        );

                        if (woke && queuedGeneration === generation) {
                            continue;
                        }

                        return false;
                    }

                    if (queuedGeneration === generation) {
                        onFailure(operations, failure);
                    }

                    return false;
                }
            });

            chains.set(session, chain);

            return chain.finally(() => {
                if (chains.get(session) === chain) {
                    chains.delete(session);
                }
            });
        },
    };
};

/** The edit a pin toggle sends the harness, `unpin` for a card pinned
 *  before the toggle and `pin` otherwise. The harness keeps a pinned card
 *  when the model clears the canvas. */
export const pinEdit = (pinnedIds: readonly string[], id: string): MutationOperation => ({
    op: pinnedIds.includes(id) ? 'unpin' : 'pin',
    component_id: id,
});

// Edits of one kind the harness has not answered yet, by card: what the
// latest one asks for (`on`), and how many are in flight.
type PendingToggles = ReadonlyMap<string, { on: boolean; count: number }>;

/** The page's pin and unpin edits the harness has not answered yet, by
 *  card: whether the latest one pins, and how many are in flight. */
export type PendingPins = PendingToggles;

/** The page's add and remove edits the harness has not answered yet, by
 *  card: whether the latest one adds, and how many are in flight. */
export type PendingCards = PendingToggles;

type CardOperation = Extract<MutationOperation, { component_id: string }>;
type ToggleOp = CardOperation['op'];

// `operations`' edits of the kind toggled by `on` and `off`.
const togglesOf = (
    operations: readonly MutationOperation[],
    on: ToggleOp,
    off: ToggleOp,
): CardOperation[] =>
    operations.filter(
        (operation): operation is CardOperation => operation.op === on || operation.op === off,
    );

const withTogglesSent = (
    pending: PendingToggles,
    operations: readonly MutationOperation[],
    on: ToggleOp,
    off: ToggleOp,
): PendingToggles => {
    const next = new Map(pending);

    for (const operation of togglesOf(operations, on, off)) {
        next.set(operation.component_id, {
            on: operation.op === on,
            count: (next.get(operation.component_id)?.count ?? 0) + 1,
        });
    }

    return next;
};

const withTogglesSettled = (
    pending: PendingToggles,
    operations: readonly MutationOperation[],
    on: ToggleOp,
    off: ToggleOp,
): PendingToggles => {
    const next = new Map(pending);

    for (const operation of togglesOf(operations, on, off)) {
        const sent = next.get(operation.component_id);

        if (sent && sent.count > 1) {
            next.set(operation.component_id, { ...sent, count: sent.count - 1 });
        } else if (sent) {
            next.delete(operation.component_id);
        }
    }

    return next;
};

/** `pending` with `operations`' pins and unpins sent. */
export const withPinsSent = (
    pending: PendingPins,
    operations: readonly MutationOperation[],
): PendingPins => withTogglesSent(pending, operations, 'pin', 'unpin');

/** `pending` once the harness answered `operations`, by a manifest or a
 *  refusal. A card with no edit left in flight shows the manifest's pin. */
export const withPinsSettled = (
    pending: PendingPins,
    operations: readonly MutationOperation[],
): PendingPins => withTogglesSettled(pending, operations, 'pin', 'unpin');

/** `pending` with `operations`' adds and removes sent. */
export const withCardsSent = (
    pending: PendingCards,
    operations: readonly MutationOperation[],
): PendingCards => withTogglesSent(pending, operations, 'add', 'remove');

/** `pending` once the harness answered `operations`, by a manifest or a
 *  refusal. A card with no edit left in flight shows where the manifest
 *  has it, so a refused edit is rolled back. */
export const withCardsSettled = (
    pending: PendingCards,
    operations: readonly MutationOperation[],
): PendingCards => withTogglesSettled(pending, operations, 'add', 'remove');

/** The canvas the page shows: `canvas` with each card that has an add or
 *  remove in flight where that edit asks, so the user's edit shows at once.
 *  A page with no manifest baseline (`canvas` null) overlays the edits on
 *  the ids of the cards it shows (`pageIds`), as a legacy canvas. Null for
 *  no canvas, and for no baseline with nothing in flight or no `pageIds`. */
export const shownCanvas = (
    canvas: CanvasBaseline | null,
    pending: PendingCards,
    pageIds?: readonly string[],
): CanvasBaseline | null => {
    if (pending.size === 0) {
        return canvas;
    }

    const base = canvas ?? (pageIds && { compositionId: null, revision: -1, ids: [...pageIds] });

    if (!base) {
        return null;
    }

    const kept = base.ids.filter((id) => pending.get(id)?.on !== false);
    const added = [...pending]
        .filter(([id, sent]) => sent.on && !kept.includes(id))
        .map(([id]) => id);

    return { ...base, ids: [...kept, ...added] };
};

/**
 * The harness cards the page shows pinned: the manifest's pins (`canvas`,
 * takeManifest), each card with an edit in flight showing what that edit
 * asks for. Null for a canvas that holds no manifest's pins (a legacy
 * canvas, or a baseline saved before the page kept them), whose pins stay
 * the save's.
 */
export const shownPins = (canvas: CanvasBaseline | null, pending: PendingPins): string[] | null => {
    if (!canvas?.pinned) {
        return null;
    }

    const kept = canvas.pinned.filter((id) => pending.get(id)?.on !== false);
    const asked = [...pending]
        .filter(([id, sent]) => sent.on && !kept.includes(id))
        .map(([id]) => id);

    return [...kept, ...asked];
};

/** A document's pins with the harness cards' taken from `harnessPins`, and
 *  the pins of cards the harness never held (`isHarness` false) kept.
 *  Unchanged when they already agree. */
export const withHarnessPins = (
    pinnedIds: string[],
    harnessPins: readonly string[],
    isHarness: (id: string) => boolean,
): string[] => {
    const next = [
        ...pinnedIds.filter((id) => !isHarness(id) && !harnessPins.includes(id)),
        ...harnessPins,
    ];

    return next.length === pinnedIds.length && next.every((id, at) => id === pinnedIds[at])
        ? pinnedIds
        : next;
};
