import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';

import { STOPPED_NOTE } from './chatLine.ts';
import {
    abortableSleep,
    busyRetryAfter,
    readState,
    runResume,
    type StreamHandlers,
    type StreamRefusal,
} from './studioClient.ts';
import { ensureTurn, heldTurns, NEW_QUESTION_NOTE, turnReplyAt } from './transcript.ts';
import type { ClosedTurn, ConversationRead, StudioFrame } from './wire.ts';

/**
 * A reopened conversation against the harness's copy of it (GET
 * /api/studio/state). The page's saved snapshot owns the layout, the text
 * cards, the titles and the transcript of the turns it holds; the harness
 * owns each turn's status, the open pause, the turns the snapshot never got,
 * and the canvas manifest. Turns are matched on the harness's turn index,
 * which each prompt carries (`harnessTurn`, see transcript.ts promptTurns).
 */

/**
 * The `since` to read the state with: the turn before the last one the page
 * holds, so that last turn comes back too when it closed after the page left
 * with its reply still empty.
 */
export const stateSince = (held: number): number => Math.max(0, held - 1);

/**
 * The state read after `since` with every closed turn up to `closed_total`:
 * each read returns at most 3, so it reads again from the last one it got
 * until it holds them all. The turn, pause and manifest are the last read's.
 * Null when a read fails.
 */
export const readConversation = async (
    conversationId: string,
    since: number,
    signal?: AbortSignal,
    read: typeof readState = readState,
): Promise<ConversationRead | null> => {
    let answer = await read(conversationId, since, signal);

    if (!answer) {
        return null;
    }

    const closed = [...answer.closed_since];

    for (;;) {
        const last = closed.at(-1)?.turn_index ?? since;

        if (answer.closed_total === undefined || last >= answer.closed_total) {
            break;
        }

        const next = await read(conversationId, last, signal);

        if (!next) {
            return null;
        }

        const fresh = next.closed_since.filter((turn) => turn.turn_index > last);

        answer = next;

        // A read that returns nothing new ends the paging, so a read that
        // disagrees with its own total cannot loop.
        if (fresh.length === 0) {
            break;
        }

        closed.push(...fresh);
    }

    return { ...answer, closed_since: closed };
};

const CLOSED_NOTES: Record<string, string> = {
    cancelled: STOPPED_NOTE,
};

/** The text a closed turn shows: its reply, else a note on how it ended. */
export const closedReply = (turn: ClosedTurn): string => {
    if (turn.reply) {
        return turn.reply;
    }

    if (turn.error) {
        return CLOSED_NOTES[turn.error] ?? '_This turn ended without an answer._';
    }

    return turn.new_question ? NEW_QUESTION_NOTE : '';
};

export type ClosedMerge = {
    messages: ChatMessage[];
    // The turns appended, oldest first.
    appended: ClosedTurn[];
};

/**
 * The transcript with the harness's closed turns merged in, each keyed on
 * its turn index (ensureTurn). A turn the page holds keeps the page's text,
 * except that an empty reply takes the harness's. A turn the page lacks is
 * appended as its user message and reply. Merging the same turns again
 * changes nothing.
 */
export const mergeClosedTurns = (
    messages: ChatMessage[],
    closed: readonly ClosedTurn[],
): ClosedMerge => {
    let merged = messages;
    const appended: ClosedTurn[] = [];

    for (const turn of [...closed].sort((a, b) => a.turn_index - b.turn_index)) {
        const before = merged;

        merged = ensureTurn(merged, turn.turn_index, turn.user_message);

        if (merged !== before) {
            appended.push(turn);
        }

        const at = turnReplyAt(merged, turn.turn_index);
        const reply = merged[at];

        if (reply?.role === 'bot' && !reply.text) {
            const text = closedReply(turn);

            if (text) {
                merged = merged.map((message, other) =>
                    other === at ? { ...reply, text } : message,
                );
            }
        }
    }

    return { messages: merged, appended };
};

/**
 * The question the harness's latest turn was ended by (a change to its plan
 * that asked something else), while the page still owes it as the next
 * turn: no prompt was sent from it (`fromNewQuestion`) and the page holds no
 * turn after it. The turn's index and the text, or null, also for a read
 * whose latest turn `closed_since` does not hold.
 */
