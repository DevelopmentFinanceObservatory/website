/**
 * What the chat keeps when the page leaves the harness session behind a
 * conversation (useChat's `leaveSession`): the harness holds no session
 * under the id, or a new one began under it.
 */

import type { ChatMessage, ChatState } from '@/components/organisms/Studio/hooks/useChat';

import { withoutCardOffers } from './cardUnit.ts';
import { withoutChips } from './chips.ts';
import { forkRecap, isPrompt, isRefundedPrompt, withSessionLeft } from './transcript.ts';

/**
 * The chat once its session is left: the transcript inherited from `turn`'s
 * prompt back (withSessionLeft), with no answer's chips and no card's unit
 * offers, since the session that offered them is gone, and no plan or
 * question card, since the pause they answer went with it.
 */
export const sessionLeftChat = (prev: ChatState, turn?: number): ChatState => ({
    ...prev,
    messages: withoutChips(withSessionLeft(prev.messages, turn)),
    widgets: withoutCardOffers(prev.widgets),
    plan: null,
    clarify: null,
});

// `messages` without the turns whose prompt was refunded: each such prompt
// and what follows it up to the next prompt. The harness never ran them, and
// the user sends a refused prompt again, so a recap carrying one would carry
// it twice.
const withoutRefundedTurns = (messages: readonly ChatMessage[]): ChatMessage[] => {
    let dropping = false;

    return messages.filter((message) => {
        if (isPrompt(message)) {
            dropping = isRefundedPrompt(message);
        }

        return !dropping;
    });
};

/**
 * The recap the next turn opens a new session with (forkRecap), for a
 * conversation the page left or reopened without its session. With
 * `refused`, the page turn whose request found the session gone, the recap
 * stops before that turn's prompt, since the user sends it again and the
 * recap would carry it twice. Refunded prompts and their replies stay out
 * for the same reason.
 */
export const sessionRecap = (messages: readonly ChatMessage[], refused?: number): string | null => {
    const at =
        refused === undefined
            ? -1
            : messages.findLastIndex(
                  (message) =>
                      message.role === 'user' && !message.answer && message.turn === refused,
              );

    return forkRecap(withoutRefundedTurns(at < 0 ? messages : messages.slice(0, at)));
};
