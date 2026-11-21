'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
    endTurnActivity,
    recordApproval,
    recordStep,
    restoreActivity,
    type ActivityEntry,
    type SavedActivityEntry,
} from '@/lib/studio/activity';
import { restoreCardRevisions } from '@/lib/studio/cardDownload';
import {
    createStallWatch,
    createStepLine,
    createWorkingGrace,
    IDLE,
    preambleLine,
    stoppedReply,
    WORKING,
} from '@/lib/studio/chatLine';
import { createCanvasEdits } from '@/lib/studio/canvasEdits';
import {
    chipAction,
    chipLine,
    chipRefusalDetail,
    splitSuggestions,
    withoutChips,
    withRefusedChip,
} from '@/lib/studio/chips';
import {
    clarifyAnswer,
    clarifyFromFrame,
    clarifyNote,
    clarifyReply,
    type Clarify,
    type ClarifyAnswers,
    type ClarifyReply,
} from '@/lib/studio/clarify';
import {
    createLegacyCanvas,
    restoreCanvas,
    takeManifest,
    type CanvasBaseline,
    type LegacyCanvas,
} from '@/lib/studio/composition';
import {
    attachStep,
    carryOnTurn,
    mergeClosedTurns,
    owedNewQuestion,
    readConversation,
} from '@/lib/studio/conversationState';
import { plainTextFromNote } from '@/lib/studio/note';
import {
    approveReply,
    approvedFromFrame,
    planFromFrame,
    refusedSwitch,
    stalePlan,
    startSwitch,
    stoppedQueuedSwitch,
    switchEnded,
    endedSwitch,
    switchLine,
    switchReply,
    unreachableSwitch,
    optionLabel,
    withApprovedPlan,
    questionPause,
    withQuestion,
    answeredPause,
    type ApprovedPlan,
    type Pause,
    type PlanState,
} from '@/lib/studio/plan';
import {
    ensureTurn,
    heldTurns,
    readSince,
    withAnswer,
    withInheritedBefore,
    withHarnessTurn,
    withNewQuestion,
    withRefundedPrompt,
} from '@/lib/studio/transcript';
import {
    cancelTurn,
    fetchComponentRevision,
    mutateComposition,
    runApplyChoice,
    runInterrupt,
    runTurn,
    STOP_GRACE_MS,
    SWITCH_STOP_GRACE_MS,
    whileBusy,
    type StreamHandlers,
    type StreamRefusal,
} from '@/lib/studio/studioClient';
import { reviseWidget, widgetFromComponent } from '@/lib/studio/widgets';
import type {
    ApplyChoiceSuggestion,
    CompositionManifest,
    ConversationRead,
    InterruptResponse,
    MutationOperation,
    Seed,
    StudioFrame,
    ToolError,
} from '@/lib/studio/wire';
import { uuid } from '@/lib/uuid';
import type { CardRef, Widget } from '@/lib/chat/widgets';

// A user message sent from a card's "Ask follow up" keeps that card's title,
// so the transcript shows what the question was about. `answer` marks the
// user's answer to a paused turn (a clarify choice or text, a plan
// amendment): shown like any user message, but part of the turn it answers.
// `refunded` marks a prompt whose turn was refused, which the site's prompt
// meter gave back. `harnessTurn` is the harness's index of the turn a prompt
// opened, as its stream's x-dfo-turn-index header or a state read named it,
// and keys the prompt and its reply to the harness's turns.
// `fromNewQuestion` marks a prompt sent as the new question that harness
// turn handed back (`done`'s `new_question`), so it is sent once.
// `inherited` marks a message a fork copied from another conversation,
// whose turn keys belong to that conversation's session.
// A bot turn's `followups` are prompts a click sends as the next message,
// and its `chips` switch a scope choice of the answer's readings. `plan` is
// the plan the user approved for this answer, saved with the transcript so
// a reopened conversation can show it.
export type ChatMessage =
    | {
          role: 'user';
          text: string;
          card?: { title: string };
          answer?: true;
          refunded?: true;
          harnessTurn?: number;
          fromNewQuestion?: number;
          inherited?: true;
      }
    | {
          role: 'bot';
          text: string;
          inherited?: true;
          followups?: string[];
          chips?: ApplyChoiceSuggestion[];
          plan?: ApprovedPlan;
      };

// A widget stamped with the send() turn it arrived in. A save from before
// the harness manifest decided the canvas shows the latest turn's widgets
// plus whatever the user pinned (legacyCanvasWidgetsOf).
export type TurnWidget = Widget & { turn: number };

export type { PlanState };

/**
 * A card-scoped turn's target: which card the question is about, and whether
 * the agent should answer about it (`follow_up`) or revise it (`edit`). Sent
 * as the turn's `component_ref`.
 */
export type CardTarget = {
    componentId: string;
    intent: 'follow_up' | 'edit';
    title?: string;
};

// A message sent while a request was in flight: it waits for the
// conversation to be free and enters the transcript when it is sent. A
// clicked `apply_choice` chip waits the same way, under its label. A new
// question a harness turn handed back carries that turn's index
// (`fromNewQuestion`), which its prompt keeps.
export type QueuedMessage = {
    id: string;
    text: string;
    card?: CardTarget;
    seeds?: Seed[];
    chip?: ApplyChoiceSuggestion;
    fromNewQuestion?: number;
};

export type ChatState = {
    messages: ChatMessage[];
    widgets: TurnWidget[];
    // Messages waiting behind the in-flight request, in send order.
    queued: QueuedMessage[];
    // The Activity view's data — one entry per turn (an answered pause
    // continues the same entry).
    activity: ActivityEntry[];
    // The chat line, set while a turn streams: what the agent is doing (the
    // latest running step's label, the preamble's first sentence, or the note
    // of a resumed pause).
    status: string | null;
    // The running step's `detail`, when the line shows a step that has one.
    statusDetail: string | null;
    // When `status` last changed to a different label (ms epoch).
    statusSince: number | null;
    // True after STALL_MS of silence on an open stream (no frame, no
    // keep-alive).
    stalled: boolean;
    thinking: boolean;
    clarify: Clarify | null;
    plan: PlanState | null;
};

// A saved conversation's chat half — what hydrate() restores and what a
// shared/forked copy starts from. Approved plans ride on their answers in
// `messages`.
export type ChatSnapshot = {
    sessionId: string | null;
    componentRefs?: CardRef[];
    messages: ChatMessage[];
    widgets: TurnWidget[];
    activity?: SavedActivityEntry[];
    // The display ordinal of the latest turn, which numbers the widgets and
    // the Activity entries. The harness's own turn index rides on each
    // prompt (`harnessTurn`).
    turnCount: number;
    // The harness canvas this conversation last saw (see useChat's
    // canvasRef). Optional: saves from before this didn't have it.
    canvas?: CanvasBaseline | null;
    localIds?: string[];
    pinnedIds?: string[];
    removedIds?: string[];
    graceIds?: string[];
    graceTurn?: number;
};

const NO_IDS: string[] = [];

const NO_LINE = { status: null, statusDetail: null, statusSince: null, stalled: false } as const;

// The chat line while another stream holds the conversation and a turn waits
// for it.
const BUSY_LINE = 'Waiting for the conversation to be free';

