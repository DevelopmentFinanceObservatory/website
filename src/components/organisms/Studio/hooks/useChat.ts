'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
    endTurnActivity,
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
import { restoreCanvas, takeManifest, type CanvasBaseline } from '@/lib/studio/composition';
import { plainTextFromNote } from '@/lib/studio/note';
import {
    approveReply,
    approvedFromFrame,
    planFromFrame,
    refusedSwitch,
    stalePlan,
    startSwitch,
    switchEnded,
    switchReply,
    optionLabel,
    withApprovedPlan,
    type ApprovedPlan,
    type PlanState,
} from '@/lib/studio/plan';
import { withAnswer } from '@/lib/studio/transcript';
import {
    cancelTurn,
    fetchComponentRevision,
    mutateComposition,
    runApplyChoice,
    runInterrupt,
    runTurn,
    STOP_GRACE_MS,
    type StreamHandlers,
    type StreamRefusal,
} from '@/lib/studio/studioClient';
import { reviseWidget, widgetFromComponent } from '@/lib/studio/widgets';
import type {
    ApplyChoiceSuggestion,
    CompositionManifest,
    InterruptResponse,
    MutationOperation,
    Seed,
    StudioFrame,
} from '@/lib/studio/wire';
import { uuid } from '@/lib/uuid';
import type { CardRef, Widget } from '@/lib/chat/widgets';

// A user message sent from a card's "Ask follow up" keeps that card's title,
// so the transcript shows what the question was about. `answer` marks the
// user's answer to a paused turn (a clarify choice or text, a plan
// amendment): shown like any user message, but part of the turn it answers.
// A bot turn's `followups` are prompts a click sends as the next message,
// and its `chips` switch a scope choice of the answer's readings. `plan` is
// the plan the user approved for this answer, saved with the transcript so
// a reopened conversation can still show it.
export type ChatMessage =
    | { role: 'user'; text: string; card?: { title: string }; answer?: true }
    | {
          role: 'bot';
          text: string;
          followups?: string[];
          chips?: ApplyChoiceSuggestion[];
          plan?: ApprovedPlan;
      };

// A widget stamped with the send() turn it arrived in — the canvas keeps
// only the latest turn's widgets plus whatever the user pinned.
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
// clicked `apply_choice` chip waits the same way, under its label.
export type QueuedMessage = {
    id: string;
    text: string;
    card?: CardTarget;
    seeds?: Seed[];
    chip?: ApplyChoiceSuggestion;
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
    turnCount: number;
    // The harness canvas this conversation last saw (see useChat's
    // canvasRef). Optional: saves from before this didn't have it.
    canvas?: CanvasBaseline | null;
    pinnedIds?: string[];
    removedIds?: string[];
    graceIds?: string[];
    graceTurn?: number;
};

const NO_LINE = { status: null, statusDetail: null, statusSince: null, stalled: false } as const;

// The state with the chat line set; `statusSince` moves only when the label
// changes.
const withLine = (prev: ChatState, status: string, statusDetail: string | null = null) => ({
    ...prev,
    status,
    statusDetail,
    statusSince: status === prev.status ? prev.statusSince : Date.now(),
});

