import type { CompositionManifest } from './wire';

import { canvasWidgetsOf, type CanvasState } from '../chat/canvas.ts';

/** The harness canvas this page last saw: which composition, at which
 *  revision, holding which cards. */
export type CanvasBaseline = { compositionId: string | null; revision: number; ids: string[] };

/** Restore legacy saves from their visible harness cards until the first manifest. */
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

    return (
        saved.canvas ?? {
            compositionId: null,
            revision: -1,
            ids: canvasWidgetsOf({
                widgets: saved.widgets,
                pinnedIds: saved.pinnedIds ?? [],
                removedIds: saved.removedIds ?? [],
                graceIds: saved.graceIds,
                graceTurn: saved.graceTurn,
            }).map((widget) => widget.id),
        }
    );
};

/**
 * Take a canvas manifest: the new baseline, and the cards it took off since
 * the previous one (the agent removing cards, or a replaced card's old id).
 * A manifest no newer than the baseline (a frame or response arriving late)
 * changes nothing: null. A manifest of another composition (a forked
 * conversation's new session) starts a new baseline and takes nothing off.
 */
export const takeManifest = (
    previous: CanvasBaseline | null,
    manifest: CompositionManifest,
): { baseline: CanvasBaseline; removed: string[] } | null => {
    const same =
        previous !== null &&
        (previous.compositionId === null || previous.compositionId === manifest.composition_id);

    if (same && previous && manifest.revision <= previous.revision) {
        return null;
    }

    const ids = manifest.blocks.map((block) => block.component_id);
    const kept = new Set(ids);

    return {
        baseline: { compositionId: manifest.composition_id, revision: manifest.revision, ids },
        removed: same && previous ? previous.ids.filter((id) => !kept.has(id)) : [],
    };
};
