'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { clarifyFromFrame, type Clarify } from '@/lib/studio/clarify';
import { plainTextFromNote } from '@/lib/studio/note';
import {
    cancelTurn,
    fetchComponentRevision,
    runInterrupt,
    runTurn,
} from '@/lib/studio/studioClient';
import { reviseWidget, widgetFromComponent } from '@/lib/studio/widgets';
import type { PlanDecision, PlanStep, Seed, StudioFrame } from '@/lib/studio/wire';
import { uuid } from '@/lib/uuid';
import type { Widget } from '@/lib/chat/widgets';

export type ChatMessage =
    { role: 'user'; text: string } | { role: 'bot'; text: string; followups?: string[] };

// A widget stamped with the send() turn it arrived in — the canvas keeps
// only the latest turn's widgets plus whatever the user pinned.
export type TurnWidget = Widget & { turn: number };

// One tool the agent ran during a turn — the Activity view's log line.
export type ActivityTool = {
    id: string;
    name: string;
    // The tool's arguments, as sent (query, countries, indicators…).
    args: unknown;
    // The tool's own one-line result text (e.g. "10 indicator(s) found…").
    summary?: string;
    startedAt: number;
    durationMs?: number;
    // Set when the tool put a card on the canvas.
    widgetId?: string;
};

// One turn's trace: the user's prompt, the agent's thinking (markdown, bold
// section headers) and the tools it ran, in order.
export type ActivityEntry = {
    turn: number;
    prompt: string;
    startedAt: number;
    endedAt?: number;
    thoughts: string;
    tools: ActivityTool[];
};

// A plan awaiting the user's approve/amend/reject (the harness's
// `plan.proposed` pause).
export type PlanState = {
    title: string;
    steps: PlanStep[];
    decisions: PlanDecision[];
    version: number;
    actions: ('approve' | 'amend' | 'reject')[];
    interruptId: string;
};

/**
 * A card-scoped turn's target: which card the question is about, and whether
 * the agent should answer about it (`follow_up`) or revise it (`edit`). Sent
 * as the turn's `component_ref`.
 */
export type CardTarget = {
    componentId: string;
    intent: 'follow_up' | 'edit';
};

// A message sent while a request was in flight: it waits for the
// conversation to be free and enters the transcript when it is sent.
export type QueuedMessage = {
    id: string;
    text: string;
    card?: CardTarget;
    seeds?: Seed[];
};

export type ChatState = {
    messages: ChatMessage[];
    widgets: TurnWidget[];
    // Messages waiting behind the in-flight request, in send order.
    queued: QueuedMessage[];
    // The Activity view's data — one entry per turn (an answered pause
    // continues the same entry).
    activity: ActivityEntry[];
    // Non-null while a turn is streaming: the current human-readable status.
    status: string | null;
    thinking: boolean;
    clarify: Clarify | null;
    plan: PlanState | null;
};