// A turn's end on screen, however it ended: its Activity entry closes and
// the chat line clears.
const endTurn = (prev: ChatState, turn: number, open?: 'skipped' | 'failed'): ChatState => ({
    ...prev,
    activity: endTurnActivity(prev.activity, turn, open),
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
    // Stops the running stream's turn (set while a request runs).
    const haltRef = useRef<(() => void) | null>(null);
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
    const recapRef = useRef<string | null>(
        initial && !initial.sessionId ? buildRecap(initial.messages) : null,
    );
    // The pending pause's addressing (interrupt_id) with, for elicitations,
    // the normalized clarify that answerClarify() builds its reply and
    // status note from, and that skipClarify() reads `skippable` from.
    // For plans, the plan that switchChoice() checks a pick against.
    const pendingInterruptRef = useRef<{
        interruptId: string;
        clarify?: Clarify;
        plan?: PlanState;
    } | null>(null);
    // The latest plan this turn offered, or is waiting on a switch of: a
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
    // The harness's latest canvas manifest as this page saw it, to tell
    // which cards a newer one took off (the agent removing cards). Saved
    // with the conversation, so a reopened one keeps it.
    const canvasRef = useRef<CanvasBaseline | null>(restoreCanvas(initial));
    // Cards the agent took off, queued until the canvas takes them, so two
    // manifests in one batch both count.
    const agentRemovedRef = useRef<string[]>([]);
    const [agentRemovals, setAgentRemovals] = useState(0);
    // Every manifest goes through here: stream frames, `done`, and the
    // responses to the user's own edits. A late, older one is ignored.
    // Cards this page reported as hidden (see reportHidden), until a
    // manifest has them back on the canvas.
    const hiddenSentRef = useRef(new Set<string>());
    const [canvasVersion, setCanvasVersion] = useState(0);
    const canvasEditsRef = useRef<ReturnType<typeof createCanvasEdits> | null>(null);
    const applyManifest = useCallback((manifest: CompositionManifest) => {
        const taken = takeManifest(canvasRef.current, manifest);

        if (!taken) {
            return;
        }

        canvasRef.current = taken.baseline;
        taken.baseline.ids.forEach((id) => hiddenSentRef.current.delete(id));
        setCanvasVersion((version) => version + 1);

        const removed = taken.removed.filter((id) => !canvasEditsRef.current?.isOwnRemoval(id));

        if (removed.length > 0) {
            agentRemovedRef.current.push(...removed);
            setAgentRemovals((count) => count + 1);
        }
    }, []);
    const takeAgentRemoved = useCallback(() => agentRemovedRef.current.splice(0), []);
    // A canvas edit the user made (Remove, Pin, Add), sent to the harness so
    // the canvas the agent reads matches this one. Nothing to send before
    // the conversation has a session.
    // Edits go one after another, so a Remove then an Add land in order; a
    // response for a conversation since left is dropped.
    const syncCanvas = useCallback(
        (operations: MutationOperation[]) => {
            const session = sessionRef.current;

            if (!session) {
                return;
            }

            canvasEditsRef.current ??= createCanvasEdits({
                mutate: mutateComposition,
                onManifest: applyManifest,
                onFailure: (failedOperations, error) => {
                    failedOperations.forEach((op) => {
                        if (
                            op.op === 'remove' &&
                            !canvasEditsRef.current?.isOwnRemoval(op.component_id)
                        ) {
                            hiddenSentRef.current.delete(op.component_id);
                        }
                    });
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
    // Cards a new turn hid on screen (unpinned, from an earlier turn) leave
    // the harness canvas too, so the agent knows they are hidden; Add in
    // the chat brings one back. Each is sent once, and only while the
    // harness canvas still holds it.
    const reportHidden = useCallback(
        (hidden: readonly string[]) => {
            const onCanvas = new Set(canvasRef.current?.ids ?? []);
            const fresh = hidden.filter((id) => onCanvas.has(id) && !hiddenSentRef.current.has(id));

            if (!sessionRef.current || fresh.length === 0) {
                return;
            }

            fresh.forEach((id) => hiddenSentRef.current.add(id));
            syncCanvas(fresh.map((id) => ({ op: 'remove', component_id: id })));
        },
        [syncCanvas],
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

    // `onRefusal` answers an HTTP refusal of the request (see StreamHandlers)
    // and returns true when it has dealt with it; any other refusal ends the
    // turn as an error. `switching` is the waiting card of a plan switch.
    // Stop on a switch asks the harness to cancel and reads on, since the
    // harness re-offers the unchanged plan. A switch stream that ends
    // without a fresh plan or a refusal replacing the card (it closed,
    // broke, sent an error, or was stopped) settles the card once, read-only
    // (switchEnded), closes the turn's Activity entry, and leaves the reply
    // alone.
    const stream = useCallback(
        (
            turn: number,
            start: (handlers: StreamHandlers, signal: AbortSignal) => Promise<void>,
            onRefusal?: (refusal: StreamRefusal) => boolean,
            switching?: PlanState,
        ) => {
            const controller = new AbortController();
            const generation = generationRef.current;
            // Set by Stop. The stream is read to its end and its frames are
            // ignored, except on a switch, whose stream may re-offer the plan.
            let stopped = false;
            // A switch's: the user stopped it, and the error frame's detail.
            let switchStopped = false;
            let switchError: string | null = null;
            let stopGrace: ReturnType<typeof setTimeout> | null = null;
            // Runs from the request's start until the stream ends or pauses.
            const stall = createStallWatch((stalled) => {
                if (generationRef.current === generation && !stopped) {
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

            const handle = (frame: StudioFrame) => {
                // A stream that reset/hydrate walked away from, or that the
                // user stopped, must not write into the conversation.
                if (generationRef.current !== generation || stopped) {
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
                                setState((prev) => withLine(prev, label));
                            }

                            break;
                        }

                        // Deltas after the steps are the answer.
                        grace.cancel();
                        setState((prev) =>
                            prev.status === 'Writing the answer'
                                ? prev
                                : withLine(prev, 'Writing the answer'),
                        );
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
                            setState((prev) => withLine(prev, line.label, line.detail));
                        }

                        // One Activity line per step_id. A later frame for the
                        // same step closes or updates the line it opened.
                        patchActivity((entry) => {
                            const existing = entry.tools.find((tool) => tool.id === frame.step_id);
                            const patch = {
                                summary: frame.detail ?? undefined,
                                durationMs: frame.duration_ms ?? undefined,
                                widgetId: frame.produced?.component_id,
                                state: frame.status,
                            };

                            if (!existing) {
                                return {
                                    ...entry,
                                    tools: [
                                        ...entry.tools,
                                        {
                                            id: frame.step_id,
                                            name: frame.label,
                                            args: frame.tool ?? undefined,
                                            startedAt: Date.now(),
                                            ...patch,
                                        },
                                    ],
                                };
                            }

                            return {
                                ...entry,
                                tools: entry.tools.map((tool) =>
                                    tool.id === frame.step_id ? { ...tool, ...patch } : tool,
                                ),
                            };
                        });

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
                        break;
                    }
                    case 'plan.approved': {
                        // Comes first on the approve's stream, so the reply it
                        // writes into is the transcript's last message.
                        const approved = approvedFromFrame(frame);

                        setState((prev) => ({
                            ...prev,
                            messages: withApprovedPlan(prev.messages, approved),
                        }));
                        break;
                    }
                    case 'plan.versioned':
                        // Transient bookkeeping — the fresh plan.proposed that
                        // follows re-renders the card.
                        break;
                    case 'elicitation.request': {
                        const clarify = clarifyFromFrame(frame);

                        stall.stop();
                        grace.cancel();
                        pendingInterruptRef.current = {
                            interruptId: clarify.interruptId,
                            clarify,
                        };
                        setState((prev) => ({
                            ...prev,
                            ...NO_LINE,
                            thinking: false,
                            clarify,
                        }));
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

                        if (switching) {
                            switchError = frame.error.detail;
                            break;
                        }

                        setState((prev) => {
                            const messages = prev.messages.slice();
                            const last = messages[messages.length - 1];

                            if (last?.role === 'bot' && !last.text) {
                                messages[messages.length - 1] = {
                                    ...last,
                                    text: `_${frame.error.detail}_`,
                                };
                            }

                            return endTurn({ ...prev, messages }, turn, 'failed');
                        });
                        break;
                    case 'done':
                        stall.stop();
                        grace.cancel();

                        if (frame.composition) {
                            applyManifest(frame.composition);
                        }

                        if (!switching) {
                            setState((prev) => endTurn(prev, turn));
                        }

                        break;
                }
            };

            // Stop ends the turn on screen at once and keeps what arrived (an
            // empty answer takes the preamble, else a note). The stream is
            // read until the harness ends it, so the request counts as in
            // flight, and queued sends wait, until the conversation is free.
            // A switch's Stop keeps its frames: the plan the harness re-offers
            // makes the card live again.
            const halt = () => {
                if (stopped || switchStopped || generationRef.current !== generation) {
                    return;
                }

                stopGrace = setTimeout(() => controller.abort(), STOP_GRACE_MS);

                if (switching) {
                    switchStopped = true;
                    setState((prev) => withLine(prev, 'Stopping'));

                    return;
                }

                stopped = true;
                stall.stop();
                grace.cancel();

                setState((prev) => {
                    const messages = prev.messages.slice();
                    const last = messages[messages.length - 1];

                    if (last?.role === 'bot' && !last.text) {
                        messages[messages.length - 1] = { ...last, text: stoppedReply(preamble) };
                    }

                    return endTurn({ ...prev, messages }, turn, 'skipped');
                });
            };

            // A refusal of a stream that reset/hydrate walked away from, or
            // that the user stopped, is dropped, as handle() drops frames.
            const refuse = (refusal: StreamRefusal): boolean =>
                generationRef.current !== generation || stopped || (onRefusal?.(refusal) ?? false);

            // Queue behind whatever is in flight. The controller is published
            // when the request actually starts, so reset aborts the fetch
            // that is running, not one still waiting here.
            let failed = false;

            inFlightRef.current += 1;
            chainRef.current = chainRef.current
                .then(() => {
                    if (generationRef.current !== generation) {
                        return;
                    }

                    abortRef.current = controller;
                    haltRef.current = halt;
                    stall.beat();

                    return start(
                        { onFrame: handle, onKeepAlive: stall.beat, onRefusal: refuse },
                        controller.signal,
                    ).catch((error: Error) => {
                        if (error.name !== 'AbortError' && generationRef.current === generation) {
                            failed = true;

                            if (!stopped && !switching) {
                                setState((prev) => endTurn(prev, turn, 'failed'));
                            }
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

                    // The waiting card is still up, so no plan or refusal
                    // replaced it: the turn ended, and the pause with it. Its
                    // Activity entry closes as any ended turn's does.
                    if (switching && pendingInterruptRef.current?.plan === switching) {
                        const ending = { detail: switchError, stopped: switchStopped };
                        const open = switchStopped
                            ? 'skipped'
                            : switchError !== null || failed
                              ? 'failed'
                              : undefined;

                        pendingInterruptRef.current = null;
                        turnPlanRef.current = null;
                        setState((prev) => {
                            const ended = switchEnded(prev, switching, ending);

                            return ended === prev
                                ? prev
                                : {
                                      ...ended,
                                      activity: endTurnActivity(ended.activity, turn, open),
                                  };
                        });
                    }

                    inFlightRef.current -= 1;

                    // A stream that broke mid-way says nothing about whether
                    // the harness has let go of the conversation, so the
                    // queue holds until the user acts again.
                    if (!failed) {
                        drainRef.current();
                    }
                });
        },
        [applyManifest, offerPlan, patchWidget],
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

    const send = useCallback(
        (message: string, card?: CardTarget, seeds?: Seed[]) => {
            const text = message.trim();

            if (!text || holdTurn({ text, card, seeds })) {
                return;
            }

            const { turn, conversation } = startTurn(
                { role: 'user', text, ...(card?.title && { card: { title: card.title } }) },
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
            stream(turn, (handlers, signal) =>
                runTurn(conversation, recap ? `${recap}${text}` : text, handlers, signal, {
                    ...(componentRef && { component_ref: componentRef }),
                    ...(seeds && { seed_spec: seeds }),
                }),
            );
        },
        [holdTurn, startTurn, stream],
    );

    const unqueue = useCallback((id: string) => {
        queueRef.current = queueRef.current.filter((item) => item.id !== id);
        setState((prev) => ({ ...prev, queued: prev.queued.filter((item) => item.id !== id) }));
    }, []);

    // Continue a paused turn on /interrupt — shared by clarify answers, the
    // skip button and the plan actions. `answer` is what the user chose or
    // wrote, which enters the transcript.
    // A stale plan answer (an approve sent from an out-of-date card) is
    // refused with the current card, which replaces it to be answered again.
    const resume = useCallback(
        (
            reply: ClarifyReply | Pick<InterruptResponse, 'decision' | 'plan_revision'>,
            note: string | null,
            answer?: string,
        ) => {
            const conversation = sessionRef.current;
            const pending = pendingInterruptRef.current;

            pendingInterruptRef.current = null;

            setState((prev) => ({
                // The decision shows on the status line; the user's answer
                // also stays in the transcript, once (a repeated click finds
                // no pause left to answer).
                ...withLine(prev, note ? plainTextFromNote(note) : 'Thinking'),
                messages: answer && pending ? withAnswer(prev.messages, answer) : prev.messages,
                thinking: true,
                clarify: null,
                plan: null,
            }));

            if (!conversation || !pending) {
                return;
            }

            stream(
                turnCount.current,
                (handlers, signal) =>
                    runInterrupt(conversation, pending.interruptId, reply, handlers, signal),
                (refusal) => {
                    const current = stalePlan(refusal, pending?.plan);

                    if (current) {
                        offerPlan(current);
                    }

                    return current !== null;
                },
            );
        },
        [offerPlan, stream],
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

    // A scope decision's option, picked on the plan card. The card stays,
    // its controls waiting, until the harness re-offers the plan with what
    // changed, or with `switch_failed` saying why it did not apply. A
    // refusal keeps the card and the pause and says why on the choice's row
    // (refusedSwitch); a stale one (the plan moved on elsewhere) is answered
    // with the current card. A stream that ends without either leaves the
    // card read-only (see stream()).
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

            // The pause stays pending with the waiting plan. switchReply
            // refuses a second pick while it waits, and the plan the harness
            // re-offers is compared against it.
            const waiting = startSwitch(plan, { choiceId, optionId });

            pendingInterruptRef.current = { interruptId: pending.interruptId, plan: waiting };
            turnPlanRef.current = waiting;
            setState((prev) => ({
                ...withLine(prev, label ? `Switching to ${label}` : 'Switching'),
                thinking: true,
                plan: waiting,
            }));

            stream(
                turnCount.current,
                (handlers, signal) =>
                    runInterrupt(conversation, pending.interruptId, reply, handlers, signal),
                (refusal) => {
                    offerPlan(refusedSwitch(waiting, refusal));

                    return true;
                },
                waiting,
            );
        },
        [offerPlan, stream],
    );

    // A clicked `apply_choice` chip runs a turn with the chip's choice and no
    // message, which the transcript shows as the chip's label. A click while
    // a request is in flight waits in the queue, as a typed message does. A
    // chip the harness refuses (the answer moved on, or Search cannot serve
    // the option) leaves the reply saying why, with the answer's other chips.
    const applyChoice = useCallback(
        (chip: ApplyChoiceSuggestion) => {
            if (holdTurn({ text: chip.label, chip })) {
                return;
            }

            const { turn, conversation } = startTurn(
                { role: 'user', text: chip.label },
                `Switching to ${chip.label}`,
            );

            stream(
                turn,
                (handlers, signal) => runApplyChoice(conversation, chip, handlers, signal),
                (refusal) => {
                    const detail = chipRefusalDetail(refusal);

                    if (detail === null) {
                        return false;
                    }

                    setState((prev) =>
                        endTurn(
                            { ...prev, messages: withRefusedChip(prev.messages, chip, detail) },
                            turn,
                            'failed',
                        ),
                    );

                    return true;
                },
            );
        },
        [holdTurn, startTurn, stream],
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
                send(next.text, next.card, next.seeds);
            }
        };
    }, [applyChoice, send]);

    // The Stop control: ask the harness to cancel and end the running turn
    // (see `halt` in stream()). Requests queued behind it also wait for the
    // cancel request to answer.
    const stop = useCallback(() => {
        const conversation = sessionRef.current;
        const halt = haltRef.current;

        if (!conversation || !halt) {
            return;
        }

        const cancelled = cancelTurn(conversation);

        chainRef.current = chainRef.current.then(() => cancelled);
        halt();
    }, []);

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
        agentRemovedRef.current = [];
        hiddenSentRef.current.clear();
        canvasEditsRef.current?.reset();
        turnCount.current = 0;
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

    const hydrate = useCallback((saved: ChatSnapshot) => {
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
        agentRemovedRef.current = [];
        hiddenSentRef.current.clear();
        canvasEditsRef.current?.reset();
        recapRef.current = saved.sessionId ? null : buildRecap(saved.messages);
        turnCount.current = saved.turnCount;
        setState({
            messages: restoredMessages(saved),
            widgets: saved.widgets,
            queued: [],
            activity: restoreActivity(saved.activity),
            ...NO_LINE,
            thinking: false,
            clarify: null,
            plan: null,
        });
    }, []);

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
        agentRemovals,
        takeAgentRemoved,
        syncCanvas,
        reportHidden,
        canvasVersion,
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
        snapshot,
    };
};
