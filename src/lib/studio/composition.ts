import type { CompositionManifest, MutationOperation } from './wire';

import { legacyCanvasWidgetsOf, type CanvasState } from '../chat/canvas.ts';

/** The harness canvas this page last saw: which composition, at which
 *  revision, holding which cards. A null `compositionId` marks a legacy
 *  canvas: the cards a save from before the page kept the manifest showed,
 *  which the harness's manifest has not yet been brought to
 *  (createLegacyCanvas). */
export type CanvasBaseline = { compositionId: string | null; revision: number; ids: string[] };

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
          };

/**
 * A legacy canvas (see CanvasBaseline) while the harness's manifest is
 * brought to it. The harness holds every card such a conversation ever drew,
 * because the page that saved it never reported the cards its turn rule
 * hid. The first manifest `offer`ed sends one `remove` for each card on it
 * that the page does not show, and `onTake` hears the manifest that answers,
 * then any later one offered meanwhile, as the canvas to take from then on.
 * Before it, `onLocal` hears the cards the page shows that the answer lacks,
 * cards the harness never held such as a fork's inherited ones, which stay
 * on the page as local cards.
 * Until then the canvas shows `ids()`: the legacy cards plus the cards drawn
 * since (`keep`), less the ones the user took off (`drop`), and
 * `onChange` hears each change. A failed `remove` leaves the canvas legacy,
 * so the save stays legacy and the next open tries again.
 */
export const createLegacyCanvas = ({
    ids,
    mutate,
    onTake,
    onLocal,
    onChange,
}: {
    ids: readonly string[];
    mutate: (operations: MutationOperation[]) => Promise<CompositionManifest | null>;
    onTake: (manifest: CompositionManifest) => void;
    onLocal: (ids: string[]) => void;
    onChange: (ids: string[]) => void;
}) => {
    const shown = new Set(ids);
    let state: 'waiting' | 'sent' | 'failed' | 'taken' = 'waiting';
    // The newest manifest offered while the `remove` was in flight.
    let later: CompositionManifest | null = null;

    const take = (manifest: CompositionManifest) => {
        const held = new Set(manifest.blocks.map((block) => block.component_id));
        const local = [...shown].filter((id) => !held.has(id));

        state = 'taken';

        if (local.length > 0) {
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

            const hidden = manifest.blocks
                .map((block) => block.component_id)
                .filter((id) => !shown.has(id));

            if (hidden.length === 0) {
                take(manifest);

                return;
            }

            state = 'sent';

            const answer = await mutate(
                hidden.map((id) => ({ op: 'remove', component_id: id })),
            ).catch((error: unknown) => {
                console.warn('Studio: a legacy canvas was not brought to the harness', error);

                return null;
            });

            if (answer) {
                take(answer);
            } else {
                state = 'failed';
                later = null;
            }
        },
    };
};

export type LegacyCanvas = ReturnType<typeof createLegacyCanvas>;
