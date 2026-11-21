import { withInherited } from '../studio/transcript.ts';

import { forkedCanvas } from './canvas.ts';
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
 * A saved conversation as Studio opens it. A save with no harness session is
 * a fork that has not run a turn yet, so it holds no turn and no card of its
 * own. Its messages are inherited and, for a fork saved before forks named
 * their local cards, its cards become local (forkOf).
 */
export const openedSave = (saved: SavedConversation): SavedConversation => {
    if (saved.sessionId) {
        return saved;
    }

    return saved.localIds
        ? { ...saved, messages: withInherited(saved.messages) }
        : { ...saved, ...forkOf(saved) };
};
