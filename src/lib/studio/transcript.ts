import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { ShareMark } from '@/lib/chat/history';

/**
 * A user message that opens a turn. A user's answer to a paused turn (a
 * clarify choice, typed text, a plan amendment) continues that turn, so it
 * neither numbers turns nor counts as a prompt sent.
 */
export const isPrompt = (message: ChatMessage): boolean =>
    message.role === 'user' && !message.answer;

/** A prompt whose turn was refused, which the site's prompt meter gave
 *  back, so it no longer counts against a guest's limit. */
export const isRefundedPrompt = (message: ChatMessage): boolean =>
    message.role === 'user' && !!message.refunded;

/** The transcript once the turn its last prompt opened was refused: that
 *  prompt marked refunded. A refused turn is the latest, since a new turn
 *  waits until the one in flight ends. */
export const withRefundedPrompt = (messages: ChatMessage[]): ChatMessage[] => {
    const index = messages.findLastIndex(isPrompt);
    const prompt = messages[index];

    if (prompt?.role !== 'user' || prompt.refunded) {
        return messages;
    }

    return messages.map((message, at) => (at === index ? { ...prompt, refunded: true } : message));
};

/**
 * The transcript with the user's answer to a paused turn. It goes before the
 * turn's reply, which the resumed stream goes on writing into.
 */
export const withAnswer = (messages: ChatMessage[], text: string): ChatMessage[] => {
    const answer: ChatMessage = { role: 'user', text, answer: true };
    const last = messages[messages.length - 1];

    return last?.role === 'bot' ? [...messages.slice(0, -1), answer, last] : [...messages, answer];
};

/** The note a turn shows when the user's change to its plan asked a
 *  different question, which goes on as the next turn. */
export const NEW_QUESTION_NOTE = '_Taken as a new question._';

/**
 * The transcript once the harness took the user's change to the plan as a
 * new question (`done`'s `new_question`): the plan card closes, so the turn's
 * empty reply says so, and the typed text leaves the turn, since the next
 * turn opens with it.
 */
export const withNewQuestion = (messages: ChatMessage[], question: string): ChatMessage[] => {
    const reply = messages.at(-1);

    if (reply?.role !== 'bot') {
        return messages;
    }

    const typed = messages.at(-2);
    const kept =
        typed?.role === 'user' && typed.answer && typed.text === question
            ? messages.slice(0, -2)
            : messages.slice(0, -1);

    return [...kept, reply.text ? reply : { ...reply, text: NEW_QUESTION_NOTE }];
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
