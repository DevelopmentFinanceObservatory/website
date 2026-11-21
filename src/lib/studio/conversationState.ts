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
import { isPrompt, isRefundedPrompt } from './transcript.ts';
import type { ClosedTurn, ConversationRead, StudioFrame } from './wire.ts';

/**
 * A reopened conversation against the harness's copy of it (GET
 * /api/studio/state). The page's saved snapshot owns the layout, the text
 * cards, the titles and the transcript of the turns it holds; the harness
 * owns each turn's status, the open pause, the turns the snapshot never got,
 * and the canvas manifest. Turns are matched on the harness's turn index:
 * `harnessTurns` is how many turns the harness had opened on the page's
 * conversation when the snapshot was saved.
 */

/**
 * The harness turns a snapshot holds. A save made before the page counted
 * them holds one per prompt the harness accepted (a refused prompt opened
 * none); a conversation with no harness session holds none.
 */
export const heldHarnessTurns = (saved: {
    sessionId: string | null;
    messages: readonly ChatMessage[];
    harnessTurns?: number;
}): number =>
    !saved.sessionId
        ? 0
        : (saved.harnessTurns ??
          saved.messages.filter((message) => isPrompt(message) && !isRefundedPrompt(message))
              .length);

/**
 * The `since` to read the state with: the turn before the last one the page
 * holds, so that last turn comes back too when it closed after the page left
 * with its reply still empty.
 */
export const stateSince = (harnessTurns: number): number => Math.max(0, harnessTurns - 1);

const CLOSED_NOTES: Record<string, string> = {
    cancelled: STOPPED_NOTE,
};

/** The text a closed turn shows: its reply, else a note on how it ended. */
export const closedReply = (turn: ClosedTurn): string =>
    turn.reply ||
    (turn.error ? (CLOSED_NOTES[turn.error] ?? '_This turn ended without an answer._') : '');

export type ClosedMerge = {
    messages: ChatMessage[];
    harnessTurns: number;
    // The turns appended, oldest first.
    appended: ClosedTurn[];
};

/**
 * The transcript with the harness's closed turns merged in. A turn the page
 * holds keeps the page's text, except that the last held turn's empty reply
 * takes the harness's. A turn after the last held one is appended as its
 * user message and reply. Merging the same turns again changes nothing.
 */
export const mergeClosedTurns = (
    messages: ChatMessage[],
    harnessTurns: number,
    closed: readonly ClosedTurn[],
): ClosedMerge => {
    let merged = messages;
    let held = harnessTurns;
    const appended: ClosedTurn[] = [];

    for (const turn of [...closed].sort((a, b) => a.turn_index - b.turn_index)) {
        if (turn.turn_index > held) {
            merged = [
                ...merged,
                { role: 'user', text: turn.user_message },
                { role: 'bot', text: closedReply(turn) },
            ];
            held = turn.turn_index;
            appended.push(turn);
        } else if (turn.turn_index === held) {
            const last = merged.at(-1);

            if (last?.role === 'bot' && !last.text) {
                merged = [...merged.slice(0, -1), { ...last, text: closedReply(turn) }];
            }
        }
    }

    return { messages: merged, harnessTurns: held, appended };
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
    read = readState,
    sleep = abortableSleep,
}: {
    conversationId: string;
    first: AttachStep;
    handlers: StreamHandlers;
    signal: AbortSignal;
    since: () => number;
    onRead: (read: ConversationRead) => void;
    resume?: typeof runResume;
    read?: typeof readState;
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