export const owedNewQuestion = (
    read: ConversationRead,
    messages: readonly ChatMessage[],
): { turnIndex: number; text: string } | null => {
    const latest = read.turn;
    const closed = latest && read.closed_since.find((turn) => turn.turn_index === latest.index);

    if (!closed?.new_question || heldTurns(messages) > closed.turn_index) {
        return null;
    }

    const sent = messages.some(
        (message) => message.role === 'user' && message.fromNewQuestion === closed.turn_index,
    );

    return sent ? null : { turnIndex: closed.turn_index, text: closed.new_question };
};

/**
 * What the page does about the harness's latest turn: show its pause through
 * the stream's own handlers (`pause`), carry on a running turn nobody holds
 * (`resume`), read again after `seconds` while another stream holds it
 * (`wait`), or nothing for a closed turn or one never opened (`none`). A
 * pause stored without its frames cannot be shown, so it is `none`.
 */
export type AttachStep =
    | { kind: 'none' }
    | { kind: 'pause'; turnIndex: number; frames: StudioFrame[] }
    | { kind: 'resume'; turnIndex: number }
    | { kind: 'wait'; turnIndex: number; seconds: number };

// How long to wait before reading again when a live lease states no time.
const DEFAULT_WAIT_SECONDS = 2;

export const attachStep = (read: ConversationRead): AttachStep => {
    const turn = read.turn;

    if (!turn) {
        return { kind: 'none' };
    }

    if (turn.status === 'paused') {
        return read.pause && read.pause.frames.length > 0
            ? { kind: 'pause', turnIndex: turn.index, frames: read.pause.frames }
            : { kind: 'none' };
    }

    if (turn.status === 'running') {
        return turn.lease_live
            ? {
                  kind: 'wait',
                  turnIndex: turn.index,
                  seconds: Math.max(1, turn.retry_after_seconds ?? DEFAULT_WAIT_SECONDS),
              }
            : { kind: 'resume', turnIndex: turn.index };
    }

    return { kind: 'none' };
};

// The ending of a turn carried on from the state once the harness has closed
// it. The reply comes from the state read (mergeClosedTurns).
const CLOSED_FRAME: StudioFrame = { event: 'done', seq: -1, trace_id: '', composition: null };

/**
 * Carry on the harness's open turn from `first` as one stream into
 * `handlers`: resume a running turn nobody holds (`resume`), wait while
 * another stream holds it, show a pause by its frames, and end with a `done`
 * once the harness has closed it. A resume refused 409 (the turn was taken or
 * paused meanwhile) reads the state again, after the wait the refusal names.
 * Each read goes to `onRead`, which merges it, and is asked with `since()`.
 * Rejects when a resume is refused otherwise or a read fails, and with an
 * AbortError when `signal` aborts.
 */
export const carryOnTurn = async ({
    conversationId,
    first,
    handlers,
    signal,
    since,
    onRead,
    resume = runResume,
    read = readConversation,
    sleep = abortableSleep,
}: {
    conversationId: string;
    first: AttachStep;
    handlers: StreamHandlers;
    signal: AbortSignal;
    since: () => number;
    onRead: (read: ConversationRead) => void;
    resume?: typeof runResume;
    read?: (
        conversationId: string,
        since: number,
        signal?: AbortSignal,
    ) => Promise<ConversationRead | null>;
    sleep?: typeof abortableSleep;
}): Promise<void> => {
    for (let step = first; ;) {
        if (step.kind === 'pause') {
            step.frames.forEach(handlers.onFrame);

            return;
        }

        if (step.kind === 'none') {
            handlers.onFrame(CLOSED_FRAME);

            return;
        }

        if (step.kind === 'resume') {
            // Set by the refusal handler during the request.
            let refused = null as StreamRefusal | null;

            await resume(
                conversationId,
                step.turnIndex,
                {
                    ...handlers,
                    onRefusal: (refusal) => {
                        refused = refusal;

                        return true;
                    },
                },
                signal,
            );

            if (refused === null) {
                return;
            }

            if (refused.status !== 409) {
                throw new Error(`the turn could not be resumed: HTTP ${refused.status}`);
            }

            await sleep((busyRetryAfter(refused) ?? 0) * 1000, signal);
        } else {
            await sleep(step.seconds * 1000, signal);
        }

        const answer = await read(conversationId, since(), signal);

        if (!answer) {
            throw new Error('the conversation state could not be read');
        }

        handlers.onKeepAlive?.();
        onRead(answer);
        step = attachStep(answer);
    }
};
