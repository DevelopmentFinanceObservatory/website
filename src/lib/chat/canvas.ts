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
 * The cards a canvas shows, then the user's text cards. Each card has one
 * owner of whether it shows. The harness's composition manifest (`canvas`)
 * decides for the cards the harness holds, so cards accumulate across turns
 * until the user or the model takes them off, and a card the model takes
 * off and draws again shows again. `removedIds` decides for the cards the
 * harness never held: `localIds` (a fork's inherited cards) and the text
 * cards. A save with neither `canvas` nor `localIds`, one from before the
 * page kept the manifest or a one-card share, keeps the rule it was drawn
 * under (`legacyCanvasWidgetsOf`), so an old conversation does not show every
 * card it ever drew. The owner's Studio, a share viewer, an embed and the
 * live-share checks all read the canvas through this function.
 */
export const canvasWidgetsOf = (state: CanvasState): Widget[] => {
    const { widgets, removedIds, textCards = [], canvas, localIds = [] } = state;
    const removed = new Set(removedIds);
    const shown = (widget: Widget) => !removed.has(widget.id);
    const local = new Set(localIds);
    const held = new Set(canvas?.ids ?? []);
    const cards =
        canvas || local.size > 0
            ? widgets.filter((widget) =>
                  local.has(widget.id) ? shown(widget) : held.has(widget.id),
              )
            : legacyCanvasWidgetsOf(state).filter(shown);

    return [...cards, ...textCards.filter(shown)];
};

/**
 * Whether the harness holds card `id`, so its canvas edits go to the
 * harness and its manifest decides whether it shows. A text card and a
 * fork's inherited card (`localIds`) live only on the page.
 */
export const isHarnessCard = (
    { widgets, localIds = [] }: Pick<CanvasState, 'widgets' | 'localIds'>,
    id: string,
): boolean => widgets.some((widget) => widget.id === id) && !localIds.includes(id);

/**
 * The canvas half of a fork of `saved`, a conversation with no harness
 * session behind it. Every card it inherits is local (`localIds`), and the
 * ones its canvas did not show are removed, so Add brings one back on the
 * page alone.
 */
export const forkedCanvas = (
    saved: CanvasState,
): Pick<CanvasState, 'canvas' | 'localIds' | 'removedIds'> => {
    const shown = new Set(canvasWidgetsOf(saved).map((widget) => widget.id));
    const hidden = saved.widgets
        .filter((widget) => !shown.has(widget.id))
        .map((widget) => widget.id);

    return {
        canvas: null,
        localIds: saved.widgets.map((widget) => widget.id),
        removedIds: [...new Set([...saved.removedIds, ...hidden])],
    };
};
