'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    endTurnActivity,
    recordApproval,
    recordStep,
    restoreActivity,
    type ActivityEntry,
    type SavedActivityEntry,
} from '@/lib/studio/activity';
import { withTurnStamps } from '@/lib/studio/activityView';
import { restoreCardRevisions } from '@/lib/studio/cardDownload';
import { changeTurns, currentCard, replacementsOf } from '@/lib/studio/cardIdentity';
import { rowValues } from '@/lib/studio/changeNote';
import {
    type CardHistory,
    placeCard,
    recordOf,
    takenOver,
    withReplacedCard,
} from '@/lib/studio/cardReplace';
import {
    changeRefusalDetail,
    changeRefusalStale,
    changesHeld,
    type ChangePause,
    dropChangesForPause,
    retargetChange,
    type CardChangeRequest,
    type ChangeEdit,
    type DroppedChange,
} from '@/lib/studio/cardChange';
import {
    changeUnitText,
    retargetUnitChange,
    unitRefusalDetail,
    unitRefusalStale,
    withoutCardOffers,
    type CardUnitChange,
} from '@/lib/studio/cardUnit';
import {
    busyWaitLine,
    createStallWatch,
    createStepLine,
    createWorkingGrace,
    IDLE,
    preambleLine,
    stoppedReply,
    WORKING,
    type ChatLine,
} from '@/lib/studio/chatLine';
import {
    createCanvasEdits,
    refusedRemoves,
    shownCanvas,
    shownPins,
    withCardsSent,
    withCardsSettled,
    withPinsSent,
    withPinsSettled,
    type EditAgainst,
    type PendingCards,
    type PendingPins,
} from '@/lib/studio/canvasEdits';
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
    legacyHiddenCards,
    restoreCanvas,
    sessionLeftCards,
    takeManifest,
    withoutRemovedCards,
    type CanvasBaseline,
    type LegacyCanvas,
    type LegacyLocal,
} from '@/lib/studio/composition';
import {
    confirm,
    forgive,
    knownRevision,
    owe,
    owedIds,
    owedRemovalsOf,
    drainOwedRemovals,
    nextResend,
    owedRetryAfter,
    againstWhenSent,
    settle,
    type OwedRemoval,
    type ResendOutcome,
} from '@/lib/studio/owedRemovals';
import {
    approvalKeys,
    attachStep,
    cardTurns,
    isOpenTurn,
    carryOnTurn,
    mergeClosedTurns,
    recordedPromptText,
    owedNewQuestion,
    producedCards,
    readConversation,
    reconcileStoredCards,
    replacedCard,
    drawManifestCards,
    sendNewQuestion,
    storedCards,
    takeApproval,
    turnApprovalKeys,
    widgetFromRead,
    withMovedQuestion,
    withOwedQuestion,
    withQuestionOffered,
    withTurnApprovals,
} from '@/lib/studio/conversationState';
import { plainTextFromNote } from '@/lib/studio/note';
import {
    approveReply,
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
    isUnkeyedSave,
    keyUnkeyedSave,
    promptTurns,
    readSince,
    pageTurnReplyAt,
    withAnswer,
    offeredQuestionPageTurns,
    offeredQuestionTurn,
    withFollowup,
    withHarnessTurn,
    withNewQuestion,
    withOfferedQuestion,
    withReadPrompts,
    withRefundedPrompt,
    withReplyAt,
    withSessionLeft,
} from '@/lib/studio/transcript';
import {
    cancelTurn,
    cardChangesOf,
    CompositionRefusal,
    fetchComponentRevision,
    isNoBlock,
    isSessionGone,
    isSignInRequired,
    isStaleRevision,
    isStateRefusal,
    mutateComposition,
    runApplyChange,
    runApplyChoice,
    runApplyUnit,
    runInterrupt,
    runPlaceOptions,
    runTurn,
    STOP_GRACE_MS,
    SWITCH_STOP_GRACE_MS,
    watchAdmission,
    whileBusy,
    type PlaceOptionsRead,
    type StopAction,
    type StreamHandlers,
    type StreamRefusal,
} from '@/lib/studio/studioClient';
import { sessionLeftChat, sessionRecap } from '@/lib/studio/sessionLeft';
import { reviseWidget, widgetFromComponent } from '@/lib/studio/widgets';
import type {
    ApplyChoiceSuggestion,
    CompositionManifest,
    ConversationRead,
    InterruptResponse,
    MutationOperation,
    PromptSource,
    Seed,
    StoredCard,
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
// and keys the prompt and its reply to the harness's turns. A prompt's
// `turn` is the page turn it opened (`turnCount` when it joined the
// transcript), which numbers its cards, its Activity entry and its plan
// wherever the prompt sits (messageTurns).
// `fromNewQuestion` marks a prompt sent as the new question that harness
// turn handed back (`done`'s `new_question`), so it is sent once.
// `inherited` marks a message a fork copied from another conversation,
// whose turn keys belong to that conversation's session. `unkeyed` marks a
// prompt whose turn the harness's record does not name: one of a save from
// before prompts carried their turn (keyUnkeyedSave), or one a state read
// shows the harness never admitted (withReadPrompts). It keeps its text and
// numbers no harness turn. `edit` marks the prompt of a card change
// (applyUnit, applyChange), a turn that asks nothing new of the
// conversation, naming the card it changed, the row, and for a change of
// places the role.
// A bot turn's `newQuestion` is the new question its turn handed back that
// the page offers among its `followups` for the user to send
// (withOfferedQuestion).
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
          // On an answer to a clarifying question: the question it answered.
          asked?: string;
          refunded?: true;
          harnessTurn?: number;
          turn?: number;
          fromNewQuestion?: number;
          inherited?: true;
          unkeyed?: true;
          edit?: ChangeEdit;
      }
    | {
          role: 'bot';
          text: string;
          inherited?: true;
          followups?: string[];
          newQuestion?: string;
          chips?: ApplyChoiceSuggestion[];
          plan?: ApprovedPlan;
      };

// A widget stamped with the send() turn it arrived in. A save from before
// the harness manifest decided the canvas shows the latest turn's widgets
// plus whatever the user pinned (legacyCanvasWidgetsOf).
// `madeIn` is the turn of the question that made the first card of a
// replacement's chain, and `replaced` and `changedIn` the chain's ids and
// the card change turns that drew it (CardHistory), set when the card takes
// another's place (placeCard) and saved with it; a card that replaced none
// has none. Saves from before `replaced` and `changedIn` lack them.
export type TurnWidget = Widget & { turn: number; madeIn?: number } & CardHistory;

// A places read callers share: the read, how many callers wait on it, and
// the control that stops it once none does.
type PlaceRead = { read: Promise<PlaceOptionsRead>; callers: number; stop: AbortController };

// How long a card page waits for the places a role can change to before it
// says the list could not be loaded.
const PLACES_READ_MS = 10_000;

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
// clicked `apply_choice` chip waits the same way, under its label, and a
// card's change of unit, years or places under its bubble's words. A new question a harness turn
// handed back carries that turn's index (`fromNewQuestion`), which its
// prompt keeps, and `handedBack`, since it joined the queue without passing
// the page's prompt gate (admitHandedBack). A picked example keeps its
// `source` for the request that sends it.
export type QueuedMessage = {
    id: string;
    text: string;
    card?: CardTarget;
    seeds?: Seed[];
    source?: PromptSource;
    chip?: ApplyChoiceSuggestion;
    unit?: CardUnitChange;
    change?: CardChangeRequest;
    fromNewQuestion?: number;
    handedBack?: true;
};

export type ChatState = {
    messages: ChatMessage[];
    widgets: TurnWidget[];
    // Messages waiting behind the in-flight request, in send order.
    queued: QueuedMessage[];
    // Card changes the queue could not send, since the card they were asked
    // of was replaced by one that does not take them, or left the canvas.
    dropped: DroppedChange[];
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
    owedRemovals?: OwedRemoval[];
    pinnedIds?: string[];
    removedIds?: string[];
    graceIds?: string[];
    graceTurn?: number;
};

const NO_LOCAL: LegacyLocal = { shown: [], hidden: [] };

// The reply of a turn the proxy refused because a guest asked about a
// conversation an account owns (isSignInRequired).
const SIGN_IN_NOTE = '_Sign in to the account that owns this conversation to continue it._';

// The reply of a turn the harness refused because it holds no session for the
// conversation (isSessionGone). The next turn starts afresh with a recap.
const SESSION_GONE_NOTE =
    '_The server no longer holds this conversation. Send your message again to continue it._';

const NO_LINE = { status: null, statusDetail: null, statusSince: null, stalled: false } as const;
// How long the read after a stale resend of an owed removal may take before
// the drain leaves the card for the run (rereadCanvas).
const REREAD_TIMEOUT_MS = 15_000;

// The state with the chat line set; `statusSince` moves only when the label
// changes.
const withLine = (prev: ChatState, status: string, statusDetail: string | null = null) => ({
    ...prev,
    status,
    statusDetail,
    statusSince: status === prev.status ? prev.statusSince : Date.now(),
});

// The chat line the state shows, null for none.
const lineOf = (state: ChatState): ChatLine | null =>
    state.status === null ? null : { label: state.status, detail: state.statusDetail };

// The state showing `line`, or no line.
const withChatLine = (prev: ChatState, line: ChatLine | null): ChatState =>
    line
        ? withLine(prev, line.label, line.detail)
        : { ...prev, status: null, statusDetail: null, statusSince: null };

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

// What a stream's request can ask of its stream: whether the user stopped
// it, and to mark a carried-on turn (`carries`) as this page's own while the
// page carries it (`carry(true)`), so leaving the conversation cancels it,
// or as another stream's while that one holds it (`carry(false)`).
type StreamControl = { stopped: () => boolean; carry: (own: boolean) => void };

// The stream whose request runs, as leaving the conversation (reset,
// hydrate) sees it: `leave` does to its turn what a Stop would, when this
// page carries the turn, asking the harness to cancel it in `session`.
// True when the request stays open until the harness names its turn, which
// is then cancelled; the caller must not close it. A carried-on turn whose
// resume the harness has not granted yet is not this page's, so leaving
// closes the request with no cancel and the turn stays as the page found it.
type RunningStream = { leave: (session: string) => boolean };

// Whether page turn `turn`'s reply (pageTurnReplyAt) has text.
const hasAnswer = (messages: ChatMessage[], turn: number): boolean => {
    const reply = messages[pageTurnReplyAt(messages, turn)];

    return reply?.role === 'bot' && !!reply.text;
};

// A turn's end on screen, however it ended: its Activity entry closes and
// the chat line clears. `answered` is read before a failure's detail fills
// an empty reply, so a caller that fills it passes the earlier messages'.
const endTurn = (
    prev: ChatState,
    turn: number,
    open?: 'skipped' | 'failed',
    answered = hasAnswer(prev.messages, turn),
): ChatState => ({
    ...prev,
    activity: endTurnActivity(prev.activity, turn, open, answered),
    ...NO_LINE,
    thinking: false,
});

// A conversation restored WITHOUT its server-side session (a fork of a
// share, or a save whose session is gone) primes the next turn with a compact
// recap of the transcript (sessionRecap), so the agent picks up the thread
// instead of starting cold. Sent with the message, hidden from the chat.

// A saved transcript as the chat shows it. Without its harness session the
// conversation starts afresh on the harness, which holds none of the answers
// that offered its chips, so they go. Each prompt carries the page turn the
// saved transcript numbers it (withTurnStamps) before any state read merges
// turns in.
const restoredMessages = (saved: ChatSnapshot): ChatMessage[] =>
    withTurnStamps(
        saved.sessionId ? saved.messages : withoutChips(saved.messages),
        restoreActivity(saved.activity),
    );

// A restored conversation's page turn count: the saved one, raised past any
// stamped prompt, so the next turn takes a number no prompt holds.
const restoredTurnCount = (saved: number, messages: readonly ChatMessage[]): number =>
    Math.max(
        saved,
        ...messages.map((message) => (message.role === 'user' ? (message.turn ?? 0) : 0)),
    );

// A saved canvas as the chat holds it. Without its harness session no card
// can change its unit, years or places, so the offers go, as the chips do.
// A save is read back as data, so its years and places offers are narrowed
// as a frame's are (cardChangesOf).
const restoredWidgets = (saved: ChatSnapshot): TurnWidget[] =>
    saved.sessionId
        ? saved.widgets.map((widget) => {
              if (widget.kind === 'text' || widget.cardChanges === undefined) return widget;

              const cardChanges = cardChangesOf(widget.cardChanges);

              return cardChanges
                  ? { ...widget, cardChanges }
                  : { ...widget, cardChanges: undefined };
          })
        : withoutCardOffers(saved.widgets);

