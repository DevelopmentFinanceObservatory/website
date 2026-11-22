import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { Widget } from '@/lib/chat/widgets';

import { asRecord } from '../asRecord.ts';
import { STOPPED_NOTE } from './chatLine.ts';
import {
    abortableSleep,
    busyRetryAfter,
    isTurnMoved,
    readState,
    runResume,
    type ComponentRead,
    type StreamHandlers,
    type StreamRefusal,
} from './studioClient.ts';
import { factsOf } from './liveCards.ts';
import { approvedFromFrame, type ApprovedPlan } from './plan.ts';
import { describedBy, payloadDescription } from './payload.ts';
import { ensureTurn, NEW_QUESTION_NOTE, turnReplyAt } from './transcript.ts';
import { reviseWidget, widgetFromComponent } from './widgets.ts';
import type {
    ClosedTurn,
    CompositionBlock,
    CompositionManifest,
    ConversationRead,
    PlanApproved,
    Provenance,
    StudioFrame,
} from './wire.ts';

/**
 * A reopened conversation against the harness's copy of it (GET
 * /api/studio/state). The page's saved snapshot owns the layout, the text
 * cards, the titles and the transcript of the turns it holds; the harness
 * owns each turn's status, the open pause, the turns the snapshot never got,
 * and the canvas manifest. Turns are matched on the harness's turn index,
 * which each prompt carries (`harnessTurn`, see transcript.ts promptTurns).
 */

/**
 * The state read after `since` with every closed turn up to `closed_total`.
 * Each read returns at most 3, so it reads again from the last one it got
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
 * turn. That holds while the latest turn the harness holds is the one that
 * asked it, and the page holds no prompt the harness admitted as a later
 * turn (`harnessTurn`). A prompt sent for it counts only once admitted: a
 * refused send, which the meter gave back, and a send that never reached the
 * harness leave it owed. A fork's inherited prompts answer another session's
 * turns. Returns the turn's index and the text, or null, and null also for
 * a read whose latest turn `closed_since` does not hold.
 */
export const owedNewQuestion = (
    read: ConversationRead,
    messages: readonly ChatMessage[],
): { turnIndex: number; text: string } | null => {
    const latest = read.turn;
    const closed = latest && read.closed_since.find((turn) => turn.turn_index === latest.index);

    if (!closed?.new_question) {
        return null;
    }

    const later = messages.some(
        (message) =>
            message.role === 'user' &&
            !message.inherited &&
            !message.refunded &&
            message.harnessTurn !== undefined &&
            message.harnessTurn > closed.turn_index,
    );

    return later ? null : { turnIndex: closed.turn_index, text: closed.new_question };
};

// How long to wait before reading again when a live lease states no time.
const DEFAULT_WAIT_SECONDS = 2;

/**
 * Send harness turn `turnIndex`'s new question with `send`, which names that
 * turn as the one the request follows (`after_turn`). A request the harness
 * answers busy waits the time it names and is sent again. One it refuses
 * `turn_moved` (isTurnMoved) found a later turn begun, by another page that
 * sent the question or by this page's own earlier send, so it is not sent
 * again and `onMoved` hears it. Two pages that owe the same question
 * therefore begin one turn.
 */
export const sendNewQuestion = async ({
    turnIndex,
    send,
    handlers,
    signal,
    onWait,
    onMoved,
    sleep = abortableSleep,
}: {
    turnIndex: number;
    send: (afterTurn: number, handlers: StreamHandlers) => Promise<void>;
    handlers: StreamHandlers;
    signal: AbortSignal;
    onWait?: (seconds: number) => void;
    onMoved: () => void;
    sleep?: typeof abortableSleep;
}): Promise<void> => {
    for (;;) {
        // Set by the refusal handler during `send`.
        let wait = null as number | null;
        let moved = false;

        await send(turnIndex, {
            ...handlers,
            onRefusal: (refusal) => {
                if (isTurnMoved(refusal)) {
                    moved = true;

                    return true;
                }

                wait = busyRetryAfter(refusal);

                return wait !== null || (handlers.onRefusal?.(refusal) ?? false);
            },
        });

        if (moved) {
            onMoved();

            return;
        }

        if (wait === null) {
            return;
        }

        onWait?.(wait);
        await sleep(wait * 1000, signal);
    }
};

/** The revisions of the approved plans the transcript holds, which a
 *  repeated `plan.approved` is told apart by. */
export const approvalRevisions = (messages: readonly ChatMessage[]): Set<string> =>
    new Set(
        messages.flatMap((message) =>
            message.role === 'bot' && message.plan?.revision ? [message.plan.revision] : [],
        ),
    );

