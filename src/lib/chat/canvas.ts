import { owedIds, owedRemovalsOf } from '../studio/owedRemovals.ts';
import type { SavedConversation } from './history.ts';
import type { CardRef, TextWidget } from './widgets.ts';

/** What the canvas rules read of a card: its id, its turn and its revision. */
export type CanvasCard = { id: string; turn: number; ref?: CardRef };

/** The part of a conversation that decides which cards its canvas shows,
 *  with cards of type `Card`, by default the conversation's own. */
export type CanvasState<Card extends CanvasCard = SavedConversation['widgets'][number]> = {
    widgets: Card[];
} & Pick<
    SavedConversation,
    | 'pinnedIds'
    | 'removedIds'
    | 'graceIds'
    | 'graceTurn'
    | 'textCards'
    | 'canvas'
    | 'localIds'
    | 'owedRemovals'
>;

/**
 * The cards a save from before the page kept the harness manifest showed:
 * the latest turn's widgets plus every widget pinned or on grace. A grace set
 * stamped with an older turn is one the latest turn replaced.
 */
export const legacyCanvasWidgetsOf = <Card extends CanvasCard>({
    widgets,
    pinnedIds,
    graceIds = [],
    graceTurn = 0,
}: Pick<CanvasState<Card>, 'widgets' | 'pinnedIds' | 'graceIds' | 'graceTurn'>): Card[] => {
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
 * card it ever drew. A harness card owed removal (owedRemovalsOf) stays off
 * whatever the manifest holds, until the harness confirms the removal. The
 * owner's Studio, a share viewer, an embed, a share's slots and the
 * live-share checks all read the canvas through this function.
 */
export const canvasWidgetsOf = <Card extends CanvasCard>(
    state: CanvasState<Card>,
): (Card | TextWidget)[] => {
    const { widgets, removedIds, textCards = [], canvas, localIds = [] } = state;
    const removed = new Set(removedIds);
    const shown = (widget: { id: string }) => !removed.has(widget.id);
    const local = new Set(localIds);
    const held = new Set(canvas?.ids ?? []);
    const owed = owedIds(owedRemovalsOf(state));
    const cards =
        canvas || local.size > 0
            ? widgets.filter((widget) =>
                  local.has(widget.id)
                      ? shown(widget)
                      : held.has(widget.id) && !owed.has(widget.id),
              )
            : legacyCanvasWidgetsOf(state).filter(
                  (widget) => shown(widget) && !owed.has(widget.id),
              );

    return [...cards, ...textCards.filter(shown)];
};

/**
 * `saved` with the cards it showed that its harness never held marked local,
 * for a save whose baseline names a composition but carries no pins. The
 * page that saved it showed cards by the turn rule (legacyCanvasWidgetsOf),
 * pinned and grace cards included, whatever the manifest held, while a
 * baseline shows only the cards it holds. A card the rule showed that the
 * baseline lacks and the user did not remove becomes local, as a fork's
 * cards do, and keeps showing. A legacy baseline (no composition) holds the
 * cards the rule showed already, less the ones the user took off since.
 * Studio's open (openedSave) and share viewer, an embed, and a share's
 * slots (savedCanvasWidgetsOf) all read a stored conversation through it,
 * so each shows the cards the page that saved it showed.
 */
export const withUnheldShownCards = <State extends CanvasState<CanvasCard>>(
    saved: State,
): State => {
    const { canvas } = saved;

    if (!canvas || canvas.compositionId === null || canvas.pinned) {
        return saved;
    }

    const held = new Set([...canvas.ids, ...(saved.localIds ?? []), ...saved.removedIds]);
    const unheld = legacyCanvasWidgetsOf(saved)
        .map((widget) => widget.id)
        .filter((id) => !held.has(id));

    return unheld.length === 0
        ? saved
        : { ...saved, localIds: [...(saved.localIds ?? []), ...unheld] };
};

/** The cards a stored conversation's canvas shows (canvasWidgetsOf), with
 *  the cards its page showed that its harness never held kept
 *  (withUnheldShownCards). */
export const savedCanvasWidgetsOf = <Card extends CanvasCard>(
    saved: CanvasState<Card>,
): (Card | TextWidget)[] => canvasWidgetsOf(withUnheldShownCards(saved));

/**
 * Whether the harness holds card `id`, so its canvas edits go to the
 * harness and its manifest decides whether it shows. A text card and a
 * fork's inherited card (`localIds`) live only on the page.
 */
export const isHarnessCard = (
    {
        widgets,
        localIds = [],
    }: { widgets: readonly { id: string }[]; localIds?: readonly string[] },
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
): Pick<CanvasState, 'canvas' | 'localIds' | 'removedIds' | 'owedRemovals'> => {
    const shown = new Set(canvasWidgetsOf(saved).map((widget) => widget.id));
    const hidden = saved.widgets
        .filter((widget) => !shown.has(widget.id))
        .map((widget) => widget.id);

    // A card the source shows stays shown, whatever its `removedIds` lists.
    return {
        canvas: null,
        localIds: saved.widgets.map((widget) => widget.id),
        removedIds: [...new Set([...saved.removedIds.filter((id) => !shown.has(id)), ...hidden])],
        owedRemovals: [],
    };
};
