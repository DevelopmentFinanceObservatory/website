import type { CompositionManifest, MutationOperation } from './wire';

import { legacyCanvasWidgetsOf, type CanvasState } from '../chat/canvas.ts';

/** The harness canvas this page last saw: which composition, at which
 *  revision, holding which cards, and which of them the manifest pins
 *  (`pinned`, absent on a legacy canvas and on a baseline saved before the
 *  page kept it). A null `compositionId` marks a legacy canvas: the cards a
 *  save from before the page kept the manifest showed, which the harness's
 *  manifest has not yet been brought to (createLegacyCanvas). */
export type CanvasBaseline = {
    compositionId: string | null;
    revision: number;
    ids: string[];
    pinned?: string[];
};

/** The canvas a save reopens with: its saved baseline, else, for a save
 *  from before the page kept the manifest, a legacy canvas of the harness
 *  cards it showed. A fork's inherited cards (`localIds`) are no harness
 *  cards, so the baseline leaves them out. */
export const restoreCanvas = (
    saved:
        | ({ sessionId: string | null; canvas?: CanvasBaseline | null } & Pick<
              CanvasState,
              'widgets'
          > &
              Partial<Omit<CanvasState, 'widgets'>>)
        | undefined,
): CanvasBaseline | null => {
    if (!saved?.sessionId) {
        return null;
    }

    if (saved.canvas) {
        return saved.canvas;
    }

    const removed = new Set([...(saved.removedIds ?? []), ...(saved.localIds ?? [])]);

    return {
        compositionId: null,
        revision: -1,
        ids: legacyCanvasWidgetsOf({
            widgets: saved.widgets,
            pinnedIds: saved.pinnedIds ?? [],
            graceIds: saved.graceIds,
            graceTurn: saved.graceTurn,
        })
            .filter((widget) => !removed.has(widget.id))
            .map((widget) => widget.id),
    };
};

/**
 * Take a canvas manifest as the new baseline, or null for a manifest of the
 * same composition no newer than the baseline (a frame or response arriving
 * late), which changes nothing. A manifest of another composition (a forked
 * conversation's new session, or the first after a legacy canvas) starts a
 * new baseline.
 */
export const takeManifest = (
    previous: CanvasBaseline | null,
    manifest: CompositionManifest,
): CanvasBaseline | null =>
    previous?.compositionId === manifest.composition_id && manifest.revision <= previous.revision
        ? null
        : {
              compositionId: manifest.composition_id,
              revision: manifest.revision,
              ids: manifest.blocks.map((block) => block.component_id),
              pinned: manifest.blocks
                  .filter((block) => block.pinned)
                  .map((block) => block.component_id),
          };

/**
 * The cards a legacy save (see restoreCanvas) holds that its canvas hid, with
 * the revision the save held each at (`revisions`, restoreCardRevisions), or
 * null where the save does not know it: its widgets less the ones it showed
 * and less a fork's named inherited cards.
 */
export const legacyHiddenCards = (
    saved: { widgets: readonly { id: string }[]; localIds?: readonly string[] },
    baseline: CanvasBaseline,
    revisions: ReadonlyMap<string, number>,
): Map<string, number | null> => {
    const shown = new Set([...baseline.ids, ...(saved.localIds ?? [])]);

    return new Map(
        saved.widgets
            .filter((widget) => !shown.has(widget.id))
            .map((widget) => [widget.id, revisions.get(widget.id) ?? null] as const),
    );
};

/** The cards a legacy canvas's save holds that the harness's manifest
 *  lacks, so the harness never held them (a fork's inherited cards): the
 *  ones the page showed, and the ones it hid, which stay off the canvas. */
export type LegacyLocal = { shown: string[]; hidden: string[] };

