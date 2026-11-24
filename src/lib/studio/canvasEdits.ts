import type { CanvasBaseline } from './composition.ts';
import { abortableSleep, CompositionRefusal, isNoBlock } from './studioClient.ts';
import type { CompositionManifest, MutationOperation } from './wire.ts';

/** How many times a canvas edit is sent while the answer is 503
 *  `transient_unavailable`. */
export const CANVAS_EDIT_ATTEMPTS = 3;

/** How many times a canvas edit is sent while the answer is a busy 409 and
 *  the page has no turn running. Each send counts against the proxy's
 *  per-address rate limit. */
export const CANVAS_EDIT_BUSY_ATTEMPTS = 5;

/** How long a canvas edit is sent again while the answer is a busy 409 and
 *  the page's own turn holds the conversation, counted from its first send.
 *  The harness stays busy for the whole turn. */
export const CANVAS_EDIT_TURN_WAIT_MS = 180_000;

/**
 * The seconds to wait before sending a canvas edit again after `failure`,
 * the `attempt`-th answer with its status: another request holds the
 * conversation (409 `transient_unavailable`, sent again for as long as
 * `ownTurn` says the page's own turn holds it, then up to
 * CANVAS_EDIT_BUSY_ATTEMPTS sends), or the harness or the proxy is briefly
 * unavailable (503 `transient_unavailable`, up to CANVAS_EDIT_ATTEMPTS
 * sends). At least a second, and at least the wait the refusal names. Null
 * for any other failure, and once the sends run out, which is final.
 */
export const canvasEditRetryAfter = (
    failure: unknown,
    attempt: number,
    ownTurn = false,
): number | null => {
    if (!(failure instanceof CompositionRefusal)) {
        return null;
    }

    const { status, error, proxy } = failure;
    const transient =
        error?.error === 'transient_unavailable' || proxy?.code === 'transient_unavailable';
    const retried =
        transient &&
        ((status === 409 && (ownTurn || attempt < CANVAS_EDIT_BUSY_ATTEMPTS)) ||
            (status === 503 && attempt < CANVAS_EDIT_ATTEMPTS));

    return retried
        ? Math.max(1, error?.retry_after_seconds ?? proxy?.retryAfterSeconds ?? 1)
        : null;
};

/** The cards an edit the harness refused says it holds no block for: the
 *  removes of a "no block" refusal (isNoBlock), which the harness has taken
 *  off already or never held. Empty for any other failure, which only rolls
 *  the edit back. */
export const refusedRemoves = (
    operations: readonly MutationOperation[],
    failure: unknown,
): string[] =>
    failure instanceof CompositionRefusal && isNoBlock(failure)
        ? operations.flatMap((operation) =>
              operation.op === 'remove' ? [operation.component_id] : [],
          )
        : [];

/** The composition and revision an edit is sent against (`composition_id`,
 *  `expected_revision`), which the harness refuses once the canvas has
 *  moved on. A function is read when the edit goes, each time it goes. */
export type EditAgainst =
    | { compositionId: string; revision: number }
    | (() => { compositionId: string; revision: number });

/** Serialise each session's canvas edits, so a Remove then an Add land in
 *  order. An edit refused as busy or briefly unavailable
 *  (canvasEditRetryAfter) is sent again after the wait the refusal names,
 *  and holds the edits behind it meanwhile. Busy and unavailable answers
 *  count apart, so a long busy spell leaves the 503 sends intact. A busy
 *  answer while `ownTurn` says the page's turn is running, within
 *  CANVAS_EDIT_TURN_WAIT_MS of the edit's first send (by `now`), counts
 *  toward no limit, so an edit made during a long turn lands once the turn
 *  ends. `reset`
 *  drops the answers of edits sent before it, and ends the wait of an edit
 *  waiting to be sent again, which then stops. `enqueue` resolves true when
 *  the harness answered the edit with a manifest, and sends it `against`
 *  a composition and revision when given. */
export const createCanvasEdits = ({
    mutate,
    onManifest,
    onFailure,
    sleep = abortableSleep,
    ownTurn = () => false,
    now = Date.now,
}: {
    mutate: (
        session: string,
        operations: MutationOperation[],
        against?: { compositionId: string; revision: number },
    ) => Promise<CompositionManifest | null>;
    onManifest: (manifest: CompositionManifest) => void;
    onFailure: (operations: MutationOperation[], error: unknown) => void;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    ownTurn?: () => boolean;
    now?: () => number;
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
        enqueue: (
            session: string,
            operations: MutationOperation[],
            against?: EditAgainst,
        ): Promise<boolean> => {
            const queuedGeneration = generation;
            const { signal } = leaving;
            const chain = (chains.get(session) ?? Promise.resolve()).then(async () => {
                // The sends answered so far, by status.
                const answered = new Map<number, number>();
                const started = now();

                for (;;) {
                    let failure: unknown;

                    try {
                        const manifest = await mutate(
                            session,
                            operations,
                            typeof against === 'function' ? against() : against,
                        );

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
                    const turnBusy =
                        status === 409 && ownTurn() && now() - started < CANVAS_EDIT_TURN_WAIT_MS;
                    const attempt = (answered.get(status) ?? 0) + (turnBusy ? 0 : 1);

                    answered.set(status, attempt);

                    const wait = canvasEditRetryAfter(failure, attempt, turnBusy);

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

/** The cards the page shows with the user's unanswered adds and removes
 *  (shownCanvas), where `visible` draws the cards a canvas shows
 *  (canvasWidgetsOf). A page with no manifest baseline overlays the edits
 *  on the cards it draws without one at each call, so a card a running turn
 *  draws after an edit went out shows, and only the cards the edits name
 *  change. */
export const editedCanvasCards = <Card extends { id: string }>(
    canvas: CanvasBaseline | null,
    pending: PendingCards,
    visible: (canvas: CanvasBaseline | null) => Card[],
): Card[] =>
    canvas || pending.size === 0
        ? visible(shownCanvas(canvas, pending))
        : visible(
              shownCanvas(
                  null,
                  pending,
                  visible(null).map(({ id }) => id),
              ),
          );

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
