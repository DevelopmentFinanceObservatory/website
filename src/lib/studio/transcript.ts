import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { ShareMark } from '@/lib/chat/history';

/**
 * A user message that opens a turn. A user's answer to a paused turn (a
 * clarify choice, typed text, a plan amendment) continues that turn, so it
 * neither numbers turns nor counts as a prompt sent.
 */
export const isPrompt = (message: ChatMessage): boolean =>
    message.role === 'user' && !message.answer;

/** A prompt the harness refused before its turn started, which the site's
 *  prompt meter gave back, so it no longer counts against a guest's limit. */
export const isRefundedPrompt = (message: ChatMessage): boolean =>
    message.role === 'user' && !!message.refunded;

/**
 * The transcript with the user's answer to a paused turn. It goes before the
 * turn's reply, which the resumed stream goes on writing into.
 */
export const withAnswer = (messages: ChatMessage[], text: string): ChatMessage[] => {
    const answer: ChatMessage = { role: 'user', text, answer: true };
    const last = messages[messages.length - 1];

    return last?.role === 'bot' ? [...messages.slice(0, -1), answer, last] : [...messages, answer];
};

/**
 * The index of the message a Chat + Canvas share mark follows: the one
 * before the first user message the share did not hold (an answer can go in
 * before a paused turn's reply, so a message count would drift), else the
 * last. Marks saved without `userMessages` keep their message count.
 */
export const shareMarkAfter = (messages: ChatMessage[], mark: ShareMark): number => {
    if (mark.userMessages === undefined) {
        return mark.messageIndex - 1;
    }

    let users = 0;

    for (const [index, message] of messages.entries()) {
        if (message.role === 'user' && users++ === mark.userMessages) {
            return index - 1;
        }
    }

    return messages.length - 1;
};
