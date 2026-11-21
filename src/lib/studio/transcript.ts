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

// A prompt that opened a turn of this conversation's harness session: not
// an answer, not refunded, and not inherited from the conversation a fork
// copied.
const isOwnPrompt = (message: ChatMessage): message is Extract<ChatMessage, { role: 'user' }> =>
    message.role === 'user' && isPrompt(message) && !message.refunded && !message.inherited;

/**
 * The harness turn each of the conversation's own prompts opened, keyed by
 * the prompt's position in `messages`: its `harnessTurn`, else one past the
 * prompt before it. A save from before prompts carried their turn, or one
 * saved before its latest prompt's turn arrived, counts on from the last
 * prompt that has one. A refunded prompt opened no turn, and an inherited one
 * (a fork's copy of another conversation) none of this conversation's.
 */
export const promptTurns = (messages: readonly ChatMessage[]): Map<number, number> => {
    const turns = new Map<number, number>();
    let turn = 0;

    for (const [at, message] of messages.entries()) {
        if (isOwnPrompt(message)) {
            turn = message.harnessTurn ?? turn + 1;
            turns.set(at, turn);
        }
    }

    return turns;
};

/** The latest harness turn the transcript holds, 0 for none. */
export const heldTurns = (messages: readonly ChatMessage[]): number =>
    [...promptTurns(messages).values()].at(-1) ?? 0;

/**
 * The `since` to read the harness's state with: the turn before the lowest
 * one the transcript lacks, so a turn another tab ran comes back, else the
 * turn before the latest, so that turn comes back too when it closed after
 * the page left with its reply still empty.
 */
export const readSince = (messages: readonly ChatMessage[]): number => {
    const held = new Set(promptTurns(messages).values());
    const latest = heldTurns(messages);
    let lacking = 1;

    while (held.has(lacking)) {
        lacking += 1;
    }

    return Math.max(0, Math.min(lacking, latest) - 1);
};

/** The transcript as a fork inherits it: every message marked `inherited`,
 *  so none of its prompts keys a turn of the fork's own session. */
export const withInherited = (messages: ChatMessage[]): ChatMessage[] =>
    messages.every((message) => message.inherited)
        ? messages
        : messages.map((message) => ({ ...message, inherited: true }));

/**
 * A save from before prompts carried their turn, against `latest`, the
 * latest turn its harness session holds: when it has more accepted prompts
 * than that, it is a fork that went on from a copied transcript, and the
 * messages before its own `latest` prompts are inherited. The session's
 * turns are its last ones, so they are counted from the end. Unchanged for
 * a transcript that keys or marks any message.
 */
export const withInheritedBefore = (messages: ChatMessage[], latest: number): ChatMessage[] => {
    if (
        messages.some(
            (message) => message.inherited || (message.role === 'user' && message.harnessTurn),
        )
    ) {
        return messages;
    }

    const prompts = [...promptTurns(messages).keys()];
    const inherited = prompts.length - latest;

    if (inherited <= 0) {
        return messages;
    }

    const own = prompts[inherited] ?? messages.length;

    return messages.map((message, at) => (at < own ? { ...message, inherited: true } : message));
};

/**
 * The transcript with the harness turn `index` on the prompt that opened it:
 * the last prompt not refunded, since a new turn waits until the one in
 * flight ends and a refused one opened no turn. A prompt that already
 * carries `index` is left as it is.
 */
export const withHarnessTurn = (messages: ChatMessage[], index: number): ChatMessage[] => {
    const at = messages.findLastIndex(isOwnPrompt);
    const prompt = messages[at];

    if (prompt?.role !== 'user' || prompt.harnessTurn === index) {
        return messages;
    }

    return messages.map((message, other) =>
        other === at ? { ...prompt, harnessTurn: index } : message,
    );
};

/**
 * The transcript holding harness turn `index`: unchanged when a prompt
 * already holds it, else with `userMessage` as the turn's prompt and an
 * empty reply, placed by index: before the first prompt of a later turn
 * (one another tab's turn went ahead of), else after the last message.
 */
export const ensureTurn = (
    messages: ChatMessage[],
    index: number,
    userMessage: string,
): ChatMessage[] => {
    const turns = [...promptTurns(messages)];

    if (turns.some(([, turn]) => turn === index)) {
        return messages;
    }

    const at = turns.find(([, turn]) => turn > index)?.[0] ?? messages.length;

    return [
        ...messages.slice(0, at),
        { role: 'user', text: userMessage, harnessTurn: index },
        { role: 'bot', text: '' },
        ...messages.slice(at),
    ];
};

/**
 * The position of harness turn `index`'s reply: the last bot message after
 * the latest prompt that opened that turn and before the next prompt. -1
 * when no prompt holds the turn or it has no reply yet.
 */
export const turnReplyAt = (messages: readonly ChatMessage[], index: number): number => {
    const prompt = [...promptTurns(messages)].findLast(([, turn]) => turn === index)?.[0];

    if (prompt === undefined) {
        return -1;
    }

    const next = messages.findIndex((message, at) => at > prompt && isPrompt(message));
    const reply = messages
        .slice(prompt + 1, next === -1 ? messages.length : next)
        .findLastIndex((message) => message.role === 'bot');

    return reply === -1 ? -1 : prompt + 1 + reply;
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
