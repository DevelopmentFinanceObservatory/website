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
// an answer, not refunded, not inherited from the conversation a fork
// copied, and not a prompt of an unkeyed save whose turn could not be told
// (keyUnkeyedSave).
const isOwnPrompt = (message: ChatMessage): message is Extract<ChatMessage, { role: 'user' }> =>
    message.role === 'user' &&
    isPrompt(message) &&
    !message.refunded &&
    !message.inherited &&
    !message.unkeyed;

/**
 * The harness turn each of the conversation's own prompts opened, keyed by
 * the prompt's position in `messages`: its `harnessTurn`, else one past the
 * prompt before it. A prompt saved before its turn arrived counts on from
 * the last prompt that has one. A refunded prompt opened no turn, an
 * inherited one (a fork's copy of another conversation) none of this
 * conversation's, and an unkeyed one (keyUnkeyedSave) none the page can name.
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

// A fork's first turn, before forks marked their inherited messages, was
// sent as a recap of the copied transcript followed by the user's message
// (forkRecap). The harness records that whole text as the turn's prompt.
const RECAP_HEAD = 'Context \u2014 this continues an earlier conversation';
const RECAP_TAIL = '\n\nNew message:\n';
const RECAP_TURNS = 6;
const RECAP_CHARS = 700;

/**
 * The recap a conversation restored without its harness session sends before
 * its first message, so the agent picks up the thread: the last
 * RECAP_TURNS exchanges of `messages`, each cut to RECAP_CHARS. Null for a
 * transcript with no text.
 */
export const forkRecap = (messages: readonly ChatMessage[]): string | null => {
    const lines = messages
        .filter((message) => message.text.trim())
        .slice(-RECAP_TURNS * 2)
        .map((message) => {
            const text = message.text.replace(/\s+/g, ' ').trim();

            return `${message.role === 'user' ? 'User' : 'Assistant'}: ${
                text.length > RECAP_CHARS ? `${text.slice(0, RECAP_CHARS)}\u2026` : text
            }`;
        });

    return lines.length === 0
        ? null
        : `${RECAP_HEAD} (summary of the transcript so far):\n${lines.join('\n')}${RECAP_TAIL}`;
};

/** A transcript saved before prompts carried their turn: no message is
 *  keyed, marked inherited, or marked unkeyed. */
export const isUnkeyedSave = (messages: readonly ChatMessage[]): boolean =>
    messages.some(isPrompt) &&
    !messages.some(
        (message) =>
            message.inherited ||
            (message.role === 'user' && (message.harnessTurn !== undefined || message.unkeyed)),
    );

/** One harness turn as a state read words its prompt. */
export type RecordedPrompt = { turn_index: number; user_message: string };

// Whether the harness recorded `recorded` for a prompt of `text`: the text
// itself, followed by the `(then: …)` lines a paused turn's answers add.
const recordsText = (recorded: string, text: string): boolean =>
    recorded === text || recorded.startsWith(`${text}\n(then: `);

// The labels a chip prompt of `text` may name: a page shows a chip's prompt
// as its action (chipAction) or, before chips were worded as actions, as the
// option's bare label.
const CHIP_ACTIONS = ['Count as ', 'Switch to '];

const chipLabels = (text: string): string[] => [
    text,
    ...CHIP_ACTIONS.filter((action) => text.startsWith(action)).map((action) =>
        text.slice(action.length),
    ),
];

// Whether the harness recorded `recorded` for a page prompt of `text`: the
// text as recordsText reads it, or a chip's turn, which the harness records
// as `count {label}` for the option label the chip moved to.
const recordsPrompt = (recorded: string, text: string): boolean =>
    recordsText(recorded, text) ||
    chipLabels(text).some((label) => recordsText(recorded, `count ${label}`));

// The message after a recap, when `recorded` opens with one.
const afterRecap = (recorded: string): string | null => {
    if (!recorded.startsWith(RECAP_HEAD)) {
        return null;
    }

    const at = recorded.indexOf(RECAP_TAIL);

    return at === -1 ? null : recorded.slice(at + RECAP_TAIL.length);
};

/**
 * A save from before prompts carried their turn (isUnkeyedSave) keyed
 * against every turn its harness session holds, `turns`, read from turn 0.
 * A prompt takes a turn only where the match is unambiguous:
 *
 * - A turn whose recorded prompt matches one page prompt, and that prompt no
 *   other turn, pairs them, in order. A chip's turn, recorded as
 *   `count {label}`, matches the prompt that shows the chip (recordsPrompt).
 *   A fork's first turn matches on its
 *   recap: the recap of the messages before the prompt (forkRecap) followed
 *   by the prompt's text, else the text after the recap when only one prompt
 *   has it.
 * - Between two such pairs, prompts and turns of equal number whose texts
 *   match one for one pair in order.
 *
 * When the session's first turn opened with a recap, the messages before
 * its prompt are a fork's copied transcript and become `inherited`. Every
 * other prompt left without a turn is kept with its reply and marked
 * `unkeyed`, so it numbers no turn; the turns it may have been are merged in
 * from the harness's record (ensureTurn). Unchanged for a transcript that
 * is no unkeyed save.
 */