// The state with the chat line set; `statusSince` moves only when the label
// changes.
const withLine = (prev: ChatState, status: string, statusDetail: string | null = null) => ({
    ...prev,
    status,
    statusDetail,
    statusSince: status === prev.status ? prev.statusSince : Date.now(),
});

// How a stream ended: its error frame, whether `done` arrived, whether the
// user stopped it, whether it broke, and whether its request started (a Stop
// while it waited in the queue skips the request).
type StreamEnding = {
    error: ToolError | null;
    done: boolean;
    stopped: boolean;
    failed: boolean;
    sent: boolean;
};

// Whether the turn's reply has text: the last message is the bot's, with any.
const hasAnswer = (messages: ChatMessage[]): boolean => {
    const last = messages.at(-1);

    return last?.role === 'bot' && !!last.text;
};

// A turn's end on screen, however it ended: its Activity entry closes and
// the chat line clears. `answered` is read before a failure's detail fills
// an empty reply, so a caller that fills it passes the earlier messages'.
const endTurn = (
    prev: ChatState,
    turn: number,
    open?: 'skipped' | 'failed',
    answered = hasAnswer(prev.messages),
): ChatState => ({
    ...prev,
    activity: endTurnActivity(prev.activity, turn, open, answered),
    ...NO_LINE,
    thinking: false,
});

// A conversation restored WITHOUT its server-side session (a fork of a
// share, or a save whose session is gone) primes the next turn with a compact
// recap of the transcript, so the agent picks up the thread instead of
// starting cold. Sent with the message, never shown in the chat.
const RECAP_TURNS = 6;
const RECAP_CHARS = 700;

const buildRecap = (messages: ChatMessage[]): string | null => {
    const lines = messages
        .filter((message) => message.text.trim())
        .slice(-RECAP_TURNS * 2)
        .map((message) => {
            const text = message.text.replace(/\s+/g, ' ').trim();

            return `${message.role === 'user' ? 'User' : 'Assistant'}: ${
                text.length > RECAP_CHARS ? `${text.slice(0, RECAP_CHARS)}…` : text
            }`;
        });

    if (lines.length === 0) {
        return null;
    }

    return `Context — this continues an earlier conversation (summary of the transcript so far):\n${lines.join(
        '\n',
    )}\n\nNew message:\n`;
};

// A saved transcript as the chat shows it. Without its harness session the
// conversation starts afresh on the harness, which holds none of the answers
// that offered its chips, so they go.
const restoredMessages = (saved: ChatSnapshot): ChatMessage[] =>
    saved.sessionId ? saved.messages : withoutChips(saved.messages);

/**
 * Drives one Studio conversation against the harness's `/api/studio/*`
 * frames. Pauses (`plan.proposed`, `elicitation.request`) END the stream and
 * are answered on `/interrupt`, which streams the same turn onward; activity
 * arrives as labelled steps; cards arrive as `component.created` frames
 * mapped onto canvas widgets drawn from the component payload, and a stat
 * card upgrades in place with the statistics the datasets door measured.
 * `initial` seeds the hook from a saved conversation (a shared/forked copy)
 * instead of an empty chat.
 */