/**
 * A legacy canvas (see CanvasBaseline) while the harness's manifest is
 * brought to it. The harness holds every card such a conversation drew,
 * because the page that saved it never reported the cards its turn rule hid.
 * The first manifest `offer`ed sends one `remove` for each card the save hid
 * (`hidden`, legacyHiddenCards) that the manifest holds at no newer revision
 * than the save did, against the manifest's revision (`expected_revision`).
 * A card the save never held, such as one another tab's turn drew since, one
 * revised since the save, and one whose saved revision is unknown, stays.
 * The same request sends a `pin` for each card the save showed pinned
 * (`pinned`) that the manifest holds unpinned, since the page that saved it
 * kept its pins to itself. `onTake` hears the manifest that
 * answers, then any later one offered meanwhile, as the canvas to take from
 * then on. Before it, `onLocal` hears the cards the save held that the
 * offered manifest lacks, cards the harness never held such as a fork's
 * inherited ones, which stay on the page as local cards, those the page hid
 * staying off the canvas.
 * Until then the canvas shows `ids()`: the legacy cards plus the cards drawn
 * since (`keep`), less the ones the user took off (`drop`), and `onChange`
 * hears each change. A failed `remove`, a stale revision included, leaves
 * the canvas legacy, so the save stays legacy and the next open tries again
 * against the manifest it then reads.
 */
export const createLegacyCanvas = ({
    ids,
    hidden,
    pinned,
    mutate,
    onTake,
    onLocal,
    onChange,
}: {
    ids: readonly string[];
    hidden: ReadonlyMap<string, number | null>;
    pinned: readonly string[];
    mutate: (
        operations: MutationOperation[],
        expectedRevision: number,
    ) => Promise<CompositionManifest | null>;
    onTake: (manifest: CompositionManifest) => void;
    onLocal: (local: LegacyLocal) => void;
    onChange: (ids: string[]) => void;
}) => {
    const shown = new Set(ids);
    let state: 'waiting' | 'sent' | 'failed' | 'taken' = 'waiting';
    // The newest manifest offered while the `remove` was in flight.
    let later: CompositionManifest | null = null;

    const take = (manifest: CompositionManifest, local: LegacyLocal) => {
        state = 'taken';

        if (local.shown.length > 0 || local.hidden.length > 0) {
            onLocal(local);
        }

        onTake(manifest);

        if (later && later.revision > manifest.revision) {
            onTake(later);
        }

        later = null;
    };

    return {
        ids: (): string[] => [...shown],
        keep: (id: string) => {
            if (state !== 'taken' && !shown.has(id)) {
                shown.add(id);
                onChange([...shown]);
            }
        },
        drop: (id: string) => {
            if (state !== 'taken' && shown.delete(id)) {
                onChange([...shown]);
            }
        },
        offer: async (manifest: CompositionManifest): Promise<void> => {
            if (state === 'taken' || state === 'failed') {
                return;
            }

            if (state === 'sent') {
                later = later && later.revision >= manifest.revision ? later : manifest;

                return;
            }

            const held = new Set(manifest.blocks.map((block) => block.component_id));
            const local = {
                shown: [...shown].filter((id) => !held.has(id)),
                hidden: [...hidden.keys()].filter((id) => !shown.has(id) && !held.has(id)),
            };
            const removed = manifest.blocks
                .filter((block) => {
                    const revision = hidden.get(block.component_id);

                    return (
                        revision !== undefined &&
                        revision !== null &&
                        block.revision <= revision &&
                        !shown.has(block.component_id)
                    );
                })
                .map((block) => block.component_id);
            const pins = manifest.blocks
                .filter(
                    (block) =>
                        !block.pinned &&
                        pinned.includes(block.component_id) &&
                        shown.has(block.component_id),
                )
                .map((block) => block.component_id);
            const operations: MutationOperation[] = [
                ...removed.map((id) => ({ op: 'remove' as const, component_id: id })),
                ...pins.map((id) => ({ op: 'pin' as const, component_id: id })),
            ];

            if (operations.length === 0) {
                take(manifest, local);

                return;
            }

            state = 'sent';

            const answer = await mutate(operations, manifest.revision).catch((error: unknown) => {
                console.warn('Studio: a legacy canvas was not brought to the harness', error);

                return null;
            });

            if (answer) {
                take(answer, local);
            } else {
                state = 'failed';
                later = null;
            }
        },
    };
};

export type LegacyCanvas = ReturnType<typeof createLegacyCanvas>;