/**
 * Drives one Studio conversation against the harness's `/api/studio/*`
 * frames. Pauses (`plan.proposed`, `elicitation.request`) END the stream and
 * are answered on `/interrupt`, which streams the same turn onward; activity
 * arrives as labelled steps; cards arrive as `component.created` frames
 * mapped onto canvas widgets drawn from the component payload, and a stat
 * card upgrades in place with the statistics the datasets door measured.
 * `initial` seeds the hook from a saved conversation (a shared/forked copy)
 * instead of an empty chat. `onCardReplaced` hears of a card the harness
 * redrew under a new id (`replaces`), in the same update that swaps it, so
 * the canvas moves the old card's settings across.
 */
export const useChat = (
    initial?: ChatSnapshot,
    {
        onCardReplaced,
        readsState = false,
        admitHandedBack,
        shownCards,
        pausesDropChanges = false,
    }: {
        onCardReplaced?: (from: string, to: string) => void;
        // The page may read the harness's state (reattach): a signed-in
        // user's own conversation. A guest's read is refused.
        readsState?: boolean;
        // The page's prompt gate for a new question a harness turn handed
        // back, as the queue sends it: whether the prompt may go (it runs
        // `send` when it may). `queued` counts the prompts still waiting.
        admitHandedBack?: (text: string, queued: number, send: () => void) => boolean;
        // The ids of the cards the page's canvas shows (canvasWidgetsOf),
        // which a page with no manifest baseline keeps when it leaves its
        // session (leaveSession).
        shownCards?: () => readonly string[];
        // A plan or a question drops the card changes queued behind its
        // turn (dropChangesForPause), as the Prompt layout's card pages hold
        // their changes while either waits (changesHeld). Without it a
        // queued change waits for the answer.
        pausesDropChanges?: boolean;
    } = {},
) => {
    // The saved transcript as restored, computed once for the refs and the
    // state seeded from it.
    const [restored] = useState(() => (initial ? restoredMessages(initial) : []));
    const [state, setState] = useState<ChatState>(() => ({
        messages: restored,
        widgets: initial ? restoredWidgets(initial) : [],
        queued: [],
        dropped: [],
        activity: restoreActivity(initial?.activity),
        ...NO_LINE,
        thinking: false,
        clarify: null,
        plan: null,
    }));
    // The conversation id doubles as the snapshot's sessionId, so saves and
    // shares reopen the same server-side conversation.
    const sessionRef = useRef<string | null>(initial?.sessionId ?? null);
    // The places each card's roles can change to, read once per card and role
    // for the life of the page (placeOptions), keyed `<card>\n<role>`. A read
    // that failed is dropped, so the next asks again, and a replacement drops
    // the lists of the card it replaced.
    const placeListsRef = useRef(new Map<string, PlaceRead>());
    const abortRef = useRef<AbortController | null>(null);
    // Stops the running stream's turn (set while a request runs).
    const haltRef = useRef<(() => void) | null>(null);
    // The stream whose request runs, which leaving the conversation stops.
    const runningRef = useRef<RunningStream | null>(null);
    // The harness cards the user took off whose removal the harness has not
    // confirmed (owedRemovals.ts), which stay off the canvas and its saves,
    // and the ones with a `remove` in flight. The ref lets callbacks read the
    // set between renders.
    const [owedRemovals, setOwedRemovals] = useState<OwedRemoval[]>(() =>
        initial ? owedRemovalsOf(initial) : [],
    );
    const owedRef = useRef(owedRemovals);
    const setOwed = useCallback((update: (prev: OwedRemoval[]) => OwedRemoval[]) => {
        owedRef.current = update(owedRef.current);
        setOwedRemovals(owedRef.current);
    }, []);
    const removingRef = useRef(new Map<string, number>());
    // The cards drawn from a read before their turn closed, which wait for
    // the stored card a later read brings (reconcileCards).
    const awaitingStoredRef = useRef(new Set<string>());
    // How many times this page load sent each owed removal again
    // (resendsOf), and whether a reopened page still waits for the harness's
    // state before it sends any (set by hydrate, cleared by reattach's read
    // and by any manifest the page takes).
    const resentRef = useRef(new Map<string, number>());
    // How many drain runs in a row left owed cards behind, and the timer
    // that runs the drain again (owedRetryAfter). Whether the page has
    // unmounted, which stops a drain in flight and arms no timer.
    const owedRetryRef = useRef<{ runs: number; timer?: ReturnType<typeof setTimeout> }>({
        runs: 0,
    });
    const unmountedRef = useRef(false);
    const [owedHeld, setOwedHeldState] = useState(false);
    const owedHeldRef = useRef(false);
    const setOwedHeld = useCallback((held: boolean) => {
        owedHeldRef.current = held;
        setOwedHeldState(held);
    }, []);
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
    const turnCount = useRef(initial ? restoredTurnCount(initial.turnCount, restored) : 0);
    // The transcript as last rendered, for the callbacks that read which
    // harness turns it holds (heldTurns) outside a state update.
    const messagesRef = useRef<ChatMessage[]>([]);

    useEffect(() => {
        messagesRef.current = state.messages;
    }, [state.messages]);
    // The revisions of the approved plans the page holds, so a repeated
    // plan.approved, or a state read's, attaches none again.
    const [restoredApprovals] = useState(() => approvalKeys(restored));
    const approvalsRef = useRef(restoredApprovals);
    // The cards, set here the moment a frame or a read places one and
    // mirrored into state (setWidgets), so the queue and the state reads see
    // a card a chunk brings before React renders it.
    const widgetsRef = useRef<TurnWidget[]>(state.widgets);
    // Each card that took another's place since the page loaded, mapped to
    // the card it replaced, set with the card (cardIdentity.ts reads it). It
    // is replaced whole, never changed in place, since cardIdentity indexes
    // each map once.
    const replacedRef = useRef<Record<string, string>>({});
    const setWidgets = useCallback((next: (widgets: TurnWidget[]) => TurnWidget[]) => {
        const widgets = next(widgetsRef.current);

        if (widgets === widgetsRef.current) return;

        widgetsRef.current = widgets;
        setState((prev) => ({ ...prev, widgets }));
    }, []);
    const recapRef = useRef<string | null>(
        initial && !initial.sessionId ? sessionRecap(initial.messages) : null,
    );
    // The pending pause's addressing (interrupt_id) with, for elicitations,
    // the normalized clarify that answerClarify() builds its reply and
    // status note from, and that skipClarify() reads `skippable` from.
    // For plans, the plan that switchChoice() checks a pick against. A
    // question a switch's replan asked carries the switch's waiting plan.
    const pendingInterruptRef = useRef<Pause | null>(null);
    // The page turn of the stream that offered the pending pause, which the
    // answer's stream carries on, so it writes into that turn's reply.
    const pauseTurnRef = useRef(0);
    // The latest plan this turn offered, or is waiting on a switch of. A
    // fresh plan.proposed carries its baseline (what the turn's first plan
    // held) and learns which choice its switch moved. A new turn clears it.
    const turnPlanRef = useRef<PlanState | null>(null);
    // The card an in-flight `edit` turn is changing. The harness answers an
    // edit with a REPLACEMENT component under a new id (and drops the old one
    // from its composition) rather than a component.revised, so the canvas has
    // to retire the original — otherwise an edit leaves two cards behind.
    const editingRef = useRef<string | null>(null);
    // Whether the turn streaming is a card change (unit, years or places),
    // whose replacement card keeps the old card's turn (see placeCard): set
    // when the page sends one (applyEdit) and when it carries one on from a
    // state read (reattach), whose prompt is then marked `edit` too.
    const unitTurnRef = useRef(false);
    const onCardReplacedRef = useRef(onCardReplaced);

    useEffect(() => {
        onCardReplacedRef.current = onCardReplaced;
    }, [onCardReplaced]);
    // component_id → the revision we're currently holding. A card-scoped turn
    // has to address both (the contract rejects a stale revision). Frames
    // keep it current; a reopened conversation starts from its saved cards.
    const revisionsRef = useRef(restoreCardRevisions(initial));
    // The harness's latest canvas manifest as this page saw it. Its ids are
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
    // Why each canvas edit the harness did not answer failed, by its
    // operations, for syncCanvas to read once the edit settles.
    const editFailuresRef = useRef(new WeakMap<MutationOperation[], unknown>());
    // Bumped each time the page leaves a harness session (leaveSession), so
    // an answer to a canvas edit sent to the old session acts on nothing.
    const sessionLeftRef = useRef(0);
    // The cards a legacy canvas's save held that its harness session never
    // held (a fork's inherited cards), for the canvas document to keep as
    // local, the ones the legacy canvas hid staying off the canvas.
    const [localCards, setLocalCards] = useState<LegacyLocal>(NO_LOCAL);
    // Settles the `produced` read of the legacy canvas startLegacy began:
    // reattach's state read, from turn 0, resolves it with the cards the
    // harness session's turns drew (producedCards), or null when the read
    // failed. A legacy canvas takes no manifest before it settles.
    const producedRef = useRef<((cards: ReadonlySet<string> | null) => void) | null>(null);
    const applyManifest = useCallback(
        (manifest: CompositionManifest) => {
            if (legacyRef.current) {
                void legacyRef.current.offer(manifest);

                return;
            }

            const taken = takeManifest(canvasRef.current, manifest);

            // A manifest from the harness is current, so owed removals a
            // reopened page held can go against it.
            setOwedHeld(false);

            if (taken) {
                canvasRef.current = taken.baseline;
                setCanvas(taken.baseline);

                // The cards of a composition left behind turn local, the ones
                // owed removal off the canvas.
                if (taken.local.length > 0) {
                    const owed = owedIds(owedRef.current);

                    setLocalCards({
                        shown: taken.local.filter((id) => !owed.has(id)),
                        hidden: taken.local.filter((id) => owed.has(id)),
                    });
                }
            }
        },
        [setOwedHeld],
    );
    // A legacy canvas a reopened conversation (hydrate) restored for
    // `saved`'s session is brought to the harness's manifest once one
    // arrives and reattach has read the cards the session's turns drew
    // (producedRef), by removing the cards the save hid (legacyHiddenCards).
    // Until then it shows the legacy cards and the cards drawn since. A
    // share's copy (`initial`) runs no turn and edits nothing, so it starts
    // none.
    const startLegacy = useCallback(
        (saved: ChatSnapshot, baseline: CanvasBaseline | null) => {
            const session = saved.sessionId;

            producedRef.current = null;

            if (!session || baseline?.compositionId !== null) {
                legacyRef.current = null;

                return;
            }

            const generation = generationRef.current;
            const produced = new Promise<ReadonlySet<string> | null>((resolve) => {
                producedRef.current = resolve;
            });
            const legacy = createLegacyCanvas({
                ids: baseline.ids,
                hidden: legacyHiddenCards(saved, baseline, restoreCardRevisions(saved)),
                pinned: (saved.pinnedIds ?? []).filter((id) => !saved.localIds?.includes(id)),
                produced,
                mutate: (operations, expectedRevision) =>
                    mutateComposition(session, operations, expectedRevision),
                onTake: (manifest) => {
                    if (generationRef.current !== generation) {
                        return;
                    }

                    if (legacyRef.current === legacy) {
                        legacyRef.current = null;
                    }

                    applyManifest(manifest);
                },
                onLocal: (local) => {
                    if (generationRef.current === generation) {
                        setLocalCards(local);
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
    // The harness turns whose new question (see askNewQuestion) is queued,
    // being sent, or admitted, so a stream's `done` and a later state read
    // send it once. A send the harness did not admit leaves it (send).
    const askedRef = useRef(new Set<number>());
    // A turn the harness ended because the user's change to its plan asked
    // something else. The text goes to the front of the queue and is sent as
    // the next turn (metered, as typed) once the conversation is free, as
    // the turn that follows `turnIndex` (sendNewQuestion), so of two pages
    // that send it the harness begins one turn.
    const askNewQuestion = useCallback((turnIndex: number, text: string) => {
        if (askedRef.current.has(turnIndex)) {
            return;
        }

        const queued: QueuedMessage = {
            id: uuid(),
            text,
            fromNewQuestion: turnIndex,
            handedBack: true,
        };

        askedRef.current.add(turnIndex);
        queueRef.current.unshift(queued);
        setState((prev) => ({ ...prev, queued: [queued, ...prev.queued] }));
    }, []);
    // The pin and unpin edits the harness has not answered yet. Each shows
    // at once, and once answered the manifest decides again: the answer's,
    // or for a refused edit the one held before it (shownPins).
    const [pendingPins, setPendingPins] = useState<PendingPins>(() => new Map());
    // The add and remove edits the harness has not answered yet, which show
    // at once the same way (editedCanvasCards). The ref lets leaveSession
    // keep them.
    const [pendingCards, setPendingCardsState] = useState<PendingCards>(() => new Map());
    const pendingCardsRef = useRef<PendingCards>(pendingCards);
    const setPendingCards = useCallback((update: (prev: PendingCards) => PendingCards) => {
        pendingCardsRef.current = update(pendingCardsRef.current);
        setPendingCardsState(pendingCardsRef.current);
    }, []);
    const shownCardsRef = useRef(shownCards);

    useEffect(() => {
        shownCardsRef.current = shownCards;
    }, [shownCards]);
    // Called when the harness holds no session for this conversation: a state
    // read or a request answered that the harness holds no
    // conversation under its id (isSessionGone), or a new turn was admitted
    // at an index a prompt holds, since `/turn` begins a new conversation
    // under an id the harness lacks and numbers its turns from 1 again. The
    // page leaves the session as a fork leaves the one it copies: the
    // transcript is inherited (withSessionLeft), the answers' chips and unit
    // offers go, the harness's cards become local cards, shown or hidden as
    // the canvas shows them with the user's unanswered edits (shownCanvas),
    // and answers to canvas edits sent to the old session are dropped. With `turn`, the
    // page turn of the prompt the new session admitted, that turn stays the
    // session's own and the id stays. Without it the next turn opens a new id
    // with a recap of the transcript (sessionRecap), which stops before the
    // prompt of `refused`, the page turn the harness refused for want of the
    // session, since the user sends that prompt again. A plan or question
    // card goes, since the pause it answers went with the session, and the
    // queue it held back is free to go.
    const leaveSession = useCallback(
        (turn?: number, { refused }: { refused?: number } = {}) => {
            const pageIds = shownCardsRef.current?.() ?? [];
            const owed = owedIds(owedRef.current);
            const shownIds = (
                shownCanvas(canvasRef.current, pendingCardsRef.current, pageIds)?.ids ?? pageIds
            ).filter((id) => !owed.has(id));
            const cards = sessionLeftCards(
                canvasRef.current ? shownIds : null,
                widgetsRef.current,
                shownIds,
            );
            const left = (messages: ChatMessage[]) => withoutChips(withSessionLeft(messages, turn));

            sessionLeftRef.current += 1;

            messagesRef.current = left(messagesRef.current);
            widgetsRef.current = withoutCardOffers(widgetsRef.current);

            if (turn === undefined) {
                sessionRef.current = null;
                recapRef.current = sessionRecap(messagesRef.current, refused);
            }

            pendingInterruptRef.current = null;
            turnPlanRef.current = null;

            approvalsRef.current = approvalKeys(messagesRef.current);
            askedRef.current.clear();
            canvasRef.current = null;
            setCanvas(null);
            legacyRef.current = null;
            producedRef.current?.(null);
            producedRef.current = null;
            canvasEditsRef.current?.reset();
            setPendingPins(new Map());
            setPendingCards(() => new Map());
            // The cards owed removal are local now, and off the canvas, and
            // no read of the session left brings a stored card.
            setOwed(() => []);
            removingRef.current.clear();
            awaitingStoredRef.current.clear();
            clearTimeout(owedRetryRef.current.timer);
            owedRetryRef.current.runs = 0;

            if (cards.shown.length > 0 || cards.hidden.length > 0) {
                setLocalCards(cards);
            }

            setState((prev) => sessionLeftChat(prev, turn));
            drainRef.current();
        },
        [setOwed, setPendingCards],
    );
    // A new question the page sent once and the harness never admitted
    // (refused, never reached, stopped, or taken out of the queue) is offered
    // on the reply of the turn that asked it, for the user to send, and the
    // page sends it only on that click (owedNewQuestion reads the offer). Its
    // unsent prompt leaves the transcript with its reply and its Activity
    // entry, and its page turn is free again when it was the latest.
    // `droppedRefunds` counts the refunded prompts that leave the transcript
    // this way or with a moved question (dropMovedQuestion), for a guest's
    // meter, which counts refunds on the transcript.
    const [droppedRefunds, setDroppedRefunds] = useState(0);
    const offerNewQuestion = useCallback((turnIndex: number, text: string) => {
        const offer = (messages: ChatMessage[]) => withOfferedQuestion(messages, turnIndex, text);
        const dropped = new Set(offeredQuestionPageTurns(messagesRef.current, turnIndex));
        const { messages: kept, refunds } = withQuestionOffered(
            messagesRef.current,
            turnIndex,
            text,
        );

        while (dropped.has(turnCount.current)) {
            turnCount.current -= 1;
        }

        if (refunds > 0) {
            setDroppedRefunds((prev) => prev + refunds);
        }

        messagesRef.current = kept;
        setState((prev) => ({
            ...prev,
            messages: offer(prev.messages),
            activity:
                dropped.size === 0
                    ? prev.activity
                    : prev.activity.filter((entry) => !dropped.has(entry.turn)),
        }));
    }, []);
    // A canvas edit the user made to a card the harness holds (Remove, Pin,
    // Add), sent to the harness, whose manifest then decides whether the
    // card shows and whether it is pinned, so the canvas the agent reads
    // matches this one. Nothing to send before the conversation has a
    // session. The edit shows at once (shownPins, editedCanvasCards) until the
    // harness answers; a refusal rolls it back, and one saying the session is
    // gone keeps it, as the cards turn local (leaveSession). A refusal as
    // busy or briefly unavailable is sent again (createCanvasEdits).
    // Edits go one after another, so a Remove then an Add land in order; a
    // response for a conversation since left is dropped.
    // Resolves with how the harness answered (ResendOutcome).
    const syncCanvas = useCallback(
        (operations: MutationOperation[], against?: EditAgainst): Promise<ResendOutcome> => {
            const session = sessionRef.current;

            if (!session) {
                return Promise.resolve('failed');
            }

            const generation = generationRef.current;

            setPendingPins((prev) => withPinsSent(prev, operations));
            setPendingCards((prev) => withCardsSent(prev, operations));

            for (const operation of operations) {
                if (operation.op === 'add') {
                    legacyRef.current?.keep(operation.component_id);
                } else if (operation.op === 'remove') {
                    legacyRef.current?.drop(operation.component_id);
                } else if (operation.op === 'pin') {
                    legacyRef.current?.pin(operation.component_id);
                } else if (operation.op === 'unpin') {
                    legacyRef.current?.unpin(operation.component_id);
                }
            }

            // A Remove is owed until the harness confirms it, and an Add
            // takes the card out of the owed set first, so a late remove
            // cannot take an added card off.
            const removes = operations.flatMap((operation) =>
                operation.op === 'remove' ? [operation.component_id] : [],
            );

            setOwed((prev) =>
                operations.reduce(
                    (owed, operation) =>
                        operation.op === 'remove'
                            ? owe(
                                  owed,
                                  operation.component_id,
                                  knownRevision(
                                      canvasRef.current,
                                      revisionsRef.current,
                                      operation.component_id,
                                  ),
                              )
                            : operation.op === 'add'
                              ? forgive(owed, operation.component_id)
                              : owed,
                    prev,
                ),
            );
            removes.forEach((id) =>
                removingRef.current.set(id, (removingRef.current.get(id) ?? 0) + 1),
            );

            // The entries these removes owe, which the harness's answer
            // settles (confirm). A later Remove of the same card owes its own.
            const entries = owedRef.current.filter((entry) => removes.includes(entry.id));

            canvasEditsRef.current ??= createCanvasEdits({
                mutate: (edited, edits, sentAgainst) =>
                    mutateComposition(
                        edited,
                        edits,
                        sentAgainst?.revision,
                        sentAgainst?.compositionId,
                    ),
                // A busy answer while this page's turn runs is sent again
                // until the turn ends.
                ownTurn: () => inFlightRef.current > 0,
                onManifest: applyManifest,
                onFailure: (failedOperations, error) => {
                    editFailuresRef.current.set(failedOperations, error);
                },
            });

            const legacy = legacyRef.current;
            const sessionLeft = sessionLeftRef.current;

            return canvasEditsRef.current
                .enqueue(session, operations, against)
                .then((answered): ResendOutcome => {
                    removes.forEach((id) => {
                        const left = (removingRef.current.get(id) ?? 1) - 1;

                        if (left > 0) {
                            removingRef.current.set(id, left);
                        } else {
                            removingRef.current.delete(id);
                        }
                    });

                    if (
                        generationRef.current !== generation ||
                        sessionLeftRef.current !== sessionLeft
                    ) {
                        return 'failed';
                    }

                    const error = answered ? null : editFailuresRef.current.get(operations);
                    const refusal = error instanceof CompositionRefusal ? error : null;

                    // Left with the edit still showing, so the cards turn local
                    // as the user left them.
                    if (refusal && isSessionGone(refusal)) {
                        leaveSession();

                        return 'failed';
                    }

                    setPendingPins((prev) => withPinsSettled(prev, operations));
                    setPendingCards((prev) => withCardsSettled(prev, operations));

                    if (answered) {
                        setOwed((prev) => entries.reduce(confirm, prev));

                        return 'answered';
                    }

                    // A resend met a canvas that moved on. Its sender reads the
                    // canvas again (drainOwedRemovals).
                    if (refusal && isStaleRevision(refusal)) {
                        return 'stale';
                    }

                    const removed = refusedRemoves(operations, error);

                    if (removed.length === 0) {
                        if (!(refusal && isNoBlock(refusal))) {
                            console.warn(
                                'Studio: this canvas edit did not reach the harness',
                                operations,
                                error,
                            );
                        }

                        return 'failed';
                    }

                    // A remove refused for a card the manifest held: the harness
                    // has taken it off already, so it goes from the baseline and
                    // the next manifest is taken.
                    const next = withoutRemovedCards(canvasRef.current, removed);

                    if (next) {
                        canvasRef.current = next;
                        setCanvas(next);

                        return 'gone';
                    }

                    // A legacy canvas learns which removes the harness holds no
                    // block for: a card it never held, such as a fork's inherited
                    // card, then stays on the page as a local card
                    // (createLegacyCanvas's `unheld`).
                    for (const id of removed) {
                        legacy?.unheld(id);
                    }

                    return 'gone';
                });
        },
        [applyManifest, leaveSession, setOwed, setPendingCards],
    );
    // The harness cards the page shows pinned, or null while the canvas
    // holds no manifest's pins and the save's pins stand.
    const pins = useMemo(() => shownPins(canvas, pendingPins), [canvas, pendingPins]);
    // Put a plan card up as the pending pause, whether from the stream or
    // from a refusal that answered a stale card with the current one.
    // With `pausesDropChanges`, a pause drops the card changes queued
    // behind its turn (dropChangesForPause): the queue loses them now, and
    // the returned update moves them from `queued` to `dropped`.
    const dropQueuedChanges = useCallback(
        (pause: ChangePause) => {
            const { kept, dropped } = pausesDropChanges
                ? dropChangesForPause(queueRef.current, pause)
                : { kept: queueRef.current, dropped: [] };

            queueRef.current = kept;

            return (prev: ChatState): ChatState =>
                dropped.length === 0
                    ? prev
                    : {
                          ...prev,
                          queued: prev.queued.filter((item) =>
                              kept.some((other) => other.id === item.id),
                          ),
                          dropped: [...prev.dropped, ...dropped],
                      };
        },
        [pausesDropChanges],
    );
    const offerPlan = useCallback(
        (plan: PlanState) => {
            const drop = dropQueuedChanges('plan');

            pendingInterruptRef.current = { interruptId: plan.interruptId, plan };
            turnPlanRef.current = plan;
            setState((prev) => drop({ ...prev, ...NO_LINE, thinking: false, plan }));
        },
        [dropQueuedChanges],
    );
    // Swap one widget in place, wherever it sits in the list.
    const patchWidget = useCallback(
        (id: string, fn: (widget: TurnWidget) => TurnWidget) => {
            setWidgets((widgets) =>
                widgets.map((widget) => (widget.id === id ? fn(widget) : widget)),
            );
        },
        [setWidgets],
    );

    // Ask the harness to cancel turn `turnIndex`, or the conversation's turn
    // when the harness has named none (cancelTurn). Requests queued behind
    // the stream also wait for the cancel request to answer.
    const requestCancel = useCallback((turnIndex: number | null) => {
        const conversation = sessionRef.current;

        if (!conversation) {
            return;
        }

        const cancelled = cancelTurn(conversation, turnIndex);

        chainRef.current = chainRef.current.then(async () => {
            await cancelled;
        });
    }, []);

    // `onRefusal` answers an HTTP refusal of the request, and `onUnreachable`
    // a request that got no response (see StreamHandlers); each returns true
    // when it has dealt with it, and anything else ends the turn as an error.
    // Once the stream ends, at its `done` or `error` frame or else when it
    // closes, `onEnd` gets how it ended (see StreamEnding) and ends the turn
    // on screen. A caller without one gets `endOwn`. A caller with one (a
    // switch, whose harness may re-offer the plan after a Stop) also keeps
    // the frames after Stop, for up to SWITCH_STOP_GRACE_MS, with the chat
    // line on "Stopping". `onSettled` runs once, right after that end on
    // screen, unless reset or hydrate has walked away from the stream.
    // `metered` marks a POST turn, whose prompt the site's meter gives back
    // when the response is a refusal (meterTurn), so a refusal marks the
    // turn's prompt refunded. `carries` is the harness turn a stream carries
    // on, which the harness admitted already (a reopened page's). Leaving
    // the conversation ends such a stream here without asking the harness to
    // cancel the turn, except while `start` carries the turn itself (its
    // `control`).
    const stream = useCallback(
        (
            turn: number,
            start: (
                handlers: StreamHandlers,
                signal: AbortSignal,
                control: StreamControl,
            ) => Promise<void>,
            {
                onRefusal,
                onUnreachable,
                onEnd,
                onSettled,
                metered = false,
                carries = null,
            }: {
                onRefusal?: (refusal: StreamRefusal) => boolean;
                onUnreachable?: () => boolean;
                onEnd?: (ending: StreamEnding) => void;
                onSettled?: () => void;
                metered?: boolean;
                carries?: number | null;
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
            // The session the page left while this stream's request was on
            // its way (RunningStream's `leave`): once the harness names the
            // turn it admitted, that turn is cancelled there and the request
            // closes, and a busy answer closes it.
            let leftSession: string | null = null;
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

            // The stream writes into its own turn's reply (pageTurnReplyAt),
            // which an unsent prompt may follow.
            const patchBot = (
                fn: (message: Extract<ChatMessage, { role: 'bot' }>) => ChatMessage,
            ) =>
                setState((prev) => {
                    const messages = withReplyAt(
                        prev.messages,
                        pageTurnReplyAt(prev.messages, turn),
                        fn,
                    );

                    return messages === prev.messages ? prev : { ...prev, messages };
                });

            // Deltas BEFORE any step are the agent's preamble ("Checking the
            // growth of …"). The chat line shows its first sentence; the full
            // text reaches the transcript with message.complete. Deltas after
            // the steps are the answer streaming in.
            let sawStep = false;
            let preamble = '';
            const stepLine = createStepLine();

            // The harness's index of the turn this stream carries, from its
            // x-dfo-turn-index header. The prompt of page turn `turn` takes
            // it, unless a prompt holds it already, so the prompt and its
            // reply are keyed on the harness's turn. A new turn admitted at
            // an index a prompt holds opened a new harness conversation
            // under the same id, so the page leaves the old session first
            // (leaveSession).
            let turnIndex: number | null = null;

            const keyTurn = (index: number) => {
                if (generationRef.current !== generation) {
                    return;
                }

                if (metered && index <= heldTurns(messagesRef.current)) {
                    leaveSession(turn);
                }

                turnIndex = index;
                setState((prev) => {
                    const messages = withHarnessTurn(prev.messages, turn, index);

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

                        // A card that takes over another (the one its
                        // frame `replaces`, else the card this edit turn
                        // set out to edit) takes that card's slot, and on a
                        // Change unit turn its turn (see placeCard). The
                        // canvas moves the old card's settings to it.
                        const takeover = {
                            replaces: frame.replaces ?? null,
                            editing: editingRef.current,
                        };
                        const keepTurn = unitTurnRef.current;
                        const from = takenOver(widget.id, takeover);

                        editingRef.current = null;

                        if (from)
                            replacedRef.current = { ...replacedRef.current, [widget.id]: from };

                        // A legacy canvas shows the card at once, and drops
                        // the card it replaced.
                        legacyRef.current?.keep(widget.id);

                        if (from) {
                            legacyRef.current?.drop(from);

                            // The held manifest names the replacement in the
                            // same render, so the canvas never shows neither
                            // card while the manifest frame is on its way.
                            const renamed = withReplacedCard(canvasRef.current, from, widget.id);

                            if (renamed !== canvasRef.current) {
                                canvasRef.current = renamed;
                                setCanvas(renamed);
                            }
                        }

                        // A replacement keeps the plan step of the card it
                        // replaced when its own frame names none.
                        setWidgets((widgets) => {
                            const old = from && widgets.find((other) => other.id === from);
                            const kept =
                                old && old.kind !== 'text' && widget.kind !== 'text'
                                    ? { ...widget, planStep: widget.planStep ?? old.planStep }
                                    : widget;

                            return placeCard(
                                widgets,
                                { ...kept, turn },
                                { ...takeover, keepTurn, values: rowValues },
                            );
                        });

                        if (from) {
                            for (const key of placeListsRef.current.keys()) {
                                if (key.startsWith(`${from}\n`)) placeListsRef.current.delete(key);
                            }

                            onCardReplacedRef.current?.(from, widget.id);
                        }

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
                        pauseTurnRef.current = turn;
                        offerPlan(planFromFrame(frame, turnPlanRef.current ?? undefined));

                        // The turn waits on the user again, so a Stop has
                        // nothing to cancel.
                        if (haltRef.current === halt) {
                            haltRef.current = null;
                        }

                        release();
                        break;
                    }
                    case 'plan.approved': {
                        // Comes first on the approve's stream, so the reply it
                        // writes into is the transcript's last message. The
                        // turn's Activity entry records the approval time,
                        // which places the plan among its steps. A resume and
                        // an /interrupt retry open with the approvals the turn
                        // already took, which are ignored by revision
                        // (takeApproval).
                        const approved = takeApproval(frame, turnIndex, approvalsRef.current);

                        if (!approved) {
                            break;
                        }

                        const approvedAt = Date.now();

                        setState((prev) => ({
                            ...prev,
                            messages: withApprovedPlan(
                                prev.messages,
                                approved,
                                pageTurnReplyAt(prev.messages, turn),
                            ),
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
                        pauseTurnRef.current = turn;
                        pendingInterruptRef.current = questionPause(
                            clarify,
                            pendingInterruptRef.current,
                        );

                        const drop = dropQueuedChanges('question');

                        setState((prev) =>
                            drop(withQuestion({ ...prev, ...NO_LINE, thinking: false }, clarify)),
                        );
                        release();
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
                            // The turn the question is owed by. A stream that
                            // named no turn leaves it for the user to send.
                            const origin = turnIndex;

                            setState((prev) => {
                                const messages = withNewQuestion(
                                    prev.messages,
                                    question,
                                    pageTurnReplyAt(prev.messages, turn),
                                );

                                return {
                                    ...prev,
                                    messages:
                                        origin === null
                                            ? withFollowup(messages, null, question)
                                            : messages,
                                };
                            });

                            if (origin !== null) {
                                askNewQuestion(origin, question);
                            }
                        }

                        finish();
                        break;
                }
            };

            // Carries out what Stop does to the request (stopAction), at
            // the Stop and again when the harness answers a request the
            // Stop left open (watchAdmission's `onStopChange`): it gives a
            // metered prompt back, asks the harness to cancel the turn, and
            // closes the request at once or after the grace.
            const carryOut = (action: StopAction) => {
                if (leftSession !== null) {
                    if (action.cancel === 'now') {
                        void cancelTurn(leftSession, admission.turnIndex());
                    }

                    leftSession = null;
                    controller.abort();

                    return;
                }

                if (generationRef.current !== generation) {
                    return;
                }

                if (action.refunded) {
                    setState((prev) => ({ ...prev, messages: withRefundedPrompt(prev.messages) }));
                }

                if (action.cancel === 'now') {
                    requestCancel(admission.turnIndex());
                }

                if (stopGrace !== null) {
                    clearTimeout(stopGrace);
                    stopGrace = null;
                }

                if (action.abort === 'now') {
                    controller.abort();
                } else {
                    stopGrace = setTimeout(
                        () => controller.abort(),
                        onEnd ? SWITCH_STOP_GRACE_MS : STOP_GRACE_MS,
                    );
                }
            };

            // Stop ends the turn on screen at once and keeps what arrived (an
            // empty answer takes the preamble, else a note). The stream is
            // read until the harness ends it, so the request counts as in
            // flight, and queued sends wait, until the conversation is free.
            // A caller that ends the turn itself keeps the frames (a switch's
            // stream may re-offer the plan). A Stop before the request left,
            // or while it waits on another stream (whileBusy), ends it at once
            // and sends nothing more. A Stop once it left asks the harness to
            // cancel the turn as soon as the harness has named it
            // (stopAction).
            const halt = () => {
                if (stopped || generationRef.current !== generation) {
                    return;
                }

                const action = admission.stop(metered);

                stopped = true;
                grace.cancel();
                carryOut(action);

                if (onEnd) {
                    if (action.abort === 'now') {
                        // Stop is free for the next stream queued behind this
                        // one, which the chain has not reached yet.
                        if (haltRef.current === halt) {
                            haltRef.current = null;
                        }

                        finish();

                        return;
                    }

                    setState((prev) => withLine(prev, 'Stopping'));

                    return;
                }

                muted = true;
                stall.stop();

                setState((prev) => {
                    const messages = withReplyAt(
                        prev.messages,
                        pageTurnReplyAt(prev.messages, turn),
                        (reply) =>
                            reply.text ? reply : { ...reply, text: stoppedReply(preamble) },
                    );

                    return endTurn({ ...prev, messages }, turn, 'skipped');
                });
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
                        const messages = withReplyAt(
                            prev.messages,
                            pageTurnReplyAt(prev.messages, turn),
                            (reply) => (reply.text ? reply : { ...reply, text: `_${detail}_` }),
                        );

                        return endTurn(
                            { ...prev, messages },
                            turn,
                            'failed',
                            hasAnswer(prev.messages, turn),
                        );
                    });
                } else if (ending.failed || ending.done) {
                    setState((prev) => endTurn(prev, turn, ending.failed ? 'failed' : undefined));
                }
            };

            // The turn stops counting as this stream's for leaving the
            // conversation (RunningStream's `leave`) once it ends or waits on
            // the user, since a turn that ended or paused is not this
            // stream's to cancel.
            const release = () => {
                if (runningRef.current === running) {
                    runningRef.current = null;
                }
            };

            // The turn's end on screen, once: at the `done` or `error` frame,
            // or else when the stream closes.
            const finish = () => {
                release();

                if (!finished) {
                    finished = true;
                    (onEnd ?? endOwn)({ error: harnessError, done, stopped, failed, sent });
                    onSettled?.();
                }
            };

            // A refusal or a failed fetch of a stream that reset/hydrate
            // walked away from, or that the user stopped, is dropped, as
            // handle() drops frames. A switch the user stopped then ends as
            // stopped (its `onEnd`), not on a live card whose buttons the
            // cancel has made useless.
            // A refusal saying the harness holds no conversation under the
            // id leaves the session (leaveSession). That one, and a guest's
            // refusal on a conversation an account owns, end a turn the
            // stream ends (no `onEnd`) with a note saying what to do.
            const refuse = (refusal: StreamRefusal): boolean => {
                if (generationRef.current !== generation) {
                    return true;
                }

                if (metered) {
                    setState((prev) => ({ ...prev, messages: withRefundedPrompt(prev.messages) }));
                }

                const gone = isSessionGone(refusal);

                if (gone) {
                    leaveSession(undefined, { refused: turn });
                }

                if (muted || stopped) {
                    return true;
                }

                const note = gone
                    ? SESSION_GONE_NOTE
                    : isSignInRequired(refusal)
                      ? SIGN_IN_NOTE
                      : null;

                if (note === null || onEnd) {
                    return onRefusal?.(refusal) ?? false;
                }

                failWith(note);

                return true;
            };
            // The turn ended failed, with `note` as an empty reply's text.
            const failWith = (note: string) =>
                setState((prev) => {
                    const messages = withReplyAt(
                        prev.messages,
                        pageTurnReplyAt(prev.messages, turn),
                        (reply) => (reply.text ? reply : { ...reply, text: note }),
                    );

                    return endTurn(
                        { ...prev, messages },
                        turn,
                        'failed',
                        hasAnswer(prev.messages, turn),
                    );
                });
            // A state read found the conversation begun afresh under its id
            // (carryOnTurn): the page leaves the session, as for a refusal
            // saying the harness holds none, and the turn ends with that
            // refusal's note.
            const sessionGone = () => {
                if (generationRef.current !== generation) {
                    return;
                }

                leaveSession(undefined, { refused: turn });

                if (!muted && !stopped) {
                    failWith(SESSION_GONE_NOTE);
                }
            };
            // A request another stream's turn holds back says so on the
            // chat line while it waits, and the refusal stays out of the
            // transcript (whileBusy).
            // When the wait ends the line goes back to the turn's own.
            let heldLine: ChatLine | null = null;
            const busy = (seconds: number | null) => {
                if (generationRef.current !== generation || stopped) {
                    return;
                }

                setState((prev) => {
                    const next = busyWaitLine(lineOf(prev), heldLine, seconds);

                    heldLine = next.held;

                    return withChatLine(prev, next.line);
                });
            };
            const unreachable = (): boolean =>
                generationRef.current !== generation ||
                muted ||
                stopped ||
                (onUnreachable?.() ?? false);
            // Where the request stands, which decides what Stop does
            // (halt), and what a Stop that waited on the harness's answer
            // does once it comes (carryOut).
            const admission = watchAdmission(
                {
                    onFrame: handle,
                    onTurnIndex: keyTurn,
                    onKeepAlive: stall.beat,
                    onRefusal: refuse,
                    onUnreachable: unreachable,
                    onBusyWait: busy,
                    onSessionGone: sessionGone,
                },
                { onStopChange: carryOut, admittedTurn: carries },
            );
            // Whether this page carries the stream's turn: one it sent, or a
            // carried-on turn while this page resumes it.
            let own = carries === null;
            const control: StreamControl = {
                stopped: () => stopped,
                carry: (carried) => {
                    own = carried;
                },
            };
            const running: RunningStream = {
                leave: (session) => {
                    if (!own) {
                        return false;
                    }

                    const action = admission.stop(metered);

                    if (action.cancel === 'now') {
                        void cancelTurn(session, admission.turnIndex());
                    }

                    if (action.cancel !== 'on-admit') {
                        return false;
                    }

                    leftSession = session;

                    return true;
                },
            };

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
                    admission.start();
                    abortRef.current = controller;
                    haltRef.current = halt;
                    runningRef.current = running;
                    stall.beat();

                    return start(admission.handlers, controller.signal, control).catch(
                        (error: Error) => {
                            if (
                                error.name !== 'AbortError' &&
                                generationRef.current === generation
                            ) {
                                failed = true;
                            }
                        },
                    );
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

                    release();

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
        [
            applyManifest,
            askNewQuestion,
            dropQueuedChanges,
            leaveSession,
            offerPlan,
            patchWidget,
            requestCancel,
            setWidgets,
        ],
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
    // A card change keeps the pause (`keepPause`) until the harness admits
    // its turn (dropPause), since the harness refuses some changes before
    // any turn opens and the pause then still waits.
    const startTurn = useCallback(
        (user: ChatMessage & { role: 'user' }, line: string, { keepPause = false } = {}) => {
            const conversation = sessionRef.current ?? uuid();

            sessionRef.current = conversation;
            turnCount.current += 1;
            const turn = turnCount.current;

            if (!keepPause) {
                pendingInterruptRef.current = null;
                turnPlanRef.current = null;
            }

            editingRef.current = null;
            unitTurnRef.current = false;
            setState((prev) => ({
                ...withLine(prev, line),
                messages: [...prev.messages, { ...user, turn }, { role: 'bot', text: '' }],
                activity: [
                    ...prev.activity,
                    { turn, prompt: user.text, startedAt: Date.now(), tools: [] },
                ],
                thinking: true,
                ...(!keepPause && { clarify: null, plan: null }),
            }));

            return { turn, conversation };
        },
        [],
    );
    // The pause a new turn ends, once the harness admitted that turn: the
    // admission closes the paused turn on the harness.
    const dropPause = useCallback(() => {
        pendingInterruptRef.current = null;
        turnPlanRef.current = null;
        setState((prev) =>
            prev.clarify || prev.plan ? { ...prev, clarify: null, plan: null } : prev,
        );
    }, []);

    // A new question the harness refused because a later turn began first
    // (sendNewQuestion) takes its prompt and empty reply back off the
    // transcript, with the turn's Activity entry. A page that reads state
    // then reads in and carries on the turns it lacks (reattach); a guest's
    // keeps the question offered on the turn's reply (withMovedQuestion).
    // The prompt leaves refunded, as the site's meter gave it back, and
    // `droppedRefunds` counts the refunded prompts that left the transcript
    // this way.
    const reattachRef = useRef<() => void>(() => {});
    const readsStateRef = useRef(readsState);

    useEffect(() => {
        readsStateRef.current = readsState;
    }, [readsState]);

    const dropMovedQuestion = useCallback((turn: number, turnIndex: number, text: string) => {
        const reads = readsStateRef.current;
        const moved = (messages: ChatMessage[]) =>
            withMovedQuestion(messages, turnIndex, text, reads).messages;
        const { messages: kept, refunds } = withMovedQuestion(
            messagesRef.current,
            turnIndex,
            text,
            reads,
        );

        if (turnCount.current === turn) {
            turnCount.current -= 1;
        }

        if (refunds > 0) {
            setDroppedRefunds((prev) => prev + refunds);
        }

        // Set at once, since reattach() reads it before the next render.
        messagesRef.current = kept;
        setState((prev) => ({
            ...prev,
            ...NO_LINE,
            thinking: false,
            messages: moved(prev.messages),
            activity: prev.activity.filter((entry) => entry.turn !== turn),
        }));

        if (reads) {
            reattachRef.current();
        }
    }, []);

    // `fromNewQuestion` is the harness turn whose new question this sends
    // (askNewQuestion), or whose offer the user sent from the last reply
    // (offeredQuestionTurn). The request names that turn as the one it
    // follows, so a turn another page began first refuses it `turn_moved`.
    // A send the harness never admits (refused, never reached, or stopped)
    // is offered on that turn's reply for the user to send, and not sent
    // again on its own (offerNewQuestion).
    const send = useCallback(
        (
            message: string,
            card?: CardTarget,
            seeds?: Seed[],
            asked?: number,
            source?: PromptSource,
        ) => {
            const text = message.trim();
            const fromNewQuestion =
                asked ??
                (card || seeds ? undefined : offeredQuestionTurn(messagesRef.current, text));

            if (!text || holdTurn({ text, card, seeds, fromNewQuestion, source })) {
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
            const run = (handlers: StreamHandlers, signal: AbortSignal, afterTurn?: number) =>
                runTurn(conversation, recap ? `${recap}${text}` : text, handlers, signal, {
                    ...(componentRef && { component_ref: componentRef }),
                    ...(seeds && { seed_spec: seeds }),
                    ...(afterTurn !== undefined && { after_turn: afterTurn }),
                    ...(source && { prompt_source: source }),
                });

            const generation = generationRef.current;
            // Whether the harness admitted the new question's turn, or
            // answered that a later turn took it.
            let admitted = false;
            let moved = false;

            stream(
                turn,
                (handlers, signal) => {
                    if (fromNewQuestion === undefined) {
                        return whileBusy((busy) => run(busy, signal), handlers, signal);
                    }

                    return sendNewQuestion({
                        turnIndex: fromNewQuestion,
                        send: (afterTurn, busy) => run(busy, signal, afterTurn),
                        handlers: {
                            ...handlers,
                            onTurnIndex: (index) => {
                                admitted = true;
                                handlers.onTurnIndex?.(index);
                            },
                        },
                        signal,
                        onMoved: () => {
                            moved = true;

                            if (generationRef.current === generation) {
                                dropMovedQuestion(turn, fromNewQuestion, text);
                            }
                        },
                    });
                },
                {
                    metered: true,
                    // Sent once and never admitted: offered, not sent again.
                    ...(fromNewQuestion !== undefined && {
                        onSettled: () => {
                            if (!admitted && !moved && generationRef.current === generation) {
                                offerNewQuestion(fromNewQuestion, text);
                            }
                        },
                    }),
                },
            );
        },
        [dropMovedQuestion, holdTurn, offerNewQuestion, startTurn, stream],
    );

    // A queued message taken out of the queue. A new question taken out is
    // offered on its turn's reply instead (offerNewQuestion).
    const unqueue = useCallback(
        (id: string) => {
            const item = queueRef.current.find((other) => other.id === id);

            queueRef.current = queueRef.current.filter((other) => other.id !== id);
            setState((prev) => ({
                ...prev,
                queued: prev.queued.filter((other) => other.id !== id),
            }));

            if (item?.fromNewQuestion !== undefined) {
                offerNewQuestion(item.fromNewQuestion, item.text);
            }
        },
        [offerNewQuestion],
    );

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
                            : endTurn(after, turn, activity, hasAnswer(prev.messages, turn));
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
            asked?: string,
        ) => {
            const conversation = sessionRef.current;
            const pending = pendingInterruptRef.current;
            const after = answeredPause(pending);
            const turn = pauseTurnRef.current;

            // With no session there is no pause to answer: the card goes and
            // no line says the turn goes on.
            if (!conversation) {
                pendingInterruptRef.current = null;
                setState((prev) => ({
                    ...prev,
                    ...NO_LINE,
                    thinking: false,
                    clarify: null,
                    plan: null,
                }));

                return;
            }

            pendingInterruptRef.current = after;

            setState((prev) => ({
                // The decision shows on the status line; the user's answer
                // also stays in the transcript, once (a repeated click finds
                // no pause left to answer), before the paused turn's reply.
                ...withLine(prev, note ? plainTextFromNote(note) : 'Thinking'),
                messages:
                    answer && pending
                        ? withAnswer(
                              prev.messages,
                              answer,
                              pageTurnReplyAt(prev.messages, turn),
                              asked,
                          )
                        : prev.messages,
                thinking: true,
                clarify: null,
                plan: after?.plan ?? null,
            }));

            if (!pending) {
                return;
            }

            const start = (handlers: StreamHandlers, signal: AbortSignal) =>
                runInterrupt(conversation, pending.interruptId, reply, handlers, signal);

            if (after?.plan) {
                streamSwitch(turn, after.plan, start);

                return;
            }

            stream(turn, start, {
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

            resume(
                clarifyReply(clarify, answers),
                `_${note}_`,
                clarifyAnswer(clarify, answers),
                clarify.questions.map((question) => question.question).join(' '),
            );
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
            const turn = pauseTurnRef.current;

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
                    whileBusy(
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
                                hasAnswer(prev.messages, turn),
                            ),
                        );

                        return true;
                    },
                },
            );
        },
        [holdTurn, startTurn, stream],
    );

    // A card change: a turn that redraws one card with no message and no
    // model reply, for its unit (applyUnit) or its years or places
    // (applyChange). The transcript shows the change under the card's tag,
    // marked `edit` with the card, the row and the role. The harness redraws
    // the card under a new id that `replaces` the old one, which keeps the
    // old card's slot, turn and settings, so the answer's other cards stay
    // on the canvas. A change asked while a request is in flight waits in
    // the queue. A change the harness refuses leaves the reply saying why,
    // and a refusal as stale clears the card's offer (`clearStale`).
    const applyEdit = useCallback(
        ({
            text,
            title,
            componentId,
            edit,
            line,
            queued,
            run,
            refusalDetail,
            clearStale,
        }: {
            text: string;
            title: string;
            componentId: string;
            edit: NonNullable<Extract<ChatMessage, { role: 'user' }>['edit']>;
            line: string;
            queued: Pick<QueuedMessage, 'unit' | 'change'>;
            run: (
                conversation: string,
                handlers: StreamHandlers,
                signal: AbortSignal,
            ) => Promise<void>;
            refusalDetail: (refusal: StreamRefusal) => { detail: string; stale: boolean } | null;
            clearStale: (widget: TurnWidget) => TurnWidget;
        }) => {
            const card = { title };

            // A new change to the row replaces the note of one the queue
            // dropped.
            setState((prev) =>
                prev.dropped.length === 0
                    ? prev
                    : {
                          ...prev,
                          dropped: prev.dropped.filter(
                              (item) =>
                                  item.card !== edit.card ||
                                  item.row !== edit.row ||
                                  item.role !== edit.role,
                          ),
                      },
            );

            if (
                holdTurn({
                    text,
                    card: { componentId, intent: 'edit', ...card },
                    ...queued,
                })
            ) {
                return;
            }

            const { turn, conversation } = startTurn({ role: 'user', text, card, edit }, line, {
                keepPause: true,
            });

            editingRef.current = componentId;
            unitTurnRef.current = true;

            // The harness admitted the turn once it names it, or once a frame
            // other than an error arrives from a harness that names none (a
            // request that failed before any turn opened ends in an error
            // frame).
            let admitted = false;
            const admit = () => {
                if (admitted) return;

                admitted = true;
                dropPause();
            };

            stream(
                turn,
                (handlers, signal) =>
                    whileBusy(
                        (busyHandlers) => run(conversation, busyHandlers, signal),
                        {
                            ...handlers,
                            onTurnIndex: (index) => {
                                admit();
                                handlers.onTurnIndex?.(index);
                            },
                            onFrame: (frame) => {
                                if (frame.event !== 'error') admit();

                                handlers.onFrame(frame);
                            },
                        },
                        signal,
                    ),
                {
                    metered: true,
                    onRefusal: (refusal) => {
                        const refused = refusalDetail(refusal);

                        if (refused === null) {
                            return false;
                        }

                        if (refused.stale) {
                            patchWidget(componentId, clearStale);
                        }

                        setState((prev) => {
                            const messages = prev.messages.slice();
                            const last = messages.at(-1);

                            if (last?.role === 'bot' && !last.text) {
                                messages[messages.length - 1] = {
                                    ...last,
                                    text: `_${refused.detail}_`,
                                };
                            }

                            return endTurn(
                                { ...prev, messages },
                                turn,
                                'failed',
                                hasAnswer(prev.messages, turn),
                            );
                        });

                        return true;
                    },
                },
            );
        },
        [dropPause, holdTurn, patchWidget, startTurn, stream],
    );

    // A card's Change unit. A refusal is a 422 under `/apply_unit`.
    const applyUnit = useCallback(
        (change: CardUnitChange) =>
            applyEdit({
                text: changeUnitText(change),
                title: change.title,
                componentId: change.request.component_id,
                edit: { card: change.request.component_id, row: 'unit' },
                line: `Switching to ${changeUnitText(change)}`,
                queued: { unit: change },
                run: (conversation, handlers, signal) =>
                    runApplyUnit(conversation, change.request, handlers, signal),
                refusalDetail: (refusal) => {
                    const detail = unitRefusalDetail(refusal);

                    return detail === null ? null : { detail, stale: unitRefusalStale(refusal) };
                },
                clearStale: (widget) =>
                    widget.kind === 'text' ? widget : { ...widget, unitChange: undefined },
            }),
        [applyEdit],
    );

    // A card's change of years or places. A refusal is a 422 under
    // `/apply_change`, or the 503 of a places change whose list the harness
    // could not read.
    const applyChange = useCallback(
        (change: CardChangeRequest) =>
            applyEdit({
                text: change.words,
                title: change.title,
                componentId: change.request.component_id,
                edit: {
                    card: change.request.component_id,
                    row: change.row,
                    ...(change.role !== undefined && { role: change.role }),
                },
                line: `Redrawing for ${change.words}`,
                queued: { change },
                run: (conversation, handlers, signal) =>
                    runApplyChange(conversation, change.request, handlers, signal),
                refusalDetail: (refusal) => {
                    const detail = changeRefusalDetail(refusal);

                    return detail === null ? null : { detail, stale: changeRefusalStale(refusal) };
                },
                clearStale: (widget) =>
                    widget.kind === 'text' ? widget : { ...widget, cardChanges: undefined },
            }),
        [applyEdit],
    );

    // The places role `role` of card `componentId` can change to, read through
    // the harness once per card and role (placeListsRef). Without a
    // conversation there is nothing to read. Callers share a read, and each
    // passes `signal` to leave it: its own promise then rejects, and the read
    // stops once every caller has left. Past PLACES_READ_MS the read answers
    // as no answer.
    const placeOptions = useCallback(
        (componentId: string, role: string, signal?: AbortSignal): Promise<PlaceOptionsRead> => {
            const key = `${componentId}\n${role}`;
            const lists = placeListsRef.current;
            const conversation = sessionRef.current;
            let held = lists.get(key);

            if (!held) {
                if (!conversation) {
                    return Promise.resolve({
                        kind: 'failed',
                        status: null,
                        code: null,
                        detail: null,
                        retry: false,
                    });
                }

                const stop = new AbortController();
                const forget = () => {
                    if (lists.get(key) === entry) lists.delete(key);
                };
                const entry: PlaceRead = {
                    stop,
                    callers: 0,
                    read: runPlaceOptions(
                        conversation,
                        componentId,
                        role,
                        AbortSignal.any([stop.signal, AbortSignal.timeout(PLACES_READ_MS)]),
                    ).then(
                        (answer) => {
                            if (answer.kind !== 'options') forget();

                            return answer;
                        },
                        (error: unknown) => {
                            forget();

                            throw error;
                        },
                    ),
                };

                lists.set(key, entry);
                held = entry;
            }

            if (!signal) return held.read;

            const shared = held;

            shared.callers += 1;

            return new Promise((resolve, reject) => {
                let left = false;
                // Each caller counts once, whether the read ends or it
                // leaves first; returns whether this call ended it.
                const settle = (): boolean => {
                    if (left) return false;

                    left = true;
                    signal.removeEventListener('abort', leave);
                    shared.callers -= 1;

                    return true;
                };
                const leave = () => {
                    if (!settle()) return;

                    if (shared.callers === 0) {
                        shared.stop.abort();

                        if (lists.get(key) === shared) lists.delete(key);
                    }

                    reject(signal.reason);
                };

                if (signal.aborted) {
                    leave();

                    return;
                }

                signal.addEventListener('abort', leave, { once: true });
                shared.read.then(
                    (answer) => {
                        if (settle()) resolve(answer);
                    },
                    (error: unknown) => {
                        if (settle()) reject(error);
                    },
                );
            });
        },
        [],
    );

    const admitHandedBackRef = useRef(admitHandedBack);

    useEffect(() => {
        admitHandedBackRef.current = admitHandedBack;
    }, [admitHandedBack]);

    // The queue head goes next, unless a pause (plan or clarify) is waiting
    // on the user: a new turn would abandon it, so the answer goes first.
    // A handed-back question goes through the page's prompt gate, which the
    // user's own prompts passed when they were queued; one the gate refuses
    // is offered on its turn's reply, as a question taken out of the queue
    // is, and the next item goes.
    useEffect(() => {
        // The card standing in the place of card `id` now (currentCard): the
        // latest of its replacements the canvas holds, read from what the
        // frames applied so far placed, also those in the chunk that ended
        // the turn. Null once a question took the chain off the canvas. A
        // legacy canvas names no cards here, so every held card counts.
        const standingCard = (id: string): TurnWidget | null =>
            currentCard(
                id,
                widgetsRef.current,
                replacedRef.current,
                canvasRef.current && !legacyRef.current ? new Set(canvasRef.current.ids) : null,
            );

        // A queued card change goes to the card standing in its card's place
        // when its turn comes, rebuilt from that card's offer, since an
        // earlier turn may have replaced the card. One the standing card
        // does not take is dropped, with the reason on its row, and the
        // queue goes on.
        const sendQueuedChange = ({ unit, change }: QueuedMessage) => {
            const asked = unit?.request.component_id ?? change?.request.component_id;

            if (asked === undefined) return;

            const standing = standingCard(asked);

            if (unit) {
                const ready = standing && retargetUnitChange(unit, standing);

                if (ready) {
                    applyUnit(ready);

                    return;
                }
            } else if (change) {
                const ready = standing && retargetChange(change, standing);

                if (ready) {
                    applyChange(ready);

                    return;
                }
            }

            const words = unit ? changeUnitText(unit) : (change?.words ?? '');
            const drop: DroppedChange = {
                card: standing?.id ?? asked,
                row: unit ? 'unit' : (change?.row ?? 'years'),
                ...(change?.role !== undefined && { role: change.role }),
                detail: standing
                    ? `The card changed before this change went, and it does not offer ${words}.`
                    : 'The card left the canvas before this change went.',
            };

            setState((prev) => ({ ...prev, dropped: [...prev.dropped, drop] }));
            drainRef.current();
        };

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
            } else if (next.unit || next.change) {
                sendQueuedChange(next);
            } else if (next.handedBack && next.fromNewQuestion !== undefined) {
                const turnIndex = next.fromNewQuestion;
                const sendNext = () =>
                    send(next.text, next.card, next.seeds, turnIndex, next.source);
                const gate = admitHandedBackRef.current;

                if (!gate) {
                    sendNext();
                } else if (!gate(next.text, queueRef.current.length, sendNext)) {
                    offerNewQuestion(turnIndex, next.text);
                    drainRef.current();
                }
            } else {
                send(next.text, next.card, next.seeds, next.fromNewQuestion, next.source);
            }
        };
    }, [applyChange, applyChoice, applyUnit, offerNewQuestion, send]);

    // The Stop control: end the running turn (see `halt` in stream()), which
    // asks the harness to cancel once per stream, as soon as the harness has
    // named the turn. On a switch, a second cancel would end the stream
    // before the harness re-offers the plan.
    const stop = useCallback(() => {
        haltRef.current?.();
    }, []);

    // The card reads in flight (drawCards), by id and revision, so reads
    // that overlap ask for each once.
    const cardReadsRef = useRef(new Set<string>());
    // Draw the cards a state read's manifest names that the page lacks: one
    // it never saw (another tab's turn drew it, or a turn the page was not
    // streaming), and one it holds at an older revision (drawManifestCards).
    // Each is drawn as its frame would have drawn it (widgetFromRead), and a
    // new one is kept on a legacy canvas as a streamed card is. A new card
    // joins the turn that made it, when `turnOf` names that turn, else the
    // latest, and one a card change turn (`changes`, changeTurns) drew in
    // another card's place keeps that card's turn, as on the stream. A read
    // answered after a newer revision arrived, or after a reset, is dropped,
    // and a failed one leaves the card for the next state read.
    const drawCards = useCallback(
        (
            manifest: CompositionManifest,
            turnOf: ReadonlyMap<string, number>,
            stored: ReadonlyMap<string, StoredCard>,
            turnOpen: boolean,
            changes: ReadonlySet<number>,
        ) => {
            const generation = generationRef.current;
            const sessionLeft = sessionLeftRef.current;
            const onCanvas = new Set(manifest.blocks.map((block) => block.component_id));

            void drawManifestCards({
                manifest,
                held: revisionsRef.current,
                seen: new Set(widgetsRef.current.map((widget) => widget.id)),
                inFlight: cardReadsRef.current,
                isCurrent: () =>
                    generationRef.current === generation && sessionLeftRef.current === sessionLeft,
                keep: (id) => legacyRef.current?.keep(id),
                onDrawn: (block, read) => {
                    const id = block.component_id;
                    const card = stored.get(id);
                    const isNew = !widgetsRef.current.some((widget) => widget.id === id);
                    // The card a new card took the slot of, as its frame's
                    // `replaces` would have said (replacedCard): one the page
                    // holds and the manifest lacks.
                    const from = isNew
                        ? replacedCard(
                              id,
                              stored,
                              (other) =>
                                  !onCanvas.has(other) &&
                                  widgetsRef.current.some((widget) => widget.id === other),
                          )
                        : null;

                    if (from) replacedRef.current = { ...replacedRef.current, [id]: from };

                    // A card of a turn still open has no stored card yet.
                    // The read that closes the turn brings it
                    // (reconcileStoredCards).
                    if (isNew && !card && turnOpen) {
                        awaitingStoredRef.current.add(id);
                    }

                    setWidgets((widgets) => {
                        const held = widgets.find((widget) => widget.id === id);
                        const widget = widgetFromRead(block, read, held, card);

                        if (!widget) {
                            return widgets;
                        }

                        if (held) {
                            return widgets.map((other) =>
                                other.id === id
                                    ? {
                                          ...widget,
                                          turn: held.turn,
                                          ...recordOf(held),
                                      }
                                    : other,
                            );
                        }

                        const turn = turnOf.get(id) ?? turnCount.current;

                        return placeCard(
                            widgets,
                            { ...widget, turn },
                            { replaces: from, keepTurn: changes.has(turn), values: rowValues },
                        );
                    });

                    // The canvas moves the old card's settings to it, as on
                    // the stream.
                    if (from && widgetFromRead(block, read, undefined, card)) {
                        legacyRef.current?.drop(from);
                        onCardReplacedRef.current?.(from, id);
                    }
                },
            });
        },
        [setWidgets],
    );

    // Bring the cards drawn from a read before their turn closed to what
    // their frames would have drawn, once `read` carries their stored cards
    // (`stored`, reconcileStoredCards): the unit offer, and the slot,
    // settings and, for a card change turn (`changes`), the turn of the card
    // each replaced.
    const reconcileCards = useCallback(
        (
            read: ConversationRead,
            stored: ReadonlyMap<string, StoredCard>,
            changes: ReadonlySet<number>,
        ) => {
            // A card whose drawn widget the page does not hold yet waits on
            // while a turn is open. A read with no open turn closed every
            // turn, so after it no card waits: one it carries is reconciled
            // here or drawn from its stored card, and one it does not carry
            // gets none.
            const ids = [...awaitingStoredRef.current].filter(
                (id) => stored.has(id) && widgetsRef.current.some((widget) => widget.id === id),
            );

            if (!isOpenTurn(read)) {
                awaitingStoredRef.current.clear();
            }

            if (ids.length === 0) {
                return;
            }

            const onCanvas = new Set(
                read.manifest?.blocks.map((block) => block.component_id) ??
                    canvasRef.current?.ids ??
                    [],
            );
            const { widgets, replaced } = reconcileStoredCards(
                widgetsRef.current,
                stored,
                ids,
                onCanvas,
                changes,
            );

            ids.forEach((id) => awaitingStoredRef.current.delete(id));
            setWidgets(() => widgets);

            for (const [from, to] of replaced) {
                replacedRef.current = { ...replacedRef.current, [to]: from };
                legacyRef.current?.drop(from);
                onCardReplacedRef.current?.(from, to);
            }
        },
        [setWidgets],
    );

    // Merge a state read into the conversation. The harness's closed turns
    // the page does not hold join the transcript (mergeClosedTurns), each
    // with a closed Activity entry, and its manifest says which cards are on
    // the canvas, the ones the page lacks drawn from their reads
    // (drawCards). A latest turn ended by a new question no tab has sent yet
    // queues it (owedNewQuestion), as that turn's `done` would have, and a
    // send of it the harness never admitted leaves the transcript.
    // Returns the transcript with the read's closed turns merged in.
    const takeRead = useCallback(
        (read: ConversationRead): ChatMessage[] => {
            const before = messagesRef.current;
            const owed = owedNewQuestion(read, before);
            const firstTurn = turnCount.current + 1;
            const { messages: merged, appended } = mergeClosedTurns(
                before,
                read.closed_since,
                firstTurn,
            );
            const now = Date.now();

            turnCount.current += appended.length;

            // Each card a closed turn made is filed under that turn, whether
            // the page held it or the read appended it.
            const turnOf = cardTurns(merged, read.closed_since);
            const stored = storedCards(read.closed_since);
            const changes = changeTurns(merged);

            reconcileCards(read, stored, changes);

            // The approvals of the turns the read names, the open one's
            // included when the page holds it (reattach adds one it lacks).
            const approvals = [
                ...read.closed_since.map((turn) => [turn.turn_index, turn.approved] as const),
                ...(read.turn ? [[read.turn.index, read.turn.approved] as const] : []),
            ].filter(([, approved]) => approved?.length);
            const heldApprovals = approvalsRef.current;
            const approve = (messages: ChatMessage[]) => {
                const seen = new Set(heldApprovals);

                return approvals.reduce(
                    (current, [index, approved]) =>
                        withTurnApprovals(current, index, approved, seen),
                    messages,
                );
            };

            approvalsRef.current = new Set([
                ...heldApprovals,
                ...approvals.flatMap(([index, approved]) => turnApprovalKeys(index, approved)),
            ]);
            setState((prev) => {
                const { messages: closed } = mergeClosedTurns(
                    prev.messages,
                    read.closed_since,
                    firstTurn,
                );
                const messages = approve(closed);

                return messages === prev.messages
                    ? prev
                    : {
                          ...prev,
                          messages,
                          activity: [
                              ...prev.activity,
                              ...appended.map((turn, at) => ({
                                  turn: firstTurn + at,
                                  prompt: recordedPromptText(turn.user_message),
                                  startedAt: now,
                                  endedAt: now,
                                  tools: [],
                              })),
                          ],
                      };
            });

            if (owed?.tried) {
                // Sent once and never admitted: the user sends it, if at all.
                askedRef.current.add(owed.turnIndex);
                offerNewQuestion(owed.turnIndex, owed.text);
            } else if (owed && !askedRef.current.has(owed.turnIndex)) {
                // A turn the page held keeps the typed text as its answer
                // until the next turn opens with it.
                const held = owed.turnIndex <= heldTurns(before);

                setState((prev) => ({
                    ...prev,
                    messages: withOwedQuestion(prev.messages, owed.turnIndex, owed.text, held),
                }));
                askNewQuestion(owed.turnIndex, owed.text);
            }

            if (read.manifest) {
                applyManifest(read.manifest);
                drawCards(read.manifest, turnOf, stored, isOpenTurn(read), changes);
            }

            return merged;
        },
        [applyManifest, askNewQuestion, drawCards, offerNewQuestion, reconcileCards],
    );

    // The user's canvas edit, sent to the harness (syncCanvas).
    const editCanvas = useCallback(
        (operations: MutationOperation[]) => {
            void syncCanvas(operations);
        },
        [syncCanvas],
    );
    // Read the harness's state again after an owed removal's resend met a
    // canvas that had moved on, and take it (takeRead). While a request is
    // in flight, a read can lack the turn a prompt's POST is opening, so the
    // page takes only the manifest and draws the cards the page holds or
    // whose turn the transcript holds, leaving the rest to the next read.
    // True when the page took a newer canvas.
    const rereadCanvas = useCallback(
        async (session: string): Promise<boolean> => {
            const generation = generationRef.current;
            const sessionLeft = sessionLeftRef.current;
            const before = canvasRef.current;
            const answer = await readConversation(
                session,
                readSince(messagesRef.current),
                AbortSignal.timeout(REREAD_TIMEOUT_MS),
            ).catch(() => null);

            if (
                generationRef.current !== generation ||
                sessionLeftRef.current !== sessionLeft ||
                sessionRef.current !== session ||
                !answer ||
                isStateRefusal(answer)
            ) {
                return false;
            }

            if (inFlightRef.current === 0) {
                takeRead(answer);
            } else if (answer.manifest) {
                const turnOf = cardTurns(messagesRef.current, answer.closed_since);
                const held = new Set(widgetsRef.current.map((widget) => widget.id));

                applyManifest(answer.manifest);
                drawCards(
                    {
                        ...answer.manifest,
                        blocks: answer.manifest.blocks.filter(
                            (block) =>
                                held.has(block.component_id) || turnOf.has(block.component_id),
                        ),
                    },
                    turnOf,
                    storedCards(answer.closed_since),
                    isOpenTurn(answer),
                    changeTurns(messagesRef.current),
                );
            }

            return canvasRef.current !== before;
        },
        [applyManifest, drawCards, takeRead],
    );
    // Each canvas the page takes settles the owed removals it confirms
    // (settle), and the ones the harness still holds go again, one card at a
    // time and each against the canvas's revision when the edit queue
    // reaches it (drainOwedRemovals), so one card the harness has dropped
    // since refuses no other card's removal. One run goes at a time per
    // conversation, and it reads the set and the canvas afresh before each
    // send. A run that left cards behind runs again after a wait that
    // doubles with each such run in a row (owedRetryAfter). A reopened page
    // holds them until it has taken the harness's state (`owedHeld`).
    const drainingRef = useRef<number | null>(null);
    const [owedRetryTick, setOwedRetryTick] = useState(0);

    useEffect(() => {
        // One object for the hook's life, whose latest timer the cleanup
        // clears.
        const retry = owedRetryRef.current;

        unmountedRef.current = false;

        return () => {
            unmountedRef.current = true;
            clearTimeout(retry.timer);
        };
    }, []);

    useEffect(() => {
        const settled = settle(owedRef.current, canvas, revisionsRef.current);

        if (settled !== owedRef.current) {
            setOwed(() => settled);
        }

        const session = sessionRef.current;
        const generation = generationRef.current;
        // The session the run sends in, which leaveSession ends whether or
        // not it keeps the id.
        const sessionLeft = sessionLeftRef.current;

        if (!session || owedHeld || drainingRef.current === generation) {
            return;
        }

        drainingRef.current = generation;
        clearTimeout(owedRetryRef.current.timer);
        void drainOwedRemovals({
            next: (skip) => {
                if (
                    unmountedRef.current ||
                    generationRef.current !== generation ||
                    sessionLeftRef.current !== sessionLeft ||
                    sessionRef.current !== session
                ) {
                    return null;
                }

                const current = settle(owedRef.current, canvasRef.current, revisionsRef.current);

                if (current !== owedRef.current) {
                    setOwed(() => current);
                }

                return nextResend({
                    owed: current,
                    baseline: canvasRef.current,
                    inFlight: removingRef.current,
                    sent: resentRef.current,
                    held: owedHeldRef.current,
                    skip,
                });
            },
            send: ({ id, against }) =>
                syncCanvas([{ op: 'remove', component_id: id }], () =>
                    againstWhenSent({
                        id,
                        against,
                        owed: owedRef.current,
                        baseline: canvasRef.current,
                        drawn: revisionsRef.current,
                    }),
                ),
            reread: () => rereadCanvas(session),
            sent: resentRef.current,
            onCapped: (id, outcome) => {
                console.warn(
                    'Studio: this card stays owed removal until the conversation is reopened',
                    id,
                    outcome,
                );
            },
        })
            .then((left) => {
                // A page that left the session, by this run's own resend
                // among others, owes the harness nothing more there.
                if (
                    unmountedRef.current ||
                    generationRef.current !== generation ||
                    sessionLeftRef.current !== sessionLeft
                ) {
                    return;
                }

                const retry = owedRetryRef.current;

                retry.runs = left.length === 0 ? 0 : retry.runs + 1;

                const wait = owedRetryAfter(retry.runs);

                if (wait !== null) {
                    retry.timer = setTimeout(() => setOwedRetryTick((tick) => tick + 1), wait);
                }
            })
            .finally(() => {
                if (drainingRef.current === generation) {
                    drainingRef.current = null;
                }
            });
    }, [canvas, owedHeld, owedRemovals, owedRetryTick, rereadCanvas, setOwed, syncCanvas]);

    // Bring a reopened conversation up to the harness's copy (see
    // conversationState.ts). Its closed turns, read from the lowest one the
    // transcript lacks (readSince) up to `closed_total`, merge in along with
    // its canvas. A save from before prompts carried their turn is read from
    // turn 0 and keyed against every turn the harness recorded
    // (keyUnkeyedSave) first. A pause comes back as its card, and a running
    // turn is carried on (carryOnTurn). An open turn the snapshot never got
    // joins the transcript as its prompt and an empty reply (ensureTurn),
    // with its own Activity entry. Sends made while the state is read wait
    // for it, as they wait for a stream. Called after hydrate(), for a
    // signed-in user's own conversation. The proxy answers 404 for anyone
    // else, and the page then keeps its snapshot.
    const reattach = useCallback(() => {
        // The cards the page holds from the read's open turn: those of the
        // page turn whose prompt holds it.
        const openTurnCards = (answer: ConversationRead): string[] => {
            const messages = messagesRef.current;
            const at = [...promptTurns(messages)].find(
                ([, index]) => index === answer.turn?.index,
            )?.[0];
            const prompt = at === undefined ? undefined : messages[at];
            const turn = prompt?.role === 'user' ? prompt.turn : undefined;

            return widgetsRef.current
                .filter((widget) => turn !== undefined && widget.turn === turn)
                .map((widget) => widget.id);
        };
        const conversation = sessionRef.current;

        if (!conversation) {
            return;
        }

        const generation = generationRef.current;

        // Carry on the read's open turn (carryOnTurn) in a stream bound to
        // the reply of the prompt that holds it, `merged` being the
        // transcript with the read's closed turns in. An open turn the
        // transcript lacks joins it first. The stream carries the turn the
        // read names (`carries`), which counts as this page's own while the
        // harness grants its resume and as another tab's while the page waits
        // on that tab's stream. A poll that finds a later turn open, begun by
        // another tab once this one closed, ends this turn and comes back
        // here for that one, unless the user stopped the stream. A poll that
        // finds this turn closed and no later one open yet ends the stream.
        const follow = (read: ConversationRead, merged: ChatMessage[]) => {
            const step = attachStep(read);

            if (generationRef.current !== generation || step.kind === 'none') {
                return;
            }

            const held = heldTurns(merged);
            // The page turn of the prompt that holds the open turn.
            const holding = [...promptTurns(merged)].findLast(
                ([, index]) => index === step.turnIndex,
            )?.[0];
            const holder = holding === undefined ? undefined : merged[holding];
            let streamTurn = holder?.role === 'user' ? holder.turn : undefined;

            // A held open turn streams into its own reply, also when an
            // unsent prompt follows it (pageTurnReplyAt).
            if (step.turnIndex > held) {
                const prompt = recordedPromptText(read.turn?.user_message ?? '');

                turnCount.current += 1;

                const turn = turnCount.current;

                streamTurn = turn;

                // The turn's approvals ride on its reply, as the stream
                // would have put them.
                const approved = read.turn?.approved;

                approvalsRef.current = new Set([
                    ...approvalsRef.current,
                    ...turnApprovalKeys(step.turnIndex, approved),
                ]);
                setState((prev) => ({
                    ...prev,
                    messages: withTurnApprovals(
                        ensureTurn(
                            prev.messages,
                            step.turnIndex,
                            prompt,
                            turn,
                            read.turn?.card_change,
                        ),
                        step.turnIndex,
                        approved,
                        new Set(),
                    ),
                    activity: [
                        ...prev.activity,
                        { turn, prompt, startedAt: Date.now(), tools: [] },
                    ],
                }));
            }

            if (step.kind !== 'pause') {
                setState((prev) => ({
                    ...withLine(prev, WORKING),
                    thinking: true,
                }));
            }

            // A card change carried on places its card as the page's own
            // change would have: in the changed card's slot and turn.
            const change = read.turn?.index === step.turnIndex ? read.turn.card_change : undefined;

            unitTurnRef.current = !!change;
            editingRef.current = change?.component_id ?? null;

            stream(
                streamTurn ?? turnCount.current,
                (handlers, signal, { stopped, carry }) => {
                    // The transcript with the stream's latest read merged in.
                    let latest = merged;
                    // Whether a poll handed the page on to a later turn.
                    let handedOn = false;
                    // The session the turn runs in, which leaveSession ends.
                    const sessionLeft = sessionLeftRef.current;

                    return carryOnTurn({
                        conversationId: conversation,
                        first: step,
                        handlers,
                        signal,
                        since: () => readSince(messagesRef.current),
                        onRead: (next) => {
                            latest = takeRead(next);
                        },
                        onNextTurn: (next) => {
                            handedOn = true;

                            if (!stopped() && !signal.aborted) {
                                follow(next, latest);
                            }
                        },
                        onCarry: carry,
                    }).then(async () => {
                        // A card drawn from a read while the turn ran waits
                        // for its stored card, which only a read brings
                        // (reconcileCards). A turn that ended on this
                        // stream's own `done` gets that read here. A hand-off
                        // took the read that found the next turn, and a page
                        // that left the session reads it no more.
                        const current = () =>
                            !signal.aborted &&
                            generationRef.current === generation &&
                            sessionLeftRef.current === sessionLeft &&
                            sessionRef.current === conversation;

                        if (handedOn || awaitingStoredRef.current.size === 0 || !current()) {
                            return;
                        }

                        const answer = await readConversation(
                            conversation,
                            readSince(messagesRef.current),
                            signal,
                        );

                        if (answer && !isStateRefusal(answer) && current()) {
                            takeRead(answer);
                        }
                    });
                },
                { carries: step.turnIndex },
            );
        };

        // The read waits behind any request in flight, as a turn does, so it
        // never reads the harness while a prompt's POST is on its way: such a
        // read lacks that turn and would mark its prompt unsent. Counting it
        // in flight at once holds the sends made meanwhile behind it.
        const readHarness = () => {
            if (generationRef.current !== generation) {
                return;
            }

            const unkeyed = isUnkeyedSave(messagesRef.current);
            // A legacy canvas waits for the cards every turn of the session
            // drew, so its read starts at turn 0.
            const produced = producedRef.current;
            let read: ConversationRead | null = null;

            producedRef.current = null;

            return readConversation(
                conversation,
                unkeyed || produced ? 0 : readSince(messagesRef.current),
            )
                .then((answer) => {
                    if (generationRef.current !== generation) {
                        return;
                    }

                    if (!answer || isStateRefusal(answer)) {
                        produced?.(null);

                        // A 401 keeps the conversation the page holds.
                        if (answer?.refusal === 'session_gone') {
                            leaveSession();
                        }

                        return;
                    }

                    read = answer;

                    const open = answer.turn;
                    const recorded = [
                        ...answer.closed_since,
                        ...(open &&
                        open.user_message !== undefined &&
                        !answer.closed_since.some((turn) => turn.turn_index === open.index)
                            ? [{ turn_index: open.index, user_message: open.user_message }]
                            : []),
                    ];

                    // The prompts saved before prompts carried their turn are
                    // keyed first (keyUnkeyedSave). A prompt saved before its
                    // stream named its turn then takes the turn after the ones
                    // the page holds only where the read confirms it; the rest
                    // the harness lacks show as unsent (withReadPrompts).
                    const keyed = (messages: ChatMessage[]) =>
                        withReadPrompts(keyUnkeyedSave(messages, recorded), recorded);

                    messagesRef.current = keyed(messagesRef.current);
                    setState((prev) => ({ ...prev, messages: keyed(prev.messages) }));
                    produced?.(producedCards(answer, openTurnCards(answer)));
                })
                .finally(() => {
                    if (generationRef.current !== generation) {
                        return;
                    }

                    inFlightRef.current -= 1;

                    if (read) {
                        setOwedHeld(false);
                        follow(read, takeRead(read));
                    }

                    drainRef.current();
                });
        };

        inFlightRef.current += 1;
        chainRef.current = chainRef.current.then(readHarness).catch((error: unknown) => {
            console.error('studio: the harness state read failed', error);
        });
    }, [leaveSession, setOwedHeld, stream, takeRead]);

    useEffect(() => {
        reattachRef.current = reattach;
    }, [reattach]);

    // Leave the stream whose request runs (RunningStream's `leave`), in the
    // session the page holds. True when its request stays open.
    const leaveStream = useCallback((): boolean => {
        const running = runningRef.current;
        const session = sessionRef.current;

        runningRef.current = null;

        return running !== null && session !== null && running.leave(session);
    }, []);

    const reset = useCallback(() => {
        // Ask the harness to stop the turn this page carries, naming it
        // (closing the fetch reaches it late, or not at all, through the
        // proxy), then leave the old request and its queue behind on a fresh
        // chain. A turn this page only watches, or a state read, ends here
        // alone. A request the harness has not answered stays open until it
        // names its turn, which is then cancelled (RunningStream).
        // A kept request closes itself (RunningStream), so a later leave
        // must not close it first.
        if (leaveStream()) {
            abortRef.current = null;
        } else {
            abortRef.current?.abort();
        }

        generationRef.current += 1;
        chainRef.current = Promise.resolve();
        inFlightRef.current = 0;
        queueRef.current = [];
        sessionRef.current = null;
        revisionsRef.current.clear();
        canvasRef.current = null;
        setCanvas(null);
        legacyRef.current = null;
        setLocalCards(NO_LOCAL);
        setPendingPins(new Map());
        setPendingCards(() => new Map());
        setOwed(() => []);
        removingRef.current.clear();
        resentRef.current.clear();
        clearTimeout(owedRetryRef.current.timer);
        owedRetryRef.current.runs = 0;
        setOwedHeld(false);
        awaitingStoredRef.current.clear();
        askedRef.current.clear();
        cardReadsRef.current.clear();
        canvasEditsRef.current?.reset();
        turnCount.current = 0;
        approvalsRef.current = new Set();
        messagesRef.current = [];
        widgetsRef.current = [];
        replacedRef.current = {};
        pendingInterruptRef.current = null;
        turnPlanRef.current = null;
        recapRef.current = null;
        setState({
            messages: [],
            widgets: [],
            queued: [],
            dropped: [],
            activity: [],
            ...NO_LINE,
            thinking: false,
            clarify: null,
            plan: null,
        });
    }, [leaveStream, setOwed, setOwedHeld, setPendingCards]);

    const hydrate = useCallback(
        (saved: ChatSnapshot) => {
            // As in reset(): ask the harness to stop the turn this page
            // carries, abandon the old chain and queue.
            if (leaveStream()) {
                abortRef.current = null;
            } else {
                abortRef.current?.abort();
            }

            generationRef.current += 1;
            chainRef.current = Promise.resolve();
            inFlightRef.current = 0;
            queueRef.current = [];
            replacedRef.current = replacementsOf(saved.widgets);
            pendingInterruptRef.current = null;
            turnPlanRef.current = null;
            sessionRef.current = saved.sessionId;
            revisionsRef.current = restoreCardRevisions(saved);
            canvasRef.current = restoreCanvas(saved);
            setCanvas(canvasRef.current ?? saved.canvas ?? null);
            startLegacy(saved, canvasRef.current);
            setLocalCards(NO_LOCAL);
            setPendingPins(new Map());
            setPendingCards(() => new Map());
            askedRef.current.clear();
            cardReadsRef.current.clear();
            canvasEditsRef.current?.reset();
            recapRef.current = saved.sessionId ? null : sessionRecap(saved.messages);
            // Set at once, since reattach() reads it before the next render.
            messagesRef.current = restoredMessages(saved);
            turnCount.current = restoredTurnCount(saved.turnCount, messagesRef.current);
            approvalsRef.current = approvalKeys(messagesRef.current);
            widgetsRef.current = restoredWidgets(saved);
            setState({
                messages: messagesRef.current,
                widgets: widgetsRef.current,
                queued: [],
                dropped: [],
                activity: restoreActivity(saved.activity),
                ...NO_LINE,
                thinking: false,
                clarify: null,
                plan: null,
            });

            // The removals the save owes the harness (owedRemovalsOf), which
            // go again once the page holds the canvas (the effect above).
            removingRef.current.clear();
            resentRef.current.clear();
            clearTimeout(owedRetryRef.current.timer);
            owedRetryRef.current.runs = 0;
            awaitingStoredRef.current.clear();
            setOwed(() => owedRemovalsOf(saved));
            // The saved canvas can be older than the harness's, so the owed
            // removals wait for reattach's read before any goes again.
            setOwedHeld(saved.sessionId !== null);
        },
        [leaveStream, setOwed, setOwedHeld, setPendingCards, startLegacy],
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
            owedRemovals: owedRef.current,
        }),
        [],
    );

    return {
        ...state,
        // Why the card pages' Change rows wait, or null (changesHeld).
        changesHeld: changesHeld(state.plan, state.clarify),
        droppedRefunds,
        localCards,
        syncCanvas: editCanvas,
        // The harness's manifest as the page holds it, and the user's
        // unanswered adds and removes, which editedCanvasCards shows on it.
        canvas,
        pendingCards,
        // The harness cards owed removal, which every canvas this page draws
        // or saves leaves off (canvasWidgetsOf).
        owedRemovals,
        pins,
        send,
        unqueue,
        answerClarify,
        skipClarify,
        respondPlan,
        switchChoice,
        applyChoice,
        applyUnit,
        applyChange,
        placeOptions,
        stop,
        reset,
        hydrate,
        reattach,
        snapshot,
    };
};
