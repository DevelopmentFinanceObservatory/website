/**
 * What the chat keeps when the page leaves the harness session behind a
 * conversation (useChat's `leaveSession`): the harness holds no session
 * under the id, or a new one began under it.
 */

import type { ChatMessage, ChatState } from '@/components/organisms/Studio/hooks/useChat';

import { withoutUnitChanges } from './cardUnit.ts';
import { withoutChips } from './chips.ts';
import { forkRecap, withSessionLeft } from './transcript.ts';

/**
 * The chat once its session is left: the transcript inherited from `turn`'s
 * prompt back (withSessionLeft), with no answer's chips and no card's unit
 * offers, since the session that offered them is gone, and no plan or
 * question card, since the pause they answer went with it.
 */
export const sessionLeftChat = (prev: ChatState, turn?: number): ChatState => ({
    ...prev,
    messages: withoutChips(withSessionLeft(prev.messages, turn)),
    widgets: withoutUnitChanges(prev.widgets),
    plan: null,
    clarify: null,
});

/**
 * The recap the next turn opens a new session with (forkRecap). With
 * `refused`, the page turn whose request found the session gone, the recap
 * stops before that turn's prompt, since the user sends it again and the
 * recap would carry it twice.
 */
export const sessionRecap = (messages: readonly ChatMessage[], refused?: number): string | null => {
    const at =
        refused === undefined
            ? -1
            : messages.findLastIndex(
                  (message) =>
                      message.role === 'user' && !message.answer && message.turn === refused,
              );

    return forkRecap(at < 0 ? messages : messages.slice(0, at));
};