/**
 * The plan a `plan.approved` frame brings, or null for one whose revision
 * the page already took (`held`, which then holds it): a resume, and an
 * `/interrupt` retry whose approval the run already took, open with the
 * frames of the plans the turn approved. A frame without a revision is
 * always taken.
 */
export const takeApproval = (frame: PlanApproved, held: Set<string>): ApprovedPlan | null => {
    const revision = frame.revision;

    if (revision) {
        if (held.has(revision)) {
            return null;
        }

        held.add(revision);
    }

    return approvedFromFrame(frame);
};

/**
 * The transcript with harness turn `turnIndex`'s approvals from a state read
 * (`turn.approved`, `closed_since[].approved`): the latest one the page does
 * not hold (`held`) rides on the turn's reply, as the stream's frame would
 * have put it. Every revision then counts as held. Unchanged when the page
 * holds them all, or holds no reply of that turn.
 */
export const withTurnApprovals = (
    messages: ChatMessage[],
    turnIndex: number,
    approved: readonly PlanApproved[] | null | undefined,
    held: Set<string>,
): ChatMessage[] => {
    const at = turnReplyAt(messages, turnIndex);
    const reply = messages[at];

    if (reply?.role !== 'bot' || !approved?.length) {
        return messages;
    }

    const latest = approved.at(-1)!;
    const fresh = !latest.revision || !held.has(latest.revision);

    for (const frame of approved) {
        if (frame.revision) {
            held.add(frame.revision);
        }
    }

    return fresh
        ? messages.map((message, other) =>
              other === at ? { ...reply, plan: approvedFromFrame(latest) } : message,
          )
        : messages;
};

/**
 * The cards a canvas manifest names that the page must read to draw: one it
 * never saw (`seen` lacks it), such as a card another tab's turn made, and
 * one it holds at an older revision than the manifest's (`held`).
 */
export const cardsToRead = (
    manifest: CompositionManifest,
    held: ReadonlyMap<string, number>,
    seen: ReadonlySet<string>,
): CompositionBlock[] =>
    manifest.blocks.filter((block) => {
        if (!seen.has(block.component_id)) {
            return true;
        }

        const revision = held.get(block.component_id);

        return revision !== undefined && block.revision > revision;
    });

// A component read's provenance in the shape a created frame carries, from
// the resolved payload's envelope. The card's info panel prefers the
// envelope's own provenance where its sources name their graph refs.
const provenanceOfRead = (read: ComponentRead): Provenance => {
    const provenance = asRecord(read.payload['provenance']);
    const list = (key: string) => {
        const value = provenance?.[key];

        return Array.isArray(value) ? value : [];
    };
    const freshness = asRecord(provenance?.['freshness']);
    const text = (value: unknown) => (typeof value === 'string' ? value : '');

    return {
        inputs: list('inputs'),
        sources: list('sources'),
        freshness: {
            data_through: text(freshness?.['data_through']),
            last_refreshed: text(freshness?.['last_refreshed']),
            partial_period: freshness?.['partial_period'] === true,
        },
        warnings: list('warnings'),
        generated_at: text(provenance?.['generated_at']),
        citation: text(provenance?.['citation']),
    };
};

/**
 * A manifest card drawn from its component read: a card the page never saw
 * as the widget its `component.created` frame would have drawn, and a card
 * the page holds (`held`) redrawn at the read's revision as a
 * `component.revised` frame with its payload would. dfo-apis' fact summary
 * becomes the stream's (factsOf). Null for a card of a type the canvas does
 * not draw, or a read outside the platform's shape.
 */
export const widgetFromRead = (
    block: CompositionBlock,
    read: ComponentRead,
    held?: Widget,
): Widget | null => {
    try {
        const description = payloadDescription(read.payload);
        const facts = factsOf(read, describedBy(description));

        return held
            ? reviseWidget(
                  held,
                  {
                      event: 'component.revised',
                      seq: -1,
                      component_id: block.component_id,
                      revision: read.revision,
                      changed: [],
                      fact_summary: facts,
                      payload: read.payload,
                  },
                  description,
              )
            : widgetFromComponent({
                  event: 'component.created',
                  seq: -1,
                  component_id: block.component_id,
                  revision: read.revision,
                  type: block.type,
                  catalog_version: read.catalog_version,
                  min_catalog_version: read.catalog_version,
                  payload: read.payload,
                  fact_summary: facts,
                  provenance: provenanceOfRead(read),
              });
    } catch {
        return null;
    }
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
