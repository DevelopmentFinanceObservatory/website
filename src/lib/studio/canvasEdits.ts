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

/** The edit a pin toggle sends the harness: `unpin` for a card pinned
 *  before the toggle, else `pin`. The harness keeps a pinned card when the
 *  model clears the canvas. */
export const pinEdit = (pinnedIds: readonly string[], id: string): MutationOperation => ({
    op: pinnedIds.includes(id) ? 'unpin' : 'pin',
    component_id: id,
});