export const useChat = (initial?: ChatSnapshot) => {
    const [state, setState] = useState<ChatState>(() => ({
        messages: initial ? restoredMessages(initial) : [],
        widgets: initial?.widgets ?? [],
        queued: [],
        activity: restoreActivity(initial?.activity),
        ...NO_LINE,
        thinking: false,
        clarify: null,
        plan: null,
    }));
    // The conversation id doubles as the snapshot's sessionId, so saves and
    // shares reopen the same server-side conversation.
    const sessionRef = useRef<string | null>(initial?.sessionId ?? null);
    const abortRef = useRef<AbortController | null>(null);
    // Stops the running stream's turn (set while a request runs); true for
    // the stream's first Stop.
    const haltRef = useRef<(() => boolean) | null>(null);
    // The queue itself; `queued` in state mirrors it for rendering.
    const queueRef = useRef<QueuedMessage[]>([]);
    // Requests run one after another on this chain (the harness serves one
    // per conversation at a time).
    const chainRef = useRef<Promise<void>>(Promise.resolve());
    // Requests on the chain that have not settled yet.
    const inFlightRef = useRef(0);
    // Bumped by reset/hydrate so a late settle cannot act on the
    // conversation that replaced the one it belonged to.
    const generationRef = useRef(0);
    // Set below: the settle handler reaches send() through it.
    const drainRef = useRef<() => void>(() => {});
    const turnCount = useRef(initial?.turnCount ?? 0);
    // The transcript as last rendered, for the callbacks that read which
    // harness turns it holds (heldTurns) outside a state update.
    const messagesRef = useRef<ChatMessage[]>([]);

    useEffect(() => {
        messagesRef.current = state.messages;
    }, [state.messages]);
    const recapRef = useRef<string | null>(
        initial && !initial.sessionId ? buildRecap(initial.messages) : null,
    );
    // The pending pause's addressing (interrupt_id) with, for elicitations,
    // the normalized clarify that answerClarify() builds its reply and
    // status note from, and that skipClarify() reads `skippable` from.
    // For plans, the plan that switchChoice() checks a pick against. A
    // question a switch's replan asked carries the switch's waiting plan.
    const pendingInterruptRef = useRef<Pause | null>(null);
    // The latest plan this turn offered, or is waiting on a switch of. A
    // fresh plan.proposed carries its baseline (what the turn's first plan
    // held) and learns which choice its switch moved. A new turn clears it.
    const turnPlanRef = useRef<PlanState | null>(null);
    // The card an in-flight `edit` turn is changing. The harness answers an
    // edit with a REPLACEMENT component under a new id (and drops the old one
    // from its composition) rather than a component.revised, so the canvas has
    // to retire the original — otherwise an edit leaves two cards behind.
    const editingRef = useRef<string | null>(null);
    // component_id → the revision we're currently holding. A card-scoped turn
    // has to address both (the contract rejects a stale revision). Frames
    // keep it current; a reopened conversation starts from its saved cards.
    const revisionsRef = useRef(restoreCardRevisions(initial));
    // The harness's latest canvas manifest as this page saw it: its ids are
    // the harness cards the canvas shows (canvasWidgetsOf). Saved with the
    // conversation, so a reopened one keeps it. A share's copy has no
    // session, so it shows the canvas it was saved with.
    const canvasRef = useRef<CanvasBaseline | null>(restoreCanvas(initial));
    const [canvas, setCanvas] = useState<CanvasBaseline | null>(
        () => restoreCanvas(initial) ?? initial?.canvas ?? null,
    );
    // Every manifest goes through here: stream frames, `done`, state reads,
    // and the responses to the user's own edits. A late, older one is
    // ignored. While the canvas is legacy (see createLegacyCanvas) the
    // manifest goes to it first.
    const canvasEditsRef = useRef<ReturnType<typeof createCanvasEdits> | null>(null);
    const legacyRef = useRef<LegacyCanvas | null>(null);
    // The cards a legacy canvas showed that its harness session never held
    // (a fork's inherited cards), for the canvas document to keep as local.
    const [localCards, setLocalCards] = useState<string[]>(NO_IDS);
    const applyManifest = useCallback((manifest: CompositionManifest) => {
        if (legacyRef.current) {
            void legacyRef.current.offer(manifest);

            return;
        }

        const taken = takeManifest(canvasRef.current, manifest);

        if (taken) {
            canvasRef.current = taken;
            setCanvas(taken);
        }
    }, []);
    // A legacy canvas a reopened conversation (hydrate) restored for
    // `session` is brought to the harness's manifest once one arrives; until
    // then it shows the legacy cards and the cards drawn since. A share's
    // copy (`initial`) runs no turn and edits nothing, so it starts none.
    const startLegacy = useCallback(
        (session: string | null, baseline: CanvasBaseline | null) => {
            if (!session || baseline?.compositionId !== null) {
                legacyRef.current = null;

                return;
            }

            const generation = generationRef.current;
            const legacy = createLegacyCanvas({
                ids: baseline.ids,
                mutate: (operations) => mutateComposition(session, operations),
                onTake: (manifest) => {
                    if (generationRef.current !== generation) {
                        return;
                    }

                    if (legacyRef.current === legacy) {
                        legacyRef.current = null;
                    }

                    applyManifest(manifest);
                },
                onLocal: (ids) => {
                    if (generationRef.current === generation) {
                        setLocalCards(ids);
                    }
                },
                onChange: (ids) => {
                    if (generationRef.current === generation) {
                        canvasRef.current = { compositionId: null, revision: -1, ids };
                        setCanvas(canvasRef.current);
                    }
                },
            });

            legacyRef.current = legacy;
        },
        [applyManifest],
    );
    // The harness turns whose new question (see askNewQuestion) has been
    // queued, so a stream's `done` and a later state read send it once.
    const askedRef = useRef(new Set<number>());
    // A turn the harness ended because the user's change to its plan asked
    // something else: the text goes to the front of the queue and is sent as
    // the next turn (metered, as typed) once the conversation is free.
    const askNewQuestion = useCallback((turnIndex: number, text: string) => {
        if (askedRef.current.has(turnIndex)) {
            return;
        }

        const queued: QueuedMessage = { id: uuid(), text, fromNewQuestion: turnIndex };

        askedRef.current.add(turnIndex);
        queueRef.current.unshift(queued);
        setState((prev) => ({ ...prev, queued: [queued, ...prev.queued] }));
    }, []);
    // A canvas edit the user made to a card the harness holds (Remove, Pin,
    // Add), sent to the harness, whose manifest then decides whether the
    // card shows, so the canvas the agent reads matches this one. Nothing to
    // send before the conversation has a session. A legacy canvas shows the
    // edit at once.
    // Edits go one after another, so a Remove then an Add land in order; a
    // response for a conversation since left is dropped.
    const syncCanvas = useCallback(
        (operations: MutationOperation[]) => {
            const session = sessionRef.current;

            if (!session) {
                return;
            }

            for (const operation of operations) {
                if (operation.op === 'add') {
                    legacyRef.current?.keep(operation.component_id);
                } else if (operation.op === 'remove') {
                    legacyRef.current?.drop(operation.component_id);
                }
            }

            canvasEditsRef.current ??= createCanvasEdits({
                mutate: mutateComposition,
                onManifest: applyManifest,
                onFailure: (failedOperations, error) => {
                    console.warn(
                        'Studio: this canvas edit did not reach the harness',
                        failedOperations,
                        error,
                    );
                },
            });
            void canvasEditsRef.current.enqueue(session, operations);
        },
        [applyManifest],
    );
    // Put a plan card up as the pending pause, whether from the stream or
    // from a refusal that answered a stale card with the current one.
    const offerPlan = useCallback((plan: PlanState) => {
        pendingInterruptRef.current = { interruptId: plan.interruptId, plan };
        turnPlanRef.current = plan;
        setState((prev) => ({ ...prev, ...NO_LINE, thinking: false, plan }));
    }, []);
    // Swap one widget in place, wherever it sits in the list.
    const patchWidget = useCallback((id: string, fn: (widget: TurnWidget) => TurnWidget) => {
        setState((prev) => ({
            ...prev,
            widgets: prev.widgets.map((widget) => (widget.id === id ? fn(widget) : widget)),
        }));
    }, []);

    // `onRefusal` answers an HTTP refusal of the request, and `onUnreachable`
    // a request that got no response (see StreamHandlers); each returns true
    // when it has dealt with it, and anything else ends the turn as an error.
    // Once the stream ends, at its `done` or `error` frame or else when it
    // closes, `onEnd` gets how it ended (see StreamEnding) and ends the turn
    // on screen. A caller without one gets `endOwn`. A caller with one (a
    // switch, whose harness may re-offer the plan after a Stop) also keeps
    // the frames after Stop, for up to SWITCH_STOP_GRACE_MS, with the chat
    // line on "Stopping". `metered` marks a POST turn, whose prompt the
    // site's meter gives back when the response is a refusal (meterTurn), so
    // a refusal marks the turn's prompt refunded.
    const stream = useCallback(
        (
            turn: number,
            start: (handlers: StreamHandlers, signal: AbortSignal) => Promise<void>,
            {
                onRefusal,
                onUnreachable,
                onEnd,
                metered = false,
            }: {
                onRefusal?: (refusal: StreamRefusal) => boolean;
                onUnreachable?: () => boolean;
                onEnd?: (ending: StreamEnding) => void;
                metered?: boolean;
            } = {},
        ) => {
            const controller = new AbortController();
            const generation = generationRef.current;
            // The user stopped the stream (Stop).
            let stopped = false;
            // Set by Stop without `onEnd`: the stream is read to its end and
            // its frames are ignored.
            let muted = false;
            let harnessError: ToolError | null = null;
            let done = false;
            let failed = false;
            // The request has started.
            let sent = false;
            // The turn's end on screen has run (finish).
            let finished = false;
            let stopGrace: ReturnType<typeof setTimeout> | null = null;
            // Runs from the request's start until the stream ends or pauses.
            const stall = createStallWatch((stalled) => {
                if (generationRef.current === generation && !muted) {
                    setState((prev) => ({ ...prev, stalled }));
                }
            });

            // The fall back to "Working", held back while a finished step may
            // hand over to the next one.
            const grace = createWorkingGrace(() => {
                if (generationRef.current === generation && !stopped) {
                    setState((prev) => withLine(prev, WORKING));
                }
            });

            // A step's chat line. After Stop the line stays on "Stopping".
            const showLine = (label: string, detail: string | null = null) => {
                if (!stopped) {
                    setState((prev) =>
                        prev.status === label && prev.statusDetail === detail
                            ? prev
                            : withLine(prev, label, detail),
                    );
                }
            };

            const patchActivity = (fn: (entry: ActivityEntry) => ActivityEntry) =>
                setState((prev) => ({
                    ...prev,
                    activity: prev.activity.map((entry) =>
                        entry.turn === turn ? fn(entry) : entry,
                    ),
                }));

            const patchBot = (
                fn: (message: Extract<ChatMessage, { role: 'bot' }>) => ChatMessage,
            ) =>
                setState((prev) => {
                    const messages = prev.messages.slice();
                    const last = messages[messages.length - 1];

                    if (last?.role === 'bot') {
                        messages[messages.length - 1] = fn(last);
                    }

                    return { ...prev, messages };
                });

            // Deltas BEFORE any step are the agent's preamble ("Checking the
            // growth of …"). The chat line shows its first sentence; the full
            // text reaches the transcript with message.complete. Deltas after
            // the steps are the answer streaming in.
            let sawStep = false;
            let preamble = '';
            const stepLine = createStepLine();

            // The harness's index of the turn this stream carries, from its
            // x-dfo-turn-index header. The turn's prompt takes it, so the
            // prompt and its reply are keyed on the harness's turn.
            let turnIndex: number | null = null;

            const keyTurn = (index: number) => {
                if (generationRef.current !== generation) {
                    return;
                }

                turnIndex = index;
                setState((prev) => {
                    const messages = withHarnessTurn(prev.messages, index);

                    return messages === prev.messages ? prev : { ...prev, messages };
                });
            };

            const handle = (frame: StudioFrame) => {
                // A stream that reset/hydrate walked away from, or that the
                // user stopped, must not write into the conversation.
                if (generationRef.current !== generation || muted) {
                    return;
                }

                stall.beat();

                switch (frame.event) {
                    case 'message.delta':
                        if (!sawStep) {
                            preamble += frame.text;
                            const label = preambleLine(preamble);

                            if (label) {
                                grace.cancel();
                                showLine(label);
                            }

                            break;
                        }

                        // Deltas after the steps are the answer.
                        grace.cancel();
                        showLine('Writing the answer');
                        patchBot((last) => ({ ...last, text: last.text + frame.text }));
                        break;
                    case 'message.complete':
                        // The authoritative text replaces the deltas. Pause
                        // decisions ("Plan approved.") show on the status
                        // line and do not enter the record.
                        patchBot((last) => ({ ...last, text: frame.text }));
                        break;
                    case 'activity.step': {
                        sawStep = true;

                        // Only running frames open a chat line. A step that
                        // ends hands the line back to the step still running,
                        // else keeps its label for a grace period and then
                        // shows "Working". Complete and failed frames update
                        // the Activity record.
                        const line = stepLine(frame);

                        if (line === IDLE) {
                            grace.idle();
                        } else if (line) {
                            grace.cancel();
                            showLine(line.label, line.detail);
                        }

                        // One Activity line per step_id. A later frame for the
                        // same step closes or updates the line it opened.
                        const arrived = Date.now();

                        patchActivity((entry) => recordStep(entry, frame, arrived));

                        break;
                    }
                    case 'component.created': {
                        const widget = widgetFromComponent(frame);

                        revisionsRef.current.set(frame.component_id, frame.revision);

                        if (!widget) {
                            break;
                        }

                        // The card this turn set out to edit, if the harness
                        // answered with a replacement under a new id.
                        const replacing =
                            editingRef.current && editingRef.current !== widget.id
                                ? editingRef.current
                                : null;

                        editingRef.current = null;

                        // A legacy canvas shows the card at once, and drops
                        // the card it replaced.
                        legacyRef.current?.keep(widget.id);

                        if (replacing) {
                            legacyRef.current?.drop(replacing);
                        }

                        // A re-used component id (a replacement card) UPDATES
                        // the card in place and pulls it into this turn,
                        // instead of being dropped as a duplicate. A new id
                        // that replaces an edited card takes ITS slot, so the
                        // card doesn't jump to the end of the canvas.
                        setState((prev) => {
                            if (replacing && prev.widgets.some((other) => other.id === replacing)) {
                                return {
                                    ...prev,
                                    widgets: prev.widgets.map((other) =>
                                        other.id === replacing ? { ...widget, turn } : other,
                                    ),
                                };
                            }

                            return {
                                ...prev,
                                widgets: prev.widgets.some((other) => other.id === widget.id)
                                    ? prev.widgets.map((other) =>
                                          other.id === widget.id ? { ...widget, turn } : other,
                                      )
                                    : [...prev.widgets, { ...widget, turn }],
                            };
                        });

                        break;
                    }
                    case 'component.revised': {
                        revisionsRef.current.set(frame.component_id, frame.revision);

                        const revise = (revised: typeof frame) =>
                            patchWidget(revised.component_id, (widget) => ({
                                ...(reviseWidget(widget, revised) as TurnWidget),
                                turn: widget.turn,
                            }));

                        if (frame.payload) {
                            revise(frame);
                        } else {
                            // The card keeps what it shows until the
                            // revision's payload is read by id. A newer
                            // revision, or a reset, makes the read stale.
                            void fetchComponentRevision(frame.component_id, frame.revision).then(
                                (payload) => {
                                    if (
                                        payload &&
                                        generationRef.current === generation &&
                                        revisionsRef.current.get(frame.component_id) ===
                                            frame.revision
                                    ) {
                                        revise({ ...frame, payload });
                                    }
                                },
                            );
                        }

                        break;
                    }
                    case 'plan.proposed': {
                        // Also the answer to a switch or an amendment, whose
                        // fresh plan replaces the card and marks what changed
                        // since the turn's first plan.
                        stall.stop();
                        grace.cancel();
                        offerPlan(planFromFrame(frame, turnPlanRef.current ?? undefined));

                        // The turn waits on the user again, so a Stop has
                        // nothing to cancel.
                        if (haltRef.current === halt) {
                            haltRef.current = null;
                        }

                        break;
                    }
                    case 'plan.approved': {
                        // Comes first on the approve's stream, so the reply it
                        // writes into is the transcript's last message. The
                        // turn's Activity entry records the approval time,
                        // which places the plan among its steps.
                        const approved = approvedFromFrame(frame);
                        const approvedAt = Date.now();

                        setState((prev) => ({
                            ...prev,
                            messages: withApprovedPlan(prev.messages, approved),
                            activity: prev.activity.map((entry) =>
                                entry.turn === turn ? recordApproval(entry, approvedAt) : entry,
                            ),
                        }));
                        break;
                    }
                    case 'plan.versioned':
                        // Transient bookkeeping — the fresh plan.proposed that
                        // follows re-renders the card.
                        break;
                    case 'elicitation.request': {
                        // Also a question a switch's replan asks, which takes
                        // the waiting card's place and carries the switch.
                        const clarify = clarifyFromFrame(frame);

                        stall.stop();
                        grace.cancel();
                        pendingInterruptRef.current = questionPause(
                            clarify,
                            pendingInterruptRef.current,
                        );
                        setState((prev) =>
                            withQuestion({ ...prev, ...NO_LINE, thinking: false }, clarify),
                        );
                        break;
                    }
                    case 'suggestions': {
                        const { followups, chips } = splitSuggestions(frame.items);

                        if (followups.length > 0 || chips.length > 0) {
                            patchBot((last) => ({
                                ...last,
                                ...(followups.length > 0 && { followups }),
                                ...(chips.length > 0 && { chips }),
                            }));
                        }

                        break;
                    }
                    case 'composition.updated':
                        // The whiteboard keeps its own layout; a manifest only
                        // says which cards the harness took off the canvas.
                        applyManifest(frame.manifest);
                        break;
                    case 'error':
                        stall.stop();
                        grace.cancel();
                        harnessError = frame.error;
                        finish();
                        break;
                    case 'done':
                        stall.stop();
                        grace.cancel();
                        done = true;

                        if (frame.composition) {
                            applyManifest(frame.composition);
                        }

                        if (frame.new_question) {
                            const question = frame.new_question;

                            setState((prev) => ({
                                ...prev,
                                messages: withNewQuestion(prev.messages, question),
                            }));
                            askNewQuestion(turnIndex ?? heldTurns(messagesRef.current), question);
                        }

                        finish();
                        break;
                }
            };

            // Stop ends the turn on screen at once and keeps what arrived (an
            // empty answer takes the preamble, else a note). The stream is
            // read until the harness ends it, so the request counts as in
            // flight, and queued sends wait, until the conversation is free.
            // A caller that ends the turn itself keeps the frames (a switch's
            // stream may re-offer the plan). A Stop before the request
            // started ends it at once, and the request is skipped. Returns
            // whether to send the cancel, which is true on the stream's
            // first Stop once its request has started.
            const halt = (): boolean => {
                if (stopped || generationRef.current !== generation) {
                    return false;
                }

                stopped = true;
                grace.cancel();

                if (sent) {
                    stopGrace = setTimeout(
                        () => controller.abort(),
                        onEnd ? SWITCH_STOP_GRACE_MS : STOP_GRACE_MS,
                    );
                }

                if (onEnd) {
                    if (!sent) {
                        // Stop is free for the next stream queued behind this
                        // one, which the chain has not reached yet.
                        if (haltRef.current === halt) {
                            haltRef.current = null;
                        }

                        finish();

                        return false;
                    }

                    setState((prev) => withLine(prev, 'Stopping'));

                    return true;
                }

                muted = true;
                stall.stop();

                setState((prev) => {
                    const messages = prev.messages.slice();
                    const last = messages[messages.length - 1];

                    if (last?.role === 'bot' && !last.text) {
                        messages[messages.length - 1] = { ...last, text: stoppedReply(preamble) };
                    }

                    return endTurn({ ...prev, messages }, turn, 'skipped');
                });

                return sent;
            };

            // The end of a turn whose caller leaves it to the stream: `done`
            // ends it, an error frame ends it failed with its detail as an
            // empty reply's text, and a broken stream ends it failed. A
            // stream that paused leaves the turn open, and one the user
            // stopped ended on screen at the Stop.
            const endOwn = (ending: StreamEnding) => {
                if (ending.stopped) {
                    return;
                }

                const detail = ending.error?.detail;

                if (detail !== undefined) {
                    setState((prev) => {
                        const messages = prev.messages.slice();
                        const last = messages[messages.length - 1];

                        if (last?.role === 'bot' && !last.text) {
                            messages[messages.length - 1] = { ...last, text: `_${detail}_` };
                        }

                        return endTurn(
                            { ...prev, messages },
                            turn,
                            'failed',
                            hasAnswer(prev.messages),
                        );
                    });
                } else if (ending.failed || ending.done) {
                    setState((prev) => endTurn(prev, turn, ending.failed ? 'failed' : undefined));
                }
            };

            // The turn's end on screen, once: at the `done` or `error` frame,
            // or else when the stream closes.
            const finish = () => {
                if (!finished) {
                    finished = true;
                    (onEnd ?? endOwn)({ error: harnessError, done, stopped, failed, sent });
                }
            };

            // A refusal or a failed fetch of a stream that reset/hydrate
            // walked away from, or that the user stopped, is dropped, as
            // handle() drops frames. A switch the user stopped then ends as
            // stopped (its `onEnd`), not on a live card whose buttons the
            // cancel has made useless.
            const refuse = (refusal: StreamRefusal): boolean => {
                if (generationRef.current !== generation) {
                    return true;
                }

                if (metered) {
                    setState((prev) => ({ ...prev, messages: withRefundedPrompt(prev.messages) }));
                }

                return muted || stopped || (onRefusal?.(refusal) ?? false);
            };
            const unreachable = (): boolean =>
                generationRef.current !== generation ||
                muted ||
                stopped ||
                (onUnreachable?.() ?? false);

            // Queue behind whatever is in flight. The controller is published
            // when the request actually starts, so reset aborts the fetch
            // that is running, not one still waiting here. The halt is
            // published at once for a switch when no stream holds Stop (the
            // one ahead paused on a plan but has not closed yet), so a Stop
            // while it waits skips its request. A resume has no such halt:
            // it has already cleared its card, so skipping its request would
            // lose the approval while the pause waits.
            if (onEnd && haltRef.current === null) {
                haltRef.current = halt;
            }

            inFlightRef.current += 1;
            chainRef.current = chainRef.current
                .then(() => {
                    if (generationRef.current !== generation || stopped) {
                        return;
                    }

                    sent = true;
                    abortRef.current = controller;
                    haltRef.current = halt;
                    stall.beat();

                    return start(
                        {
                            onFrame: handle,
                            onTurnIndex: keyTurn,
                            onKeepAlive: stall.beat,
                            onRefusal: refuse,
                            onUnreachable: unreachable,
                        },
                        controller.signal,
                    ).catch((error: Error) => {
                        if (error.name !== 'AbortError' && generationRef.current === generation) {
                            failed = true;
                        }
                    });
                })
                .finally(() => {
                    stall.stop();
                    grace.cancel();

                    if (stopGrace !== null) {
                        clearTimeout(stopGrace);
                    }

                    if (haltRef.current === halt) {
                        haltRef.current = null;
                    }

                    if (generationRef.current !== generation) {
                        return;
                    }

                    finish();

                    inFlightRef.current -= 1;

                    // A stream that broke mid-way says nothing about whether
                    // the harness has let go of the conversation, so the
                    // queue holds until the user acts again.
                    if (!failed) {
                        drainRef.current();
                    }
                });
        },
        [applyManifest, askNewQuestion, offerPlan, patchWidget],
    );

    // While a request is in flight a new turn waits its turn; the settle
    // handler sends it (then the next) once the conversation is free. During
    // a pause it also waits behind turns already held, so it cannot overtake
    // them. Returns whether the turn was held.
    const holdTurn = useCallback((item: Omit<QueuedMessage, 'id'>): boolean => {
        if (
            inFlightRef.current === 0 &&
            (queueRef.current.length === 0 || pendingInterruptRef.current === null)
        ) {
            return false;
        }

        const queued: QueuedMessage = { id: uuid(), ...item };

        queueRef.current.push(queued);
        setState((prev) => ({ ...prev, queued: [...prev.queued, queued] }));

        return true;
    }, []);

    // Open a turn on screen: the user's message and an empty reply join the
    // transcript, the turn gets its Activity entry, and the chat line shows
    // `line`. A new turn on a paused conversation abandons the pause (the
    // contract's rule), so any plan or clarify card goes with it.
    const startTurn = useCallback((user: ChatMessage & { role: 'user' }, line: string) => {
        const conversation = sessionRef.current ?? uuid();

        sessionRef.current = conversation;
        turnCount.current += 1;
        const turn = turnCount.current;

        pendingInterruptRef.current = null;
        turnPlanRef.current = null;
        editingRef.current = null;
        setState((prev) => ({
            ...withLine(prev, line),
            messages: [...prev.messages, user, { role: 'bot', text: '' }],
            activity: [
                ...prev.activity,
                { turn, prompt: user.text, startedAt: Date.now(), tools: [] },
            ],
            thinking: true,
            clarify: null,
            plan: null,
        }));

        return { turn, conversation };
    }, []);

    // A turn request sent while another stream holds the conversation (a
    // second tab, or a stream the harness has not yet seen end) is answered
    // 409 `transient_unavailable`. It is sent again after the wait the
    // answer names, with the chat line saying so, and the refusal never
    // reaches the transcript.
    const untilFree = useCallback(
        (
            run: (handlers: StreamHandlers) => Promise<void>,
            handlers: StreamHandlers,
            signal: AbortSignal,
        ): Promise<void> => {
            const generation = generationRef.current;

            return whileBusy(run, handlers, signal, {
                onWait: () => {
                    if (generationRef.current === generation) {
                        setState((prev) => withLine(prev, BUSY_LINE));
                    }
                },
            });
        },
        [],
    );

    // `fromNewQuestion` is the harness turn whose new question this sends
    // (askNewQuestion).
    const send = useCallback(
        (message: string, card?: CardTarget, seeds?: Seed[], fromNewQuestion?: number) => {
            const text = message.trim();

            if (!text || holdTurn({ text, card, seeds, fromNewQuestion })) {
                return;
            }

            const { turn, conversation } = startTurn(
                {
                    role: 'user',
                    text,
                    ...(card?.title && { card: { title: card.title } }),
                    ...(fromNewQuestion !== undefined && { fromNewQuestion }),
                },
                'Resolving the question',
            );
            const recap = recapRef.current;

            recapRef.current = null;

            // A turn about a specific card carries its component_ref, so the
            // harness scopes the work to that card — an `edit` intent revises
            // it in place instead of answering with a new one. The revision
            // has to be the one we're holding: the contract addresses a card
            // by id AND revision.
            editingRef.current = card?.intent === 'edit' ? card.componentId : null;

            const revision = card ? revisionsRef.current.get(card.componentId) : undefined;
            const componentRef =
                card && revision
                    ? {
                          component_id: card.componentId,
                          revision,
                          intent: card.intent,
                      }
                    : undefined;

            // A question handed over from search carries its seeds, the
            // datasets the user saw there, so the harness starts from them.
            stream(
                turn,
                (handlers, signal) =>
                    untilFree(
                        (busyHandlers) =>
                            runTurn(
                                conversation,
                                recap ? `${recap}${text}` : text,
                                busyHandlers,
                                signal,
                                {
                                    ...(componentRef && { component_ref: componentRef }),
                                    ...(seeds && { seed_spec: seeds }),
                                },
                            ),
                        handlers,
                        signal,
                    ),
                { metered: true },
            );
        },
        [holdTurn, startTurn, stream, untilFree],
    );

    const unqueue = useCallback((id: string) => {
        queueRef.current = queueRef.current.filter((item) => item.id !== id);
        setState((prev) => ({ ...prev, queued: prev.queued.filter((item) => item.id !== id) }));
    }, []);

    // A switch's stream, from the pick (switchChoice) or from the answer to
    // a question its replan asked (resume), while `waiting` is the pending
    // plan. A fresh plan.proposed, its `switch_failed` included, replaces
    // the card through the stream; after Stop the frames are still read, so
    // the plan the harness re-offers on cancel ends the switch. A stream that
    // ends without a plan (it closed, broke, sent `done` or an error, or was
    // stopped) ends the card read-only, once, closing the turn's Activity
    // entry (endedSwitch) and leaving the reply alone. `refuse` gives the card
    // for a refusal, which stays up when live and is the read-only end
    // otherwise; `unreached` and `unsent` give the live card for a request
    // that never reached the harness and one stopped before it started.
    // Without them a refusal or an unreached request ends as an error, and a
    // Stop before the request started as stopped.
    const streamSwitch = useCallback(
        (
            turn: number,
            waiting: PlanState,
            start: (handlers: StreamHandlers, signal: AbortSignal) => Promise<void>,
            {
                refuse,
                unreached,
                unsent,
            }: {
                refuse?: (refusal: StreamRefusal) => PlanState;
                unreached?: () => PlanState;
                unsent?: () => PlanState;
            } = {},
        ) => {
            // The read-only card a refusal that may have used up the pause
            // ends on.
            let refused: PlanState | null = null;

            stream(turn, start, {
                onRefusal:
                    refuse &&
                    ((refusal) => {
                        const card = refuse(refusal);

                        if (card.live) {
                            offerPlan(card);
                        } else {
                            refused = card;
                        }

                        return true;
                    }),
                onUnreachable:
                    unreached &&
                    (() => {
                        offerPlan(unreached());

                        return true;
                    }),
                onEnd: ({ error, stopped, sent }) => {
                    // A fresh plan, a refusal or a question replaced the
                    // waiting card.
                    if (pendingInterruptRef.current?.plan !== waiting) {
                        return;
                    }

                    if (!sent && unsent) {
                        offerPlan(unsent());

                        return;
                    }

                    const { plan: ended, activity } = endedSwitch(waiting, {
                        error,
                        stopped,
                        refused,
                    });

                    pendingInterruptRef.current = null;
                    turnPlanRef.current = null;
                    setState((prev) => {
                        const after = switchEnded(prev, waiting, ended);

                        return after === prev
                            ? prev
                            : endTurn(after, turn, activity, hasAnswer(prev.messages));
                    });
                },
            });
        },
        [offerPlan, stream],
    );

    // Continue a paused turn on /interrupt — shared by clarify answers, the
    // skip button and the plan actions. `answer` is what the user chose or
    // wrote, which enters the transcript.
    // A stale plan answer (an approve sent from an out-of-date card) is
    // refused with the current card, which replaces it to be answered again.
    // The answer to a question a switch's replan asked puts the waiting card
    // back and resumes as the switch (streamSwitch).
    const resume = useCallback(
        (
            reply: ClarifyReply | Pick<InterruptResponse, 'decision' | 'plan_revision'>,
            note: string | null,
            answer?: string,
        ) => {
            const conversation = sessionRef.current;
            const pending = pendingInterruptRef.current;
            const after = answeredPause(pending);

            pendingInterruptRef.current = after;

            setState((prev) => ({
                // The decision shows on the status line; the user's answer
                // also stays in the transcript, once (a repeated click finds
                // no pause left to answer).
                ...withLine(prev, note ? plainTextFromNote(note) : 'Thinking'),
                messages: answer && pending ? withAnswer(prev.messages, answer) : prev.messages,
                thinking: true,
                clarify: null,
                plan: after?.plan ?? null,
            }));

            if (!conversation || !pending) {
                return;
            }

            const start = (handlers: StreamHandlers, signal: AbortSignal) =>
                runInterrupt(conversation, pending.interruptId, reply, handlers, signal);

            if (after?.plan) {
                streamSwitch(turnCount.current, after.plan, start);

                return;
            }

            stream(turnCount.current, start, {
                onRefusal: (refusal) => {
                    const current = stalePlan(refusal, pending?.plan);

                    if (current) {
                        offerPlan(current);
                    }

                    return current !== null;
                },
            });
        },
        [offerPlan, stream, streamSwitch],
    );

    // Answer every question of the pending clarify at once, keyed by
    // question id. The reply takes the frame's shape (`answers`, or a legacy
    // frame's `payload`); the note and the transcript name the chosen labels
    // and typed text.
    const answerClarify = useCallback(
        (answers: ClarifyAnswers) => {
            const clarify = pendingInterruptRef.current?.clarify;

            if (!clarify) {
                return;
            }

            const note = clarifyNote(clarify, answers);

            resume(clarifyReply(clarify, answers), `_${note}_`, clarifyAnswer(clarify, answers));
        },
        [resume],
    );

    // Skip: an explicit decision when the elicitation permits one (the agent
    // continues on its default); otherwise just dismiss the picker — the
    // turn stays paused and the next message abandons it.
    const skipClarify = useCallback(() => {
        const pending = pendingInterruptRef.current;

        if (pending?.clarify?.skippable) {
            resume({ decision: 'skip' }, '_Skipped._');

            return;
        }

        pendingInterruptRef.current = null;
        setState((prev) => ({ ...prev, clarify: null }));
        // Dismissing the picker lifts the hold on the queue.
        drainRef.current();
    }, [resume]);

    // The plan card's three buttons. An amendment carries the user's change
    // request; the stream then proposes a fresh plan version. A read-only
    // card has no pause to answer.
    const respondPlan = useCallback(
        (decision: 'approve' | 'amend' | 'reject', payload?: string) => {
            if (!pendingInterruptRef.current?.plan) {
                return;
            }

            const note =
                decision === 'approve'
                    ? '_Plan approved._'
                    : decision === 'reject'
                      ? '_Plan rejected._'
                      : `_Change requested: ${payload ?? ''}_`;

            resume(
                decision === 'approve'
                    ? approveReply(pendingInterruptRef.current?.plan)
                    : { decision, ...(decision === 'amend' ? { payload } : {}) },
                note,
                decision === 'amend' ? payload : undefined,
            );
        },
        [resume],
    );

    // A scope choice's or planner decision's option, picked on the plan card.
    // The card stays, its controls waiting, until the harness re-offers the
    // plan with what changed, or with `switch_failed` saying why it did not
    // apply. The page sets no deadline of its own, since a planner
    // decision's replan takes tens of seconds. A refusal that leaves the
    // pause alone keeps the card live and says why on the choice's row
    // (refusedSwitch); a stale one (the plan moved on elsewhere) is answered
    // with the current card, and any other ends the card read-only. A
    // request that never reached the harness keeps the card live, with "Try
    // again". The rest of the switch's end is streamSwitch's.
    const switchChoice = useCallback(
        (choiceId: string, optionId: string) => {
            const conversation = sessionRef.current;
            const pending = pendingInterruptRef.current;
            const plan = pending?.plan;
            const reply = plan ? switchReply(plan, choiceId, optionId) : null;

            if (!conversation || !pending || !plan || !reply) {
                return;
            }

            const label = optionLabel(plan.decisions, choiceId, optionId);
            const turn = turnCount.current;

            // The pause stays pending with the waiting plan. switchReply
            // refuses a second pick while it waits, and the plan the harness
            // re-offers is compared against it.
            const waiting = startSwitch(plan, { choiceId, optionId });

            pendingInterruptRef.current = { interruptId: pending.interruptId, plan: waiting };
            turnPlanRef.current = waiting;
            setState((prev) => ({
                ...withLine(prev, switchLine(choiceId, label)),
                thinking: true,
                plan: waiting,
            }));

            streamSwitch(
                turn,
                waiting,
                (handlers, signal) =>
                    runInterrupt(conversation, pending.interruptId, reply, handlers, signal),
                {
                    refuse: (refusal) => {
                        // The card shows only a harness ToolError's detail.
                        if (!refusal.error && refusal.detail) {
                            console.warn('Studio: a switch was refused', refusal);
                        }

                        return refusedSwitch(waiting, refusal);
                    },
                    // The request never reached the harness, so the pause
                    // waits.
                    unreached: () => unreachableSwitch(waiting),
                    // Stopped while it waited behind the stream that offered
                    // the plan. Nothing reached the harness, so the pause
                    // waits.
                    unsent: () => stoppedQueuedSwitch(waiting),
                },
            );
        },
        [streamSwitch],
    );

    // A clicked `apply_choice` chip runs a turn with the chip's choice and no
    // message, which the transcript shows as the chip's action (chipAction). A click while
    // a request is in flight waits in the queue, as a typed message does. A
    // chip the harness refuses (the answer moved on, or Search cannot serve
    // the option) leaves the reply saying why, with the answer's other chips.
    const applyChoice = useCallback(
        (chip: ApplyChoiceSuggestion) => {
            if (holdTurn({ text: chipAction(chip), chip })) {
                return;
            }

            const { turn, conversation } = startTurn(
                { role: 'user', text: chipAction(chip) },
                chipLine(chip),
            );

            stream(
                turn,
                (handlers, signal) =>
                    untilFree(
                        (busyHandlers) => runApplyChoice(conversation, chip, busyHandlers, signal),
                        handlers,
                        signal,
                    ),
                {
                    metered: true,
                    onRefusal: (refusal) => {
                        const detail = chipRefusalDetail(refusal);

                        if (detail === null) {
                            return false;
                        }

                        setState((prev) =>
                            endTurn(
                                { ...prev, messages: withRefusedChip(prev.messages, chip, detail) },
                                turn,
                                'failed',
                                hasAnswer(prev.messages),
                            ),
                        );

                        return true;
                    },
                },
            );
        },
        [holdTurn, startTurn, stream, untilFree],
    );

    // The queue head goes next, unless a pause (plan or clarify) is waiting
    // on the user: a new turn would abandon it, so the answer goes first.
    useEffect(() => {
        drainRef.current = () => {
            if (inFlightRef.current > 0 || pendingInterruptRef.current) {
                return;
            }

            const next = queueRef.current.shift();

            if (!next) {
                return;
            }

            setState((prev) => ({
                ...prev,
                queued: prev.queued.filter((item) => item.id !== next.id),
            }));

            if (next.chip) {
                applyChoice(next.chip);
            } else {
                send(next.text, next.card, next.seeds, next.fromNewQuestion);
            }
        };
    }, [applyChoice, send]);

    // The Stop control: end the running turn (see `halt` in stream()) and
    // ask the harness to cancel, once per stream whose request started. On a
    // switch, a second cancel would end the stream before the harness
    // re-offers the plan. Requests queued behind it also wait for the cancel
    // request to answer.
    const stop = useCallback(() => {
        const conversation = sessionRef.current;

        if (!conversation || !haltRef.current?.()) {
            return;
        }

        const cancelled = cancelTurn(conversation);

        chainRef.current = chainRef.current.then(() => cancelled);
    }, []);

    // Merge a state read into the conversation: the harness's closed turns
    // the page does not hold join the transcript (mergeClosedTurns), each
    // with a closed Activity entry, and its manifest says which cards are on
    // the canvas. A latest turn ended by a new question the page has not
    // sent yet queues it (owedNewQuestion), as that turn's `done` would have.
    // Returns the latest harness turn the transcript then holds.
    const takeRead = useCallback(
        (read: ConversationRead): number => {
            const before = messagesRef.current;
            const owed = owedNewQuestion(read, before);
            const { messages: merged, appended } = mergeClosedTurns(before, read.closed_since);
            const firstTurn = turnCount.current + 1;
            const now = Date.now();

            turnCount.current += appended.length;
            setState((prev) => {
                const { messages } = mergeClosedTurns(prev.messages, read.closed_since);

                return messages === prev.messages
                    ? prev
                    : {
                          ...prev,
                          messages,
                          activity: [
                              ...prev.activity,
                              ...appended.map((turn, at) => ({
                                  turn: firstTurn + at,
                                  prompt: turn.user_message,
                                  startedAt: now,
                                  endedAt: now,
                                  tools: [],
                              })),
                          ],
                      };
            });

            if (owed) {
                // A turn the page held keeps the typed text as its answer
                // until the next turn opens with it.
                if (owed.turnIndex <= heldTurns(before)) {
                    setState((prev) => ({
                        ...prev,
                        messages: withNewQuestion(prev.messages, owed.text),
                    }));
                }

                askNewQuestion(owed.turnIndex, owed.text);
            }

            if (read.manifest) {
                applyManifest(read.manifest);
            }

            return heldTurns(merged);
        },
        [applyManifest, askNewQuestion],
    );

    // A reopened conversation against the harness's copy (see
    // conversationState.ts): its closed turns, read from the lowest one the
    // transcript lacks (readSince) up to `closed_total`, and its canvas merge
    // in, a pause comes back as its card, and a running
    // turn is carried on (carryOnTurn). An open turn the snapshot never got
    // joins the transcript as its prompt and an empty reply (ensureTurn),
    // with its own Activity entry. Sends made while the state is read wait
    // for it, as they wait for a stream. Called after hydrate(), for a
    // signed-in user's own conversation: the proxy answers 404 for anyone
    // else, and the page then keeps its snapshot.
    const reattach = useCallback(() => {
        const conversation = sessionRef.current;

        if (!conversation) {
            return;
        }

        const generation = generationRef.current;
        let read: ConversationRead | null = null;

        inFlightRef.current += 1;
        void readConversation(conversation, readSince(messagesRef.current))
            .then(async (answer) => {
                // A save from before prompts carried their turn that holds
                // more prompts than its session has turns is a fork that went
                // on from a copied transcript (withInheritedBefore). Marked,
                // its own turns are read again from where they start.
                const latest = answer?.turn?.index ?? answer?.closed_total ?? 0;
                const marked = answer && withInheritedBefore(messagesRef.current, latest);

                if (
                    answer &&
                    marked &&
                    marked !== messagesRef.current &&
                    generationRef.current === generation
                ) {
                    messagesRef.current = marked;
                    setState((prev) => ({
                        ...prev,
                        messages: withInheritedBefore(prev.messages, latest),
                    }));
                    read = await readConversation(conversation, readSince(marked));
                } else {
                    read = answer;
                }
            })
            .finally(() => {
                if (generationRef.current !== generation) {
                    return;
                }

                inFlightRef.current -= 1;

                if (read) {
                    const held = takeRead(read);
                    const step = attachStep(read);

                    if (step.kind !== 'none') {
                        if (step.turnIndex > held) {
                            const prompt = read.turn?.user_message ?? '';

                            turnCount.current += 1;

                            const turn = turnCount.current;

                            setState((prev) => ({
                                ...prev,
                                messages: ensureTurn(prev.messages, step.turnIndex, prompt),
                                activity: [
                                    ...prev.activity,
                                    { turn, prompt, startedAt: Date.now(), tools: [] },
                                ],
                            }));
                        }

                        if (step.kind !== 'pause') {
                            setState((prev) => ({ ...withLine(prev, WORKING), thinking: true }));
                        }

                        stream(turnCount.current, (handlers, signal) =>
                            carryOnTurn({
                                conversationId: conversation,
                                first: step,
                                handlers,
                                signal,
                                since: () => readSince(messagesRef.current),
                                onRead: takeRead,
                            }),
                        );
                    }
                }

                drainRef.current();
            });
    }, [stream, takeRead]);

    const reset = useCallback(() => {
        // Ask the harness to stop (closing the fetch reaches it late, or
        // not at all, through the proxy), then leave the old request and
        // its queue behind on a fresh chain.
        if (inFlightRef.current > 0 && sessionRef.current) {
            void cancelTurn(sessionRef.current);
        }

        abortRef.current?.abort();
        generationRef.current += 1;
        chainRef.current = Promise.resolve();
        inFlightRef.current = 0;
        queueRef.current = [];
        sessionRef.current = null;
        revisionsRef.current.clear();
        canvasRef.current = null;
        setCanvas(null);
        legacyRef.current = null;
        setLocalCards(NO_IDS);
        askedRef.current.clear();
        canvasEditsRef.current?.reset();
        turnCount.current = 0;
        messagesRef.current = [];
        pendingInterruptRef.current = null;
        turnPlanRef.current = null;
        recapRef.current = null;
        setState({
            messages: [],
            widgets: [],
            queued: [],
            activity: [],
            ...NO_LINE,
            thinking: false,
            clarify: null,
            plan: null,
        });
    }, []);

    const hydrate = useCallback(
        (saved: ChatSnapshot) => {
            // As in reset(): ask the harness to stop, abandon the old chain and
            // queue.
            if (inFlightRef.current > 0 && sessionRef.current) {
                void cancelTurn(sessionRef.current);
            }

            abortRef.current?.abort();
            generationRef.current += 1;
            chainRef.current = Promise.resolve();
            inFlightRef.current = 0;
            queueRef.current = [];
            pendingInterruptRef.current = null;
            turnPlanRef.current = null;
            sessionRef.current = saved.sessionId;
            revisionsRef.current = restoreCardRevisions(saved);
            canvasRef.current = restoreCanvas(saved);
            setCanvas(canvasRef.current ?? saved.canvas ?? null);
            startLegacy(saved.sessionId, canvasRef.current);
            setLocalCards(NO_IDS);
            askedRef.current.clear();
            canvasEditsRef.current?.reset();
            recapRef.current = saved.sessionId ? null : buildRecap(saved.messages);
            turnCount.current = saved.turnCount;
            // Set at once, since reattach() reads it before the next render.
            messagesRef.current = restoredMessages(saved);
            setState({
                messages: messagesRef.current,
                widgets: saved.widgets,
                queued: [],
                activity: restoreActivity(saved.activity),
                ...NO_LINE,
                thinking: false,
                clarify: null,
                plan: null,
            });
        },
        [startLegacy],
    );

    const snapshot = useCallback(
        () => ({
            sessionId: sessionRef.current,
            componentRefs: Array.from(revisionsRef.current, ([component_id, revision]) => ({
                component_id,
                revision,
            })),
            turnCount: turnCount.current,
            canvas: canvasRef.current,
        }),
        [],
    );

    return {
        ...state,
        localCards,
        syncCanvas,
        canvas,
        send,
        unqueue,
        answerClarify,
        skipClarify,
        respondPlan,
        switchChoice,
        applyChoice,
        stop,
        reset,
        hydrate,
        reattach,
        snapshot,
    };
};
