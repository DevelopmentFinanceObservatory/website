import { withInherited } from '../studio/transcript.ts';

import { forkedCanvas, legacyCanvasWidgetsOf } from './canvas.ts';
import type { SavedConversation } from './history.ts';

/**
 * A fork of `saved`, a conversation with no harness session behind it. Its
 * messages are inherited, so none of their turn keys numbers the fork's own
 * session, and its cards are local (forkedCanvas).
 */
export const forkOf = (
    saved: SavedConversation,
): Pick<SavedConversation, 'messages' | 'canvas' | 'localIds' | 'removedIds'> => ({
    messages: withInherited(saved.messages),
    ...forkedCanvas(saved),
});

/**
 * `saved` with the cards it showed that its harness never held marked local,
 * for a save whose baseline names a composition but carries no pins. The
 * page that saved it showed cards by the turn rule (legacyCanvasWidgetsOf),
 * pinned and grace cards included, whatever the manifest held, while a
 * baseline shows only the cards it holds. A card the rule showed that the
 * baseline lacks and the user did not remove becomes local, as a fork's
 * cards do, and keeps showing. A legacy baseline (no composition) holds the
 * cards the rule showed already, less the ones the user took off since.
 */
const withUnheldShownCards = (saved: SavedConversation): SavedConversation => {
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

/**
 * A saved conversation as Studio opens it. A save with no harness session is
 * a fork that has not run a turn yet, so it holds no turn and no card of its
 * own. Its messages are inherited and, for a fork saved before forks named
 * their local cards, its cards become local (forkOf). A save whose baseline
 * predates manifest pins keeps the cards it showed (withUnheldShownCards).
 */
export const openedSave = (stored: SavedConversation): SavedConversation => {
    const saved = withUnheldShownCards(stored);

    if (saved.sessionId) {
        return saved;
    }

    return stored.localIds
        ? { ...saved, messages: withInherited(saved.messages) }
        : { ...saved, ...forkOf(saved) };
};
