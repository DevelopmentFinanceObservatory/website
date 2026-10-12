import type { CompositionManifest, MutationOperation } from './wire.ts';

/** Serialize each session's canvas edits and keep removal markers only while pending. */
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
    const removals = new Map<string, number>();

    return {
        isOwnRemoval: (id: string) => removals.has(id),
        reset: () => {
            generation += 1;
            removals.clear();
        },
        enqueue: (session: string, operations: MutationOperation[]): Promise<void> => {
            const queuedGeneration = generation;
            const removed = operations.flatMap((op) =>
                op.op === 'remove' ? [op.component_id] : [],
            );

            removed.forEach((id) => removals.set(id, (removals.get(id) ?? 0) + 1));
            const chain = (chains.get(session) ?? Promise.resolve()).then(async () => {
                let failure: unknown;
                let failed = false;

                try {
                    const manifest = await mutate(session, operations);

                    if (queuedGeneration !== generation) {
                        return;
                    }

                    if (manifest) {
                        onManifest(manifest);
                    } else {
                        failed = true;
                    }
                } catch (error) {
                    failed = true;
                    failure = error;
                } finally {
                    if (queuedGeneration === generation) {
                        removed.forEach((id) => {
                            const remaining = (removals.get(id) ?? 1) - 1;

                            if (remaining > 0) {
                                removals.set(id, remaining);
                            } else {
                                removals.delete(id);
                            }
                        });

                        if (failed) {
                            onFailure(operations, failure);
                        }
                    }
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