export const keyUnkeyedSave = (
    messages: ChatMessage[],
    turns: readonly RecordedPrompt[],
): ChatMessage[] => {
    if (!isUnkeyedSave(messages)) {
        return messages;
    }

    const ordered = [...turns].sort((a, b) => a.turn_index - b.turn_index);
    const prompts = [...messages.entries()].filter(
        ([, message]) => isPrompt(message) && !isRefundedPrompt(message),
    );
    const first = ordered[0];
    const forked = first?.turn_index === 1 && afterRecap(first.user_message) !== null;

    // Which prompts (by position in `prompts`) each turn's record matches.
    const matches = ordered.map((turn) => {
        if (turn === first && forked) {
            const exact = prompts.flatMap(([at, message], k) => {
                const recap = forkRecap(messages.slice(0, at));

                return recap !== null && recordsText(turn.user_message, `${recap}${message.text}`)
                    ? [k]
                    : [];
            });

            if (exact.length > 0) {
                return exact;
            }

            const after = afterRecap(turn.user_message) ?? '';

            return prompts.flatMap(([, message], k) =>
                recordsText(after, message.text) ? [k] : [],
            );
        }

        return prompts.flatMap(([, message], k) =>
            recordsPrompt(turn.user_message, message.text) ? [k] : [],
        );
    });

    // Pairs where the turn matches one prompt and the prompt one turn, kept
    // while they run in order.
    const pairs: [number, number][] = [];

    for (const [t, candidates] of matches.entries()) {
        const k = candidates[0];

        if (
            candidates.length === 1 &&
            k !== undefined &&
            matches.filter((other) => other.includes(k)).length === 1 &&
            (pairs.at(-1)?.[1] ?? -1) < k
        ) {
            pairs.push([t, k]);
        }
    }

    // Between pairs, equal runs that match one for one.
    const filled: [number, number][] = [];
    const bounds: [number, number][] = [[-1, -1], ...pairs, [ordered.length, prompts.length]];

    for (let b = 0; b + 1 < bounds.length; b += 1) {
        const [t0, k0] = bounds[b]!;
        const [t1, k1] = bounds[b + 1]!;
        const width = t1 - t0 - 1;

        if (
            width > 0 &&
            width === k1 - k0 - 1 &&
            Array.from({ length: width }, (_, i) =>
                matches[t0 + 1 + i]!.includes(k0 + 1 + i),
            ).every(Boolean)
        ) {
            for (let i = 0; i < width; i += 1) {
                filled.push([t0 + 1 + i, k0 + 1 + i]);
            }
        }

        if (b + 1 < bounds.length - 1) {
            filled.push(bounds[b + 1]!);
        }
    }

    const turnAt = new Map(
        filled.map(([t, k]) => [prompts[k]![0], ordered[t]!.turn_index] as const),
    );
    const firstOwn = forked
        ? [...turnAt].find(([, turn]) => turn === first.turn_index)?.[0]
        : undefined;

    return messages.map((message, at): ChatMessage => {
        if (firstOwn !== undefined && at < firstOwn) {
            return { ...message, inherited: true };
        }

        if (message.role !== 'user' || !isPrompt(message) || message.refunded) {
            return message;
        }

        const turn = turnAt.get(at);

        return turn === undefined
            ? { ...message, unkeyed: true }
            : { ...message, harnessTurn: turn };
    });
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
 * empty reply, placed by index before the first prompt of a later turn
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

/**
 * The transcript without the prompts sent for harness turn `turnIndex`'s new
 * question that the harness never admitted (no `harnessTurn`) and the meter
 * did not give back, each with every message up to the next prompt: its
 * reply, whatever it says (an error, a stopped note), stays with it, so the
 * turn's own reply stays the turn's (turnReplyAt).
 */
export const withoutUnsentQuestion = (
    messages: ChatMessage[],
    turnIndex: number,
): ChatMessage[] => {
    const unsent = (message: ChatMessage) =>
        message.role === 'user' &&
        message.fromNewQuestion === turnIndex &&
        message.harnessTurn === undefined &&
        !message.refunded &&
        !message.inherited;
    let dropping = false;
    const kept = messages.filter((message) => {
        if (isPrompt(message)) {
            dropping = unsent(message);
        }

        return !dropping;
    });

    return kept.length === messages.length ? messages : kept;
};

/**
 * The transcript with `prompt` offered as a follow-up on harness turn
 * `turnIndex`'s reply, or on the last reply for a turn the stream did not
 * name (null), for the user to send: a new question the page could not
 * send itself. Unchanged when the turn has no reply or already offers it.
 */
export const withFollowup = (
    messages: ChatMessage[],
    turnIndex: number | null,
    prompt: string,
): ChatMessage[] => {
    const at =
        turnIndex === null
            ? messages.findLastIndex((message) => message.role === 'bot')
            : turnReplyAt(messages, turnIndex);
    const reply = messages[at];

    if (reply?.role !== 'bot' || reply.followups?.includes(prompt)) {
        return messages;
    }

    return messages.map((message, other) =>
        other === at ? { ...reply, followups: [...(reply.followups ?? []), prompt] } : message,
    );
};

/** The note a turn shows when the user's change to its plan asked a
 *  different question, which goes on as the next turn. */
export const NEW_QUESTION_NOTE = '_Taken as a new question._';

/**
 * The transcript once the harness took the user's change to the plan as a
 * new question (`done`'s `new_question`). The plan card closes, so the turn's
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
