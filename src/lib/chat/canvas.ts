import type { SavedConversation } from './history.ts';
import type { Widget } from './widgets.ts';

/** The part of a conversation that decides which cards its canvas shows. */
export type CanvasState = Pick<
    SavedConversation,
    | 'widgets'
    | 'pinnedIds'
    | 'removedIds'
    | 'graceIds'
    | 'graceTurn'
    | 'textCards'
    | 'canvas'
    | 'localIds'
>;

/**
 * The cards a save from before the page kept the harness manifest showed:
 * the latest turn's widgets plus every widget pinned or on grace. A grace set
 * stamped with an older turn is one the latest turn replaced.
 */
export const legacyCanvasWidgetsOf = ({
    widgets,
    pinnedIds,
    graceIds = [],
    graceTurn = 0,
}: Pick<CanvasState, 'widgets' | 'pinnedIds' | 'graceIds' | 'graceTurn'>): Widget[] => {
    const latestTurn = widgets.reduce((max, widget) => Math.max(max, widget.turn), 0);
    const grace = graceTurn === latestTurn ? graceIds : [];

    return widgets.filter(
        (widget) =>
            widget.turn === latestTurn ||
            pinnedIds.includes(widget.id) ||
            grace.includes(widget.id),
    );
};

/**
 * The cards a canvas shows, then the user's text cards; removed cards never.
 * The harness's composition manifest (`canvas`) decides which of its cards
 * are on the canvas, so cards accumulate across turns until the user or the
 * model takes them off. `localIds` are cards the harness session never held
 * (a fork's inherited cards), shown until removed. A save with neither, one
 * from before the page kept the manifest or a one-card share, keeps the rule
 * it was drawn under (`legacyCanvasWidgetsOf`), so an old conversation does
 * not show every card it ever drew. The owner's Studio, a share viewer, an
 * embed and the live-share checks all read the canvas through this function.
 */
export const canvasWidgetsOf = (state: CanvasState): Widget[] => {
    const { widgets, removedIds, textCards = [], canvas, localIds } = state;
    const removed = new Set(removedIds);
    const shown = (widget: Widget) => !removed.has(widget.id);
    const members =
        canvas || localIds?.length ? new Set([...(canvas?.ids ?? []), ...(localIds ?? [])]) : null;
    const harnessCards = members
        ? widgets.filter((widget) => members.has(widget.id))
        : legacyCanvasWidgetsOf(state);

    return [...harnessCards.filter(shown), ...textCards.filter(shown)];
};
