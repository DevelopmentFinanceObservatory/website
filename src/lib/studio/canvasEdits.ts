import type { CanvasBaseline } from './composition.ts';
import type { CompositionManifest, MutationOperation } from './wire.ts';

/** Serialize each session's canvas edits, so a Remove then an Add land in
 *  order. `reset` drops the answers of edits sent before it. */
export const createCanvasEdits = ({
    mutate,
    onManifest,
    onFailure,
}: {
    mutate: (
        session: string,
        operations: MutationOperation[],
    ) => Promise<CompositionManifest | null>;
    onManifest: (manifest: CompositionManifest) => void;
    onFailure: (operations: MutationOperation[], error: unknown) => void;
}) => {
    let generation = 0;
    const chains = new Map<string, Promise<void>>();

    return {
        reset: () => {
            generation += 1;
        },
        enqueue: (session: string, operations: MutationOperation[]): Promise<void> => {
            const queuedGeneration = generation;
            const chain = (chains.get(session) ?? Promise.resolve()).then(async () => {
                let failure: unknown;

                try {
                    const manifest = await mutate(session, operations);

                    if (manifest) {
                        if (queuedGeneration === generation) {
                            onManifest(manifest);
                        }

                        return;
                    }
                } catch (error) {
                    failure = error;
                }

                if (queuedGeneration === generation) {
                    onFailure(operations, failure);
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

/** The page's pin and unpin edits the harness has not answered yet, by
 *  card: the pin the latest one asks for, and how many are in flight. */
export type PendingPins = ReadonlyMap<string, { pinned: boolean; count: number }>;

/** `pending` with `operations`' pins and unpins sent. */
export const withPinsSent = (
    pending: PendingPins,
    operations: readonly MutationOperation[],
): PendingPins => {
    const next = new Map(pending);

    for (const operation of operations) {
        if (operation.op === 'pin' || operation.op === 'unpin') {
            next.set(operation.component_id, {
                pinned: operation.op === 'pin',
                count: (next.get(operation.component_id)?.count ?? 0) + 1,
            });
        }
    }

    return next;
};

/** `pending` once the harness answered `operations`, by a manifest or a
 *  refusal: a card with no edit left in flight shows the manifest's pin. */
export const withPinsSettled = (
    pending: PendingPins,
    operations: readonly MutationOperation[],
): PendingPins => {
    const next = new Map(pending);

    for (const operation of operations) {
        if (operation.op !== 'pin' && operation.op !== 'unpin') {
            continue;
        }

        const sent = next.get(operation.component_id);

        if (sent) {
            if (sent.count > 1) {
                next.set(operation.component_id, { ...sent, count: sent.count - 1 });
            } else {
                next.delete(operation.component_id);
            }
        }
    }

    return next;
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

    const kept = canvas.pinned.filter((id) => pending.get(id)?.pinned !== false);
    const asked = [...pending]
        .filter(([id, sent]) => sent.pinned && !kept.includes(id))
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