// A saved conversation's chat half — what hydrate() restores and what a
// shared/forked copy starts from.
export type ChatSnapshot = {
    sessionId: string | null;
    messages: ChatMessage[];
    widgets: TurnWidget[];
    activity?: ActivityEntry[];
    turnCount: number;
};

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
        messages: initial?.messages ?? [],
        widgets: initial?.widgets ?? [],
        queued: [],
        activity: initial?.activity ?? [],
        status: null,
        thinking: false,
        clarify: null,
        plan: null,
    }));
    // The conversation id doubles as the snapshot's sessionId, so saves and
    // shares reopen the same server-side conversation.
    const sessionRef = useRef<string | null>(initial?.sessionId ?? null);
    const abortRef = useRef<AbortController | null>(null);
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
    // its options (chooseOption() reads a chosen id's label from these for
    // the transcript note) and whether free text / skip are allowed.
    const pendingInterruptRef = useRef<{
        interruptId: string;
        options?: Clarify['options'];
        allowFreeText?: boolean;
        skippable?: boolean;
    } | null>(null);
    // The card an in-flight `edit` turn is changing. The harness answers an
    // edit with a REPLACEMENT component under a new id (and drops the old one
    // from its composition) rather than a component.revised, so the canvas has
    // to retire the original — otherwise an edit leaves two cards behind.
    const editingRef = useRef<string | null>(null);
    // component_id → the revision we're currently holding. A card-scoped turn
    // has to address both (the contract rejects a stale revision), and the
    // number only ever arrives on the frames, never on the widget.
    const revisionsRef = useRef(new Map<string, number>());
    // Swap one widget in place, wherever it sits in the list.
    const patchWidget = useCallback((id: string, fn: (widget: TurnWidget) => TurnWidget) => {
        setState((prev) => ({
            ...prev,
            widgets: prev.widgets.map((widget) => (widget.id === id ? fn(widget) : widget)),
        }));
    }, []);

    const stream = useCallback(
        (
            turn: number,
            start: (handle: (frame: StudioFrame) => void, signal: AbortSignal) => Promise<void>,
        ) => {
            const controller = new AbortController();
            const generation = generationRef.current;

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
            // growth of …") — running commentary that belongs on the status
            // line, not in the transcript. Deltas after the steps are the
            // actual answer streaming in.
            let sawStep = false;
            let preamble = '';

            const handle = (frame: StudioFrame) => {
                // A stream reset/hydrate walked away from must not write
                // into the conversation that replaced it.
                if (generationRef.current !== generation) {
                    return;
                }

                switch (frame.event) {
                    case 'message.delta':
                        if (!sawStep) {
                            preamble += frame.text;
                            const label = preamble.trim();

                            if (label) {
                                setState((prev) => ({ ...prev, status: label }));
                            }

                            break;
                        }

                        // Narration streaming = the run's closing beat.
                        setState((prev) =>
                            prev.status === 'Writing the answer'
                                ? prev
                                : { ...prev, status: 'Writing the answer' },
                        );
                        patchBot((last) => ({ ...last, text: last.text + frame.text }));
                        break;
                    case 'message.complete':
                        // The authoritative text replaces the deltas. Pause
                        // decisions ("Plan approved.") already had their beat
                        // on the status line — they don't enter the record.
                        patchBot((last) => ({ ...last, text: frame.text }));
                        break;
                    case 'activity.step': {
                        sawStep = true;

                        // The real harness reports steps as they COMPLETE (it
                        // rarely streams 'running'), so every step frame moves
                        // the status line — the label is the human phrasing
                        // ("Resolve the question…", "Fetch the data").
                        setState((prev) => ({ ...prev, status: frame.label }));

                        // One Activity line per step_id: a later frame for the
                        // same step closes/updates the line it opened.
                        patchActivity((entry) => {
                            const existing = entry.tools.find((tool) => tool.id === frame.step_id);
                            const patch = {
                                summary: frame.detail ?? undefined,
                                durationMs: frame.duration_ms ?? undefined,
                                widgetId: frame.produced?.component_id,
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
                    case 'plan.proposed':
                        pendingInterruptRef.current = { interruptId: frame.interrupt_id };
                        setState((prev) => ({
                            ...prev,
                            status: null,
                            thinking: false,
                            plan: {
                                title: frame.title,
                                steps: frame.steps,
                                decisions: frame.decisions ?? [],
                                version: frame.version,
                                actions: frame.actions,
                                interruptId: frame.interrupt_id,
                            },
                        }));
                        break;
                    case 'plan.versioned':
                        // Transient bookkeeping — the fresh plan.proposed that
                        // follows re-renders the card.
                        break;
                    case 'elicitation.request': {
                        const clarify = clarifyFromFrame(frame);

                        pendingInterruptRef.current = {
                            interruptId: clarify.interruptId,
                            options: clarify.options,
                            allowFreeText: clarify.allowFreeText,
                            skippable: clarify.skippable,
                        };
                        setState((prev) => ({
                            ...prev,
                            status: null,
                            thinking: false,
                            clarify,
                        }));
                        break;
                    }
                    case 'suggestions':
                        if (frame.items.length > 0) {
                            patchBot((last) => ({
                                ...last,
                                followups: frame.items.map((item) => item.prompt),
                            }));
                        }

                        break;
                    case 'composition.updated':
                        // The whiteboard keeps its own layout for now; the
                        // manifest becomes interesting once canvas state moves
                        // server-side.
                        break;
                    case 'error':
                        setState((prev) => {
                            const messages = prev.messages.slice();
                            const last = messages[messages.length - 1];

                            if (last?.role === 'bot' && !last.text) {
                                messages[messages.length - 1] = {
                                    ...last,
                                    text: `_${frame.error.detail}_`,
                                };
                            }

                            return { ...prev, messages, status: null, thinking: false };
                        });
                        break;
                    case 'done':
                        setState((prev) => ({
                            ...prev,
                            activity: prev.activity.map((entry) =>
                                entry.turn === turn ? { ...entry, endedAt: Date.now() } : entry,
                            ),
                            status: null,
                            thinking: false,
                        }));
                        break;
                }
            };

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

                    return start(handle, controller.signal).catch((error: Error) => {
                        if (error.name !== 'AbortError' && generationRef.current === generation) {
                            failed = true;
                            setState((prev) => ({ ...prev, status: null, thinking: false }));
                        }
                    });
                })
                .finally(() => {
                    if (generationRef.current !== generation) {
                        return;
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
        [patchWidget],
    );

    const send = useCallback(
        (message: string, card?: CardTarget, seeds?: Seed[]) => {
            const text = message.trim();

            if (!text) {
                return;
            }

            // While a request is in flight the message waits its turn; the
            // settle handler sends it (then the next) once the conversation
            // is free. During a pause it also waits behind messages already
            // held, so it cannot overtake them.
            if (
                inFlightRef.current > 0 ||
                (queueRef.current.length > 0 && pendingInterruptRef.current !== null)
            ) {
                const item: QueuedMessage = { id: uuid(), text, card, seeds };

                queueRef.current.push(item);
                setState((prev) => ({ ...prev, queued: [...prev.queued, item] }));

                return;
            }

            if (!sessionRef.current) {
                sessionRef.current = uuid();
            }

            turnCount.current += 1;
            const turn = turnCount.current;

            // A new turn on a paused conversation abandons the pause (the
            // contract's rule) — drop any pending plan/clarify card with it.
            pendingInterruptRef.current = null;

            setState((prev) => ({
                ...prev,
                messages: [...prev.messages, { role: 'user', text }, { role: 'bot', text: '' }],
                activity: [
                    ...prev.activity,
                    { turn, prompt: text, startedAt: Date.now(), thoughts: '', tools: [] },
                ],
                status: 'Resolving the question',
                thinking: true,
                clarify: null,
                plan: null,
            }));

            const conversation = sessionRef.current;
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
            stream(turn, (handle, signal) =>
                runTurn(conversation, recap ? `${recap}${text}` : text, handle, signal, {
                    ...(componentRef && { component_ref: componentRef }),
                    ...(seeds && { seed_spec: seeds }),
                }),
            );
        },
        [stream],
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
            send(next.text, next.card, next.seeds);
        };
    }, [send]);

    const unqueue = useCallback((id: string) => {
        queueRef.current = queueRef.current.filter((item) => item.id !== id);
        setState((prev) => ({ ...prev, queued: prev.queued.filter((item) => item.id !== id) }));
    }, []);

    // Continue a paused turn on /interrupt — shared by clarify answers, the
    // skip button and the plan actions.
    const resume = useCallback(
        (
            decision: 'approve' | 'amend' | 'reject' | 'answer' | 'skip',
            payload: string | undefined,
            note: string | null,
        ) => {
            const conversation = sessionRef.current;
            const pending = pendingInterruptRef.current;

            pendingInterruptRef.current = null;

            setState((prev) => ({
                ...prev,
                // The decision shows as the live status beat; its permanent
                // record arrives with message.complete (the notes prefix).
                status: note ? plainTextFromNote(note) : 'Thinking',
                thinking: true,
                clarify: null,
                plan: null,
            }));

            if (!conversation || !pending) {
                return;
            }

            stream(turnCount.current, (handle, signal) =>
                runInterrupt(conversation, pending.interruptId, decision, payload, handle, signal),
            );
        },
        [stream],
    );

    // Answer the pending clarify with a chosen option: resumes with its id,
    // the transcript note names its label.
    const chooseOption = useCallback(
        (id: string) => {
            const pending = pendingInterruptRef.current;
            const label = pending?.options?.find((option) => option.id === id)?.label ?? id;

            resume('answer', id, `_You chose: ${label}_`);
        },
        [resume],
    );

    // Answer the pending clarify with free text: resumes with the trimmed
    // text, which the transcript note also shows.
    const answerText = useCallback(
        (text: string) => {
            const trimmed = text.trim();

            resume('answer', trimmed, `_${trimmed}_`);
        },
        [resume],
    );

    // Skip: an explicit decision when the elicitation permits one (the agent
    // continues on its default); otherwise just dismiss the picker — the
    // turn stays paused and the next message abandons it.
    const skipClarify = useCallback(() => {
        const pending = pendingInterruptRef.current;

        if (pending?.skippable) {
            resume('skip', undefined, '_Skipped._');

            return;
        }

        pendingInterruptRef.current = null;
        setState((prev) => ({ ...prev, clarify: null }));
        // Dismissing the picker lifts the hold on the queue.
        drainRef.current();
    }, [resume]);

    // The plan card's three buttons. An amendment carries the user's change
    // request; the stream then proposes a fresh plan version.
    const respondPlan = useCallback(
        (decision: 'approve' | 'amend' | 'reject', payload?: string) => {
            const note =
                decision === 'approve'
                    ? '_Plan approved._'
                    : decision === 'reject'
                      ? '_Plan rejected._'
                      : `_Change requested: ${payload ?? ''}_`;

            resume(decision, decision === 'amend' ? payload : undefined, note);
        },
        [resume],
    );

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
        turnCount.current = 0;
        pendingInterruptRef.current = null;
        recapRef.current = null;
        setState({
            messages: [],
            widgets: [],
            queued: [],
            activity: [],
            status: null,
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
        sessionRef.current = saved.sessionId;
        recapRef.current = saved.sessionId ? null : buildRecap(saved.messages);
        turnCount.current = saved.turnCount;
        setState({
            messages: saved.messages,
            widgets: saved.widgets,
            queued: [],
            activity: saved.activity ?? [],
            status: null,
            thinking: false,
            clarify: null,
            plan: null,
        });
    }, []);

    const snapshot = useCallback(
        () => ({
            sessionId: sessionRef.current,
            turnCount: turnCount.current,
        }),
        [],
    );

    return {
        ...state,
        send,
        unqueue,
        chooseOption,
        answerText,
        skipClarify,
        respondPlan,
        reset,
        hydrate,
        snapshot,
    };
};
