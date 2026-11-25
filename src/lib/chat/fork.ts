import { withInherited } from '../studio/transcript.ts';

import { forkedCanvas, withUnheldShownCards } from './canvas.ts';
import type { SavedConversation } from './history.ts';

/**
 * A fork of `saved`, a conversation with no harness session behind it. Its
 * messages are inherited, so none of their turn keys numbers the fork's own
 * session, and its cards are local (forkedCanvas). It clears the source
 * page's `saveWriter` and `saveSeq`, which order the source's saves only.
 */
export const forkOf = (
    saved: SavedConversation,
): Pick<
    SavedConversation,
    'messages' | 'canvas' | 'localIds' | 'removedIds' | 'owedRemovals' | 'saveWriter' | 'saveSeq'
> => ({
    messages: withInherited(saved.messages),
    ...forkedCanvas(saved),
    saveWriter: undefined,
    saveSeq: undefined,
});

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
