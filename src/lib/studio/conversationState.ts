import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { Widget } from '@/lib/chat/widgets';

import { asRecord } from '../asRecord.ts';
import { STOPPED_NOTE } from './chatLine.ts';
import {
    abortableSleep,
    busyRetryAfter,
    isStateRefusal,
    isTurnMoved,
    readComponent,
    readState,
    runResume,
    type ComponentRead,
    type StateRefusal,
    type StreamHandlers,
    type StreamRefusal,
} from './studioClient.ts';
import { factsOf } from './liveCards.ts';
import { approvedFromFrame, type ApprovedPlan } from './plan.ts';
import { describedBy, payloadDescription } from './payload.ts';
import {
    afterRecap,
    ensureTurn,
    isPrompt,
    isRefundedPrompt,
    NEW_QUESTION_NOTE,
    promptTurns,
    turnReplyAt,
    withNewQuestion,
    withOfferedQuestion,
    withoutUnsentQuestion,
} from './transcript.ts';
import { reviseWidget, widgetFromComponent } from './widgets.ts';
import { readHeld } from './wire.ts';
import { placeCard } from './cardReplace.ts';
import { cardChangesOf } from './studioClient.ts';
import type {
    ClosedTurn,
    CompositionBlock,
    CompositionManifest,
    ConversationRead,
    PlanApproved,
    Provenance,
    StoredCard,
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
 * A read's StateRefusal is the answer, and any other failed read is null.
 */
export const readConversation = async (
    conversationId: string,
    since: number,
    signal?: AbortSignal,
    read: typeof readState = readState,
): Promise<ConversationRead | StateRefusal | null> => {
    let answer = await read(conversationId, since, signal);

    if (!answer || isStateRefusal(answer)) {
        return answer;
    }

    const closed = [...answer.closed_since];

    for (;;) {
        const last = closed.at(-1)?.turn_index ?? since;

        if (answer.closed_total === undefined || last >= answer.closed_total) {
            break;
        }

        const next = await read(conversationId, last, signal);

        if (!next || isStateRefusal(next)) {
            return next;
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

/** Whether `read` finds the latest turn open, paused or running. */
export const isOpenTurn = (read: ConversationRead): boolean =>
    read.turn?.status === 'paused' || read.turn?.status === 'running';

/**
 * The cards the harness session's turns drew, from a state read of every
 * closed turn since turn 0: each closed turn's `component_ids`, and while
 * the latest turn is paused or running, `openCards`, the cards the page
 * holds from that turn, since a read lists no open turn's cards.
 */
export const producedCards = (read: ConversationRead, openCards: Iterable<string>): Set<string> => {
    return new Set([
        ...read.closed_since.flatMap((turn) => turn.component_ids),
        ...(isOpenTurn(read) ? openCards : []),
    ]);
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

/** The prompt a page shows for a turn the harness recorded as `recorded`:
 *  the message after the recap a session's first turn opens with after a
 *  fork or a left session (forkRecap), else the recorded text. */
export const recordedPromptText = (recorded: string): string => afterRecap(recorded) ?? recorded;

export type ClosedMerge = {
    messages: ChatMessage[];
    // The turns appended, oldest first.
    appended: ClosedTurn[];
};

/**
 * The transcript with the harness's closed turns merged in, each keyed on
 * its turn index (ensureTurn). A turn the page lacks is added as its user
 * message, less any recap (recordedPromptText), and reply, its prompt stamped with the next free page turn from
 * `nextTurn` on, in turn order. A turn the page holds takes the harness's
 * reply when it closed cleanly with one, since that is the text its
 * `message.complete` sent, which a page saved mid-stream holds only part of.
 * A turn that closed with an error keeps the page's text unless its reply is
 * empty, so a stopped turn keeps its note. Merging the same turns again
 * changes nothing.
 */
export const mergeClosedTurns = (
    messages: ChatMessage[],
    closed: readonly ClosedTurn[],
    nextTurn: number,
): ClosedMerge => {
    let merged = messages;
    const appended: ClosedTurn[] = [];

    for (const turn of [...closed].sort((a, b) => a.turn_index - b.turn_index)) {
        const before = merged;

        merged = ensureTurn(
            merged,
            turn.turn_index,
            recordedPromptText(turn.user_message),
            nextTurn + appended.length,
            turn.card_change,
        );

        if (merged !== before) {
            appended.push(turn);
        }

        const at = turnReplyAt(merged, turn.turn_index);
        const reply = merged[at];

        if (reply?.role === 'bot') {
            const text = !turn.error && turn.reply ? turn.reply : reply.text || closedReply(turn);

            if (text !== reply.text) {
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
 * asked it, the page holds no prompt the harness admitted as a later turn
 * (`harnessTurn`), and the turn's reply does not already offer it as a
 * follow-up (withFollowup). `tried` says the page sent it once and the
 * harness never admitted it: a refused send, which the meter gave back, a
 * send that never reached the harness, or one stopped while it waited. Such
 * a question is offered for the user to send and is not sent again on its own.
 * A fork's inherited prompts answer another session's turns. Returns the
 * turn's index and the text, or null, and null also for a read whose latest
 * turn `closed_since` does not hold.
 */
export const owedNewQuestion = (
    read: ConversationRead,
    messages: readonly ChatMessage[],
): { turnIndex: number; text: string; tried: boolean } | null => {
    const latest = read.turn;
    const closed = latest && read.closed_since.find((turn) => turn.turn_index === latest.index);

    if (!closed?.new_question) {
        return null;
    }

    const own = messages.filter(
        (message): message is Extract<ChatMessage, { role: 'user' }> =>
            message.role === 'user' && !message.inherited,
    );
    const later = own.some(
        (message) =>
            !message.refunded &&
            message.harnessTurn !== undefined &&
            message.harnessTurn > closed.turn_index,
    );
    const reply = messages[turnReplyAt(messages, closed.turn_index)];
    const asked = closed.new_question.trim();
    const offered =
        reply?.role === 'bot' &&
        [reply.newQuestion, ...(reply.followups ?? [])].some((text) => text?.trim() === asked);

    if (later || offered) {
        return null;
    }

    return {
        turnIndex: closed.turn_index,
        text: closed.new_question,
        tried: own.some(
            (message) =>
                message.fromNewQuestion === closed.turn_index &&
                (message.refunded || message.harnessTurn === undefined),
        ),
    };
};

// How long to wait before reading again when a live lease or a refused
// resume states no time, and the least a refused resume waits.
const DEFAULT_WAIT_SECONDS = 2;

// The refused resumes carryOnTurn takes before it gives up on the turn.
export const RESUME_ATTEMPTS = 5;

// The seconds to wait after a refused resume before reading the state again.
// A 409 (another stream took the turn, or it paused or closed meanwhile) or a
// 503 `transient_unavailable` waits the time it names and at least
// DEFAULT_WAIT_SECONDS. Null for any other refusal, which is final.
const resumeRetryAfter = (refusal: StreamRefusal): number | null => {
    const transient =
        refusal.status === 409 ||
        (refusal.status === 503 && refusal.error?.error === 'transient_unavailable');

    return transient
        ? Math.max(DEFAULT_WAIT_SECONDS, refusal.error?.retry_after_seconds ?? 0)
        : null;
};

/**
 * Send harness turn `turnIndex`'s new question with `send`, which names that
 * turn as the one the request follows (`after_turn`). A request the harness
 * answers busy waits the time it names, which `handlers.onBusyWait` hears
 * (whileBusy), and is sent again. One it refuses `turn_moved` (isTurnMoved)
 * found a later turn begun, by another page that sent the question or by
 * this page's own earlier send, so it is not sent again and `onMoved` hears
 * it. Two pages that owe the same question therefore begin one turn.
 */
export const sendNewQuestion = async ({
    turnIndex,
    send,
    handlers,
    signal,
    onMoved,
    sleep = abortableSleep,
}: {
    turnIndex: number;
    send: (afterTurn: number, handlers: StreamHandlers) => Promise<void>;
    handlers: StreamHandlers;
    signal: AbortSignal;
    onMoved: () => void;
    sleep?: typeof abortableSleep;
}): Promise<void> => {
    for (;;) {
        // Set by the refusal handler during `send`.
        let wait: number | null = null;
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

        handlers.onBusyWait?.(wait);
        await sleep(wait * 1000, signal);
        handlers.onBusyWait?.(null);
    }
};

/** A transcript after a refused send left it, and how many refunded
 *  prompts left with the send (withMovedQuestion). */
export type MovedQuestion = { messages: ChatMessage[]; refunds: number };

/**
 * The transcript once harness turn `turnIndex`'s new question `text` was
 * refused `turn_moved` (sendNewQuestion). A page that reads the harness's
 * state (`readsState`) takes the send off the transcript
 * (withoutUnsentQuestion) and reads in the turn that went ahead. A page
 * that cannot, a guest's, whose state read the proxy refuses, offers the
 * question on the turn's reply for the user to send (withOfferedQuestion),
 * so it stays on screen.
 * The site's meter gave the refused send's prompt, the latest, back. A
 * guest's meter counts refunded prompts in the transcript and cannot see
 * one that left it, so `refunds` counts the prompts that left refunded, that
 * one included. A prompt that stays is marked refunded.
 */
export const withMovedQuestion = (
    messages: ChatMessage[],
    turnIndex: number,
    text: string,
    readsState: boolean,
): MovedQuestion => {
    const kept = readsState
        ? withoutUnsentQuestion(messages, turnIndex)
        : withOfferedQuestion(messages, turnIndex, text);
    const latest = messages.findLast(isPrompt);
    const left = (message: ChatMessage) => !kept.includes(message);
    const refunds = messages.filter(
        (message) => (message === latest || isRefundedPrompt(message)) && left(message),
    ).length;

    if (latest?.role !== 'user' || latest.refunded || left(latest)) {
        return { messages: kept, refunds };
    }

    return {
        messages: kept.map((message) =>
            message === latest ? { ...latest, refunded: true } : message,
        ),
        refunds,
    };
};

/** The transcript with harness turn `turnIndex`'s new question `text`
 *  offered for the user to send (withOfferedQuestion), and how many
 *  refunded prompts left with the sends it drops, for a guest's meter,
 *  which counts refunds on the transcript. */
export const withQuestionOffered = (
    messages: ChatMessage[],
    turnIndex: number,
    text: string,
): MovedQuestion => {
    const kept = withOfferedQuestion(messages, turnIndex, text);
    const refunds = messages.filter(
        (message) => isRefundedPrompt(message) && !kept.includes(message),
    ).length;

    return { messages: kept, refunds };
};

/**
 * The transcript once a state read owes harness turn `turnIndex`'s new
 * question `text` (owedNewQuestion) and the page asks it as the next turn:
 * any unsent send of it leaves (withoutUnsentQuestion), and a turn the page
 * held (`held`) closes its plan card on its own reply (withNewQuestion at
 * turnReplyAt), so a later unsent prompt's reply is left as it is.
 */
export const withOwedQuestion = (
    messages: ChatMessage[],
    turnIndex: number,
    text: string,
    held: boolean,
): ChatMessage[] => {
    const kept = withoutUnsentQuestion(messages, turnIndex);

    return held ? withNewQuestion(kept, text, turnReplyAt(kept, turnIndex)) : kept;
};

// An approval's key: its turn and its plan's revision. Two turns can approve
// plans of the same content, and so the same revision.
const approvalKey = (turnIndex: number | null, revision: string): string =>
    `${turnIndex ?? '?'}:${revision}`;

/** The keys of harness turn `turnIndex`'s approvals. */
export const turnApprovalKeys = (
    turnIndex: number,
    approved: readonly PlanApproved[] | null | undefined,
): string[] =>
    (approved ?? []).flatMap((frame) =>
        frame.revision ? [approvalKey(turnIndex, frame.revision)] : [],
    );

/** The keys of the approved plans the transcript holds, each the turn whose
 *  reply carries it and the plan's revision, which a repeated
 *  `plan.approved` is told apart by. */
export const approvalKeys = (messages: readonly ChatMessage[]): Set<string> => {
    const turns = promptTurns(messages);
    const keys = new Set<string>();
    let turn: number | null = null;

    for (const [at, message] of messages.entries()) {
        if (isPrompt(message)) {
            turn = turns.get(at) ?? null;
        } else if (message.role === 'bot' && message.plan?.revision) {
            keys.add(approvalKey(turn, message.plan.revision));
        }
    }

    return keys;
};

/**
 * The plan a `plan.approved` frame of harness turn `turnIndex` brings, or
 * null for one that turn's reply already took (`held`, which then holds it):
 * a resume and an `/interrupt` retry whose approval the run already took
 * both open with the frames of the plans the turn approved. A frame without a
 * revision is always taken.
 */
export const takeApproval = (
    frame: PlanApproved,
    turnIndex: number | null,
    held: Set<string>,
): ApprovedPlan | null => {
    if (frame.revision) {
        const key = approvalKey(turnIndex, frame.revision);

        if (held.has(key)) {
            return null;
        }

        held.add(key);
    }

    return approvedFromFrame(frame);
};

/**
 * The transcript with harness turn `turnIndex`'s approvals from a state read
 * (`turn.approved`, `closed_since[].approved`): the latest one the turn's
 * reply does not hold (`held`) rides on that reply, as the stream's frame
 * would have put it. Every one of the turn's approvals then counts as held.
 * Unchanged when the page holds them all, or holds no reply of that turn.
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
    const fresh = !latest.revision || !held.has(approvalKey(turnIndex, latest.revision));

    for (const frame of approved) {
        if (frame.revision) {
            held.add(approvalKey(turnIndex, frame.revision));
        }
    }

    return fresh
        ? messages.map((message, other) =>
              other === at ? { ...reply, plan: approvedFromFrame(latest) } : message,
          )
        : messages;
};

/**
 * The page turn each card a read's closed turns made is filed under, by
 * component id: the stamp (`turn`) of the prompt that holds the harness
 * turn, whether the page held that turn or the read appended it. A card of
 * a turn the transcript does not hold, or whose prompt has no stamp, is
 * left out.
 */
export const cardTurns = (
    messages: readonly ChatMessage[],
    closed: readonly ClosedTurn[],
): Map<string, number> => {
    const turns = [...promptTurns(messages)];
    const filed = new Map<string, number>();

    for (const turn of closed) {
        const at = turns.findLast(([, index]) => index === turn.turn_index)?.[0];
        const prompt = at === undefined ? undefined : messages[at];

        if (prompt?.role !== 'user' || prompt.turn === undefined) {
            continue;
        }

        for (const id of turn.component_ids) {
            filed.set(id, prompt.turn);
        }
    }

    return filed;
};

/** The stored cards of a read's closed turns (`cards`), by component id,
 *  the latest turn's where two turns changed one card. */
export const storedCards = (closed: readonly ClosedTurn[]): Map<string, StoredCard> =>
    new Map(
        [...closed]
            .sort((a, b) => a.turn_index - b.turn_index)
            .flatMap((turn) => turn.cards ?? [])
            .map((card) => [card.component_id, card] as const),
    );

/**
 * The card whose slot card `id` takes, as its frame's `replaces` would have
 * named it: its stored card's `replaces`, followed through `stored` while
 * the card named is one the page does not hold (`held`), as when another
 * tab changed a card's unit twice. Null when the chain reaches no held card.
 */
export const replacedCard = (
    id: string,
    stored: ReadonlyMap<string, StoredCard>,
    held: (id: string) => boolean,
): string | null => {
    const seen = new Set([id]);

    for (let from = stored.get(id)?.replaces; from && !seen.has(from);) {
        if (held(from)) {
            return from;
        }

        seen.add(from);
        from = stored.get(from)?.replaces;
    }

    return null;
};

/**
 * `widgets` with the cards `ids`, which the page drew from a read before
 * their turn closed and so without their stored cards, brought to what
 * their frames would have drawn once a read carries those cards (`stored`):
 * a card with no unit offer, or no offer of years and places, takes its
 * stored card's, and a card that replaced a card the page holds off the
 * canvas (`onCanvas` lacks it, replacedCard) takes that card's slot.
 * `replaced` lists each swap, old card first, so the canvas moves the old
 * card's settings. The same array when nothing changed.
 */
export const reconcileStoredCards = <TWidget extends Widget & { turn: number }>(
    widgets: TWidget[],
    stored: ReadonlyMap<string, StoredCard>,
    ids: Iterable<string>,
    onCanvas: ReadonlySet<string>,
): { widgets: TWidget[]; replaced: [string, string][] } => {
    let next = widgets;
    const replaced: [string, string][] = [];

    for (const id of ids) {
        const card = stored.get(id);
        const held = next.find((widget) => widget.id === id);

        if (!card || !held) {
            continue;
        }

        let drawn = held;

        if (card.unit_change && drawn.kind !== 'text' && !drawn.unitChange) {
            drawn = { ...drawn, unitChange: card.unit_change };
            next = next.map((widget) => (widget.id === id ? drawn : widget));
        }

        const cardChanges = cardChangesOf(card.card_changes);

        if (cardChanges && drawn.kind !== 'text' && !drawn.cardChanges) {
            drawn = { ...drawn, cardChanges };
            next = next.map((widget) => (widget.id === id ? drawn : widget));
        }

        const from = replacedCard(
            id,
            stored,
            (other) => !onCanvas.has(other) && next.some((widget) => widget.id === other),
        );

        if (from) {
            next = placeCard(next, drawn, { replaces: from });
            replaced.push([from, id]);
        }
    }

    return { widgets: next, replaced };
};

/**
 * Draw the cards a state read's manifest names that the page lacks
 * (cardsToRead): each is read (`read`), dropped when a newer revision
 * arrived meanwhile (`held`) or the page moved on (`isCurrent`), and handed
 * to `onDrawn`. Each card drawn, one the page never saw or one a missed turn
 * revised, is also kept on a legacy canvas (`keep`), as a streamed card is,
 * so a save made before the legacy canvas is taken holds it as shown.
 * `inFlight` holds the reads under way, by id and revision, so overlapping
 * reads ask for each card once.
 */
export const drawManifestCards = async ({
    manifest,
    held,
    seen,
    inFlight,
    isCurrent,
    keep,
    onDrawn,
    read = readComponent,
}: {
    manifest: CompositionManifest;
    held: Map<string, number>;
    seen: ReadonlySet<string>;
    inFlight: Set<string>;
    isCurrent: () => boolean;
    keep: (id: string) => void;
    onDrawn: (block: CompositionBlock, read: ComponentRead) => void;
    read?: (componentId: string, revision: number) => Promise<ComponentRead | null>;
}): Promise<void> => {
    await Promise.all(
        cardsToRead(manifest, held, seen).map(async (block) => {
            const id = block.component_id;
            const key = `${id}@${block.revision}`;

            if (inFlight.has(key)) {
                return;
            }

            inFlight.add(key);

            const answer = await read(id, block.revision);

            inFlight.delete(key);

            const current = held.get(id);

            if (!answer || !isCurrent() || (current !== undefined && current > answer.revision)) {
                return;
            }

            held.set(id, answer.revision);
            keep(id);
            onDrawn(block, answer);
        }),
    );
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
            held: readHeld(freshness?.['held']),
        },
        warnings: list('warnings'),
        generated_at: text(provenance?.['generated_at']),
        citation: text(provenance?.['citation']),
    };
};

/**
 * A manifest card drawn from its component read: a card the page never saw
 * as the widget its `component.created` frame would have drawn, with the
 * unit offer its stored card (`stored`, a state read's) keeps, and a card
 * the page holds (`held`) redrawn at the read's revision as a
 * `component.revised` frame with its payload would. dfo-apis' fact summary
 * becomes the stream's (factsOf). Null for a card of a type the canvas does
 * not draw, or a read outside the platform's shape.
 */
export const widgetFromRead = (
    block: CompositionBlock,
    read: ComponentRead,
    held?: Widget,
    stored?: StoredCard,
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
                  unit_change: stored?.unit_change ?? null,
                  card_changes: stored?.card_changes ?? null,
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
 * once the harness has closed it. `onCarry` hears whether this page carries
 * the turn itself: true once the harness grants a resume (its turn index or
 * first frame), and false when it refuses one and before each wait while
 * another stream holds the turn. A resume refused 409
 * (the turn was taken or paused meanwhile) or 503 `transient_unavailable`
 * reads the state again, after the wait the refusal names and at least
 * DEFAULT_WAIT_SECONDS. Each read is asked with `since()`. A read whose open
 * turn is later than the one this stream carries (another tab closed this
 * turn and began the next) goes to `onRead`, which merges it, ends this turn
 * with a `done` and goes to `onNextTurn`, which carries the later turn on
 * under handlers of its own. A read that finds this turn closed and no later
 * turn open yet ends the stream with a `done`. A read whose latest turn is
 * earlier than this one, or that holds no turn, comes from a session the
 * harness began afresh under the same id: it is not merged, and goes to
 * `handlers.onSessionGone`, which ends the turn (the stream rejects without
 * one). Any other refused resume, and a read refused as a StateRefusal
 * (the session is gone, or a guest must sign in), goes to
 * `handlers.onRefusal` and ends the turn when it deals with it. Rejects when
 * that refusal is not dealt with, a resume is refused RESUME_ATTEMPTS times,
 * or a read fails, and with an AbortError when `signal` aborts.
 */
export const carryOnTurn = async ({
    conversationId,
    first,
    handlers,
    signal,
    since,
    onRead,
    onNextTurn,
    onCarry,
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
    onNextTurn: (read: ConversationRead) => void;
    onCarry?: (own: boolean) => void;
    resume?: typeof runResume;
    read?: (
        conversationId: string,
        since: number,
        signal?: AbortSignal,
    ) => Promise<ConversationRead | StateRefusal | null>;
    sleep?: typeof abortableSleep;
}): Promise<void> => {
    let refusals = 0;

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
            let refused: StreamRefusal | null = null;
            // Set once the harness grants the resume.
            let granted = false;
            const grant = () => {
                if (!granted) {
                    granted = true;
                    onCarry?.(true);
                }
            };

            await resume(
                conversationId,
                step.turnIndex,
                {
                    ...handlers,
                    onTurnIndex: (index) => {
                        grant();
                        handlers.onTurnIndex?.(index);
                    },
                    onFrame: (frame) => {
                        grant();
                        handlers.onFrame(frame);
                    },
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

            onCarry?.(false);

            const final: StreamRefusal = refused;
            const wait = resumeRetryAfter(final);

            if (wait === null && handlers.onRefusal?.(final)) {
                return;
            }

            refusals += 1;

            if (wait === null || refusals >= RESUME_ATTEMPTS) {
                throw new Error(`the turn could not be resumed: HTTP ${final.status}`);
            }

            await sleep(wait * 1000, signal);
        } else {
            onCarry?.(false);
            await sleep(step.seconds * 1000, signal);
        }

        const answer = await read(conversationId, since(), signal);

        if (answer && isStateRefusal(answer) && handlers.onRefusal?.(answer.http)) {
            return;
        }

        if (!answer || isStateRefusal(answer)) {
            throw new Error('the conversation state could not be read');
        }

        if ((answer.turn?.index ?? 0) < step.turnIndex) {
            if (handlers.onSessionGone) {
                handlers.onSessionGone();

                return;
            }

            throw new Error('the harness began the conversation afresh');
        }

        handlers.onKeepAlive?.();
        onRead(answer);

        const next = attachStep(answer);

        if (next.kind !== 'none' && next.turnIndex > step.turnIndex) {
            handlers.onFrame(CLOSED_FRAME);
            onNextTurn(answer);

            return;
        }

        step = next;
    }
};
