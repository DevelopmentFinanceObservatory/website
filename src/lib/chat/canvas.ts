import type { SavedConversation } from './history.ts';
import type { Widget } from './widgets.ts';

/** The part of a conversation that decides which cards its canvas shows. */
export type CanvasState = Pick<
    SavedConversation,
    'widgets' | 'pinnedIds' | 'removedIds' | 'graceIds' | 'graceTurn' | 'textCards'
>;

/** The newest turn among `widgets`, 0 when there are none. */
export const latestTurnOf = (widgets: CanvasState['widgets']): number =>
    widgets.reduce((max, widget) => Math.max(max, widget.turn), 0);

/**
 * The cards a canvas shows: the latest turn's widgets plus every widget
 * pinned or on grace, then the user's text cards; removed cards never. A
 * grace set stamped with an older turn is one the latest turn replaced. The
 * owner's Studio, a share viewer, and the live-share checks all read the
 * canvas through this function.
 */
export const canvasWidgetsOf = ({
    widgets,
    pinnedIds,
    removedIds,
    graceIds = [],
    graceTurn = 0,
    textCards = [],
}: CanvasState): Widget[] => {
    const latestTurn = latestTurnOf(widgets);
    const grace = graceTurn === latestTurn ? graceIds : [];
    const removed = new Set(removedIds);

    return [
        ...widgets.filter(
            (widget) =>
                !removed.has(widget.id) &&
                (widget.turn === latestTurn ||
                    pinnedIds.includes(widget.id) ||
                    grace.includes(widget.id)),
        ),
        ...textCards.filter((card) => !removed.has(card.id)),
    ];
};
