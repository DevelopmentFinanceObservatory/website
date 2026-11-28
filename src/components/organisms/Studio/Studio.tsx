'use client';

import classNames from 'classnames';
import { useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { effectiveKind, widgetTitle } from './canvas/layout';
import LiveNote from './canvas/LiveNote';
import Whiteboard from './canvas/Whiteboard';
import { useCanvasDocument } from './hooks/useCanvasDocument';
import { useChat } from './hooks/useChat';
import { useConversationSave } from './hooks/useConversationSave';
import { useLandingHistory } from './hooks/useLandingHistory';
import { useLiveCards } from './hooks/useLiveCards';
import GuestWall from './GuestWall';
import StudioLanding from './landing/StudioLanding';
import { type PromptField } from './prompt/PromptForm';
import type { ShareDatum } from './modals/ShareModal';
import CardDownload from './modals/CardDownload';
import CardInfoPanel, { type CiteAsk, type CitedSnapshot } from './modals/CardInfoPanel';
import StudioModals from './modals/StudioModals';
import { useStudioModals } from './modals/useStudioModals';
import styles from './Studio.module.scss';
import ChatPanel, { type ChatTab } from './workspace/ChatPanel';
import RouteArrival from './workspace/RouteArrival';
import WorkspaceToolbar from './workspace/WorkspaceToolbar';

import Button from '@/components/atoms/Button/Button';
import FeedbackWidget from '@/components/organisms/FeedbackWidget/FeedbackWidget';
import GridPattern, { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import Modal from '@/components/molecules/Modal/Modal';
import Header from '@/components/organisms/Header/Header';
import { useGridCell } from '@/hooks/useGridCell';
import { useGridFills } from '@/hooks/useGridFills';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { useReveal } from '@/hooks/useReveal';
import { isHarnessCard, withUnheldShownCards } from '@/lib/chat/canvas';
import { openedSave } from '@/lib/chat/fork';
import type { SavedConversation } from '@/lib/chat/history';
import type { ShareKind } from '@/lib/chat/shareStore';
import { track } from '@/lib/events/client';
import { sharedCardAddress } from '@/lib/studio/cardDownload';
import { editedCanvasCards, pinEdit } from '@/lib/studio/canvasEdits';
import { cardUnitChange } from '@/lib/studio/cardUnit';
import { liveDataThrough } from '@/lib/studio/dataThrough';
import {
    arrivalDraftHref,
    HANDOFF_HOLD_PARAM,
    handoffPromptSource,
    questionParam,
    routedArrival,
    STUDIO_DRAFT_PARAM,
} from '@/lib/studio/examples';
import { stashGuestSession, takeGuestSession } from '@/lib/studio/guestStash';
import {
    type CiteLink,
    citeLinkKey,
    citeLinkOf,
    citeLinkOnce,
    logRefusedDescriptions,
} from '@/lib/studio/infoPanel';
import {
    addGuestPrompts,
    guestOutOfPrompts,
    guestPromptsUsed,
    promptEvent,
    type PromptIntent,
} from '@/lib/studio/promptAllowance';
import { takeSeeds } from '@/lib/studio/seedStore';
import { type HeldTurn, takeHeldTurn } from '@/lib/studio/studioClient';
import { deriveTheme, themeVars } from '@/lib/studio/theme';
import { isPrompt, isRefundedPrompt } from '@/lib/studio/transcript';
import type { PromptSource, Seed, UnitChoice } from '@/lib/studio/wire';
import { uuid } from '@/lib/uuid';

// Light-canvas cell tints (hardcoded hex by the canvas-layer convention).
const FILL_SHADES = ['#ffffff', '#eceada', '#dedcc6', '#cfceb6'];

// Landing → workspace choreography: the landing staggers out first, then the
// workspace mounts (pattern morphs, chat slides in, bar actions cascade).
const STAGE_OUT_MS = 560;
// The chat line a turn opens with (useChat's send), shown on a handed-over
// question until its turn starts.
const ARRIVAL_STATUS = 'Resolving the question';

type Mode = 'start' | 'leaving' | 'workspace';

export type StudioProps = {
    // A public share (/s/<id>): the Studio opens straight on the stored
    // conversation, read-only — no input, no card actions, no saving, no
    // way back and no account: logo, title, filters and the sheet. A `live`
    // share's data cards arrive held and are filled from the refresh route
    // (see useLiveCards), and so are a snapshot's `undrawn` cards. `slots`
    // names the slot that draws each card, whose rows a download serves.
    // `servedAt` is when each snapshot card's slot began to show its data,
    // and `createdAt` when the share was made.
    shared?: {
        id: string;
        kind: ShareKind;
        saved: SavedConversation;
        live?: boolean;
        undrawn?: string[];
        slots?: Record<string, number>;
        servedAt?: Record<string, string>;
        createdAt?: string;
    };
    // /studio/<id>: the conversation to open on arrival (a refresh, a link
    // from history, a fresh fork).
    openId?: string;
    // Signed out: GUEST_PROMPTS prompts, then the wall; nothing is saved
    // (that needs an account), and shares are unowned snapshots.
    guest?: boolean;
    // The landing's example prompts for this visit (pickExamples, drawn by
    // the page). A share has no landing and passes none.
    examples?: readonly string[];
};

// The guest's prompt count in this browser, which decides when the wall goes
// up. The proxy holds the real allowance (src/lib/studio/spendPrompt): a
// guest past it, from a cleared browser too, gets its refusal as the reply.
const guestListeners = new Set<() => void>();
const readGuestUsed = () => guestPromptsUsed(localStorage);
const addGuestUsed = (delta: number) => {
    addGuestPrompts(localStorage, delta);
    guestListeners.forEach((listener) => listener());
};
// True once the page renders on the client: false on the server and for the
// hydration pass, true from the first render of a client navigation.
const subscribeNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;
const subscribeGuest = (listener: () => void) => {
    guestListeners.add(listener);

    return () => {
        guestListeners.delete(listener);
    };
};

/**
 * The Studio: the landing (prompt, suggestions, history) that morphs into
 * the workspace — the chat panel on the left, the whiteboard on the right,
 * the tools row above. Owns the mode, wires the chat, the canvas document,
 * saving and the modals; the pieces live in ./landing, ./workspace,
 * ./canvas, ./modals and ./hooks.
 */
const Studio = ({ shared, openId, guest = false, examples = [] }: StudioProps) => {
    // A share keeps the cards its page showed that its harness never held,
    // as the owner's reopened copy does (openedSave).
    const sharedSaved = useMemo(
        () => (shared ? withUnheldShownCards(shared.saved) : undefined),
        [shared],
    );

    const readOnly = !!shared;
    // What a signed-in user has and a guest lacks: history and saving.
    const account = !readOnly && !guest;
    // A canvas-only or one-card share: no chat at all — the sheet takes the
    // whole width and only the filters stay above it.
    const solo = !!shared && shared.kind !== 'conversation';
    const sectionRef = useReveal<HTMLElement>();
    // Fluid-scaled cell: the studio grid (pattern + landing fills + the
    // whiteboard) rides the root font-size like the rest of the page.
    const gridCell = useGridCell();
    const gridScale = gridCell / GRID_CELL;
    const searchParams = useSearchParams();
    // A question handed over from Get Data (`/studio?q=…`, studioHref in
    // src/lib/search/studioHandoff.ts) opens straight on the workspace, the
    // question and a pending line already in its transcript (`shownChat`),
    // so the page Get Data's move carries in is the page that stays. The
    // section's `data-arrival` holds the workspace's entrance animations
    // until New Chat leaves it. Read once, at mount. A blank question is no
    // arrival, and opens the landing.
    const [arrival, setArrival] = useState(() =>
        shared || openId ? null : questionParam(searchParams, 'q'),
    );
    const [mode, setMode] = useState<Mode>(shared || arrival ? 'workspace' : 'start');
    // Cols/rows span a full desktop viewport — off-viewport cells on smaller
    // screens just clip.
    const fills = useGridFills({
        shades: FILL_SHADES,
        cols: 96,
        rows: 54,
        active: mode === 'start',
    });
    // The landing's opener is a growing textarea; the type covers both.
    const inputRef = useRef<PromptField>(null);
    // A guest's handed-over question, once its turn started, comes back as
    // a draft (`/studio?draft=`, arrivalDraftHref): the landing opens with
    // it in the opener, unsent.
    const [query, setQuery] = useState(
        () =>
            sharedSaved?.title ?? arrival ?? questionParam(searchParams, STUDIO_DRAFT_PARAM) ?? '',
    );
    // The chat's follow-up field, kept here so text typed into the landing's
    // field while it leaves carries into it (see `leaving` below).
    const [followDraft, setFollowDraft] = useState('');
    const [chatTab, setChatTab] = useState<ChatTab>('chat');
    const [cardsTab, setCardsTab] = useState('all');
    // A canvas/card share has no chat to show — it opens collapsed.
    const [chatCollapsed, setChatCollapsed] = useState(solo);
    // The card a pending follow-up is scoped to (chip above
    // the chat input); cleared once that message is sent.
    const [editTarget, setEditTarget] = useState<{ id: string; title: string } | null>(null);
    // The card whose More Info panel is open (its attribution line opens it).
    const [infoCardId, setInfoCardId] = useState<string | null>(null);
    // The snapshot links asked for to cite cards, by card and the data it
    // draws (`citeLinkKey`): being made, refused or made. Kept for the
    // session, beside the requests in flight, so More Info opened again on
    // an unchanged card shows its request or reuses its link and makes no
    // second public share.
    const [citeLinks, setCiteLinks] = useState<Record<string, CitedSnapshot | CiteAsk>>({});
    const citeLinksInFlight = useRef(new Map<string, Promise<CiteLink>>());
    // The card whose Download Data dialog is open (its download button opens it).
    const [downloadCardId, setDownloadCardId] = useState<string | null>(null);
    // The canvas hands up its fly-to-card function (Activity → "View on
    // whiteboard", the chat chips).
    const flyToCardRef = useRef<((id: string) => void) | null>(null);
    const leaveTimer = useRef(0);

    const doc = useCanvasDocument(sharedSaved);
    // The guest canvas restored after sign-in whose first save has not landed.
    // The harness state read answers 404 until it does, so the page reads no
    // state meanwhile.
    const [unsavedGuestId, setUnsavedGuestId] = useState<string | null>(null);
    // The ids of the cards the canvas shows, as last painted, for a chat
    // that leaves its session before any manifest arrived.
    const shownIdsRef = useRef<string[]>([]);
    // A card the harness redrew under a new id keeps the old card's settings.
    const conversation = useChat(sharedSaved, {
        onCardReplaced: doc.renameWidget,
        shownCards: () => shownIdsRef.current,
        readsState: account && unsavedGuestId === null,
        // A new question a turn handed back joins the queue past the gate
        // below, so the queue sends it through the gate.
        admitHandedBack: (text, queued, run) => prompt(undefined, text.trim().length, run, queued),
    });
    // Guest prompts spent so far (0 on the server and for the hydration pass).
    const guestUsed = useSyncExternalStore(subscribeGuest, readGuestUsed, () => 0);
    const clientRendered = useSyncExternalStore(subscribeNothing, onClient, onServer);
    // A prompt counts once it is actually sent (a queued one can still be
    // removed): the count follows the user turns in the transcript, so the
    // queue's own drain is covered too. A prompt the harness refused before
    // its turn started comes back, as the server's meter gives it back, also
    // when it then left the transcript (droppedRefunds). Only growth counts,
    // of either: New Chat empties the transcript without giving prompts back.
    // Get Data counted the prompts of the turns it started that this page
    // adopted (`adoptedPrompts`, send below), so the meter leaves them out.
    const sentCount = conversation.messages.filter(isPrompt).length;
    const [adoptedPrompts, setAdoptedPrompts] = useState(0);
    const meteredCount = sentCount - adoptedPrompts;
    const refundedCount =
        conversation.messages.filter(isRefundedPrompt).length + conversation.droppedRefunds;
    const sentRef = useRef(meteredCount);
    const refundedRef = useRef(refundedCount);

    useEffect(() => {
        const spent = Math.max(0, meteredCount - sentRef.current);
        const refunded = Math.max(0, refundedCount - refundedRef.current);

        sentRef.current = meteredCount;
        refundedRef.current = refundedCount;

        if (guest && spent !== refunded) {
            addGuestUsed(spent - refunded);
        }
    }, [guest, meteredCount, refundedCount]);

    // Queued prompts hold their place in the limit until sent or removed.
    const walled = guestOutOfPrompts({ guest, used: guestUsed + conversation.queued.length });
    // Every prompt (landing, follow-up, card menu, a clicked chip) goes
    // through here: past the limit a guest's is dropped, the rest are counted
    // as usage (turn, intent and a typed prompt's length, never the text). A
    // prompt the chat queues is counted here once; the queue's drain sends it
    // inside the chat, past this gate, except a new question a turn handed
    // back, which the drain sends through here with the count of prompts
    // still queued behind it (`queued`). `source` names the example a picked
    // question came from. `paid` counts the prompts the stored count holds
    // already, which the wall leaves out. Returns whether the prompt went.
    const prompt = (
        intent: PromptIntent | undefined,
        length: number | undefined,
        run: () => void,
        queued = conversation.queued.length,
        source?: PromptSource,
        paid = 0,
    ): boolean => {
        // Read the count afresh: the `?q=` handover fires from the first
        // render's closure, before the stored count has synced in.
        const event = promptEvent({
            guest,
            used: readGuestUsed() - paid,
            queued,
            sent: sentCount,
            intent,
            length,
            source,
        });

        if (!event) {
            return false;
        }

        track('studio.prompt', event);
        run();

        return true;
    };
    // A held turn (takeHeldTurn) is one Get Data started and counted
    // already, so the wall leaves its prompt out, and once adopted the
    // meter does too. One the gate drops is cancelled.
    const send: typeof conversation.send = (text, options, seeds, asked, source, held) => {
        let adopted = false;
        const went = prompt(
            options?.intent,
            text.trim().length,
            () => {
                adopted = conversation.send(text, options, seeds, asked, source, held);
            },
            undefined,
            source,
            held ? 1 : 0,
        );

        if (!went) {
            void held?.cancel();
        }

        if (adopted) {
            setAdoptedPrompts((count) => count + 1);
        }

        return adopted;
    };
    const applyChoice: typeof conversation.applyChoice = (chip) =>
        prompt('apply_choice', undefined, () => conversation.applyChoice(chip));
    const applyUnit: typeof conversation.applyUnit = (change) =>
        prompt('apply_unit', undefined, () => conversation.applyUnit(change));
    const chat = { ...conversation, send, applyChoice, applyUnit };

    // Usage: each card the harness puts on the canvas, once (a reopened or
    // shared conversation's cards were counted when they were made).
    const trackedCards = useRef(new Set((sharedSaved?.widgets ?? []).map((widget) => widget.id)));

    useEffect(() => {
        for (const widget of conversation.widgets) {
            if (trackedCards.current.has(widget.id)) {
                continue;
            }

            trackedCards.current.add(widget.id);
            const source = widget.info?.sourceId;

            track('studio.card', {
                kind: widget.kind,
                turn: widget.turn,
                ...(source ? { source } : {}),
                years: widget.info?.years ?? null,
                unit: widget.info?.unit ?? null,
                guest,
            });
        }
    }, [conversation.widgets, guest]);

    // Usage: the session's size on the way out (New Chat or leaving the page).
    const sessionStats = useRef({ turns: 0, cards: 0, pins: 0 });

    const endSession = () => {
        if (sessionStats.current.turns > 0) {
            track('studio.session_end', { ...sessionStats.current, guest });
        }
    };

    useEffect(() => {
        if (readOnly) {
            return;
        }

        window.addEventListener('pagehide', endSession);

        return () => window.removeEventListener('pagehide', endSession);
        // The listener reads the stats ref; the closure needs no refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readOnly]);

    // Usage: a guest running into the wall, once per visit.
    const wallTracked = useRef(false);

    useEffect(() => {
        if (walled && !wallTracked.current) {
            wallTracked.current = true;
            track('guest.wall_hit', { prompts: guestUsed });
        }
    }, [walled, guestUsed]);

    useEffect(() => {
        logRefusedDescriptions(sharedSaved?.widgets ?? []);
    }, [sharedSaved]);

    const pinCount = doc.pinnedIds.length;
    const cardCount = conversation.widgets.length;

    useEffect(() => {
        sessionStats.current = { turns: sentCount, cards: cardCount, pins: pinCount };
    }, [sentCount, cardCount, pinCount]);

    const save = useConversationSave({
        chat,
        doc,
        readOnly: !account,
        initialLayout: sharedSaved?.layout,
    });
    const { buildSnapshot } = save;

    // A guest leaving the page — most often for the sign-in the wall points
    // at — takes the canvas with them: the snapshot waits in this tab, and
    // the restore below puts it back once there is an account to save it to
    // (QA-58). Hooked to the leaving itself rather than to the wall's
    // button, so the header's sign-in and every other way out are covered
    // the same: the cleanup catches a route change inside the app (the
    // wall's own `router.push`, which fires no page event), `pagehide` the
    // load that leaves the site.
    useEffect(() => {
        if (!guest) {
            return;
        }

        const stash = () => stashGuestSession(() => window.sessionStorage, buildSnapshot());

        window.addEventListener('pagehide', stash);

        return () => {
            window.removeEventListener('pagehide', stash);
            stash();
        };
    }, [guest, buildSnapshot]);

    const modals = useStudioModals();
    const derivedTheme = deriveTheme(doc.theme);
    // On a phone the chat and the sheet take turns (one pill switches them).
    const phone = useIsPhone();

    useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

    // The landing's stage-out, then the workspace.
    const enterWorkspace = () => {
        setMode('leaving');
        leaveTimer.current = window.setTimeout(() => setMode('workspace'), STAGE_OUT_MS);
    };

    // A new canvas from the prompt (or a suggestion).
    // A question handed over from the search page (`/studio?q=…&seed=…`),
    // with the token its seeds are stored under, the token of the turn Get
    // Data started for it (`hold`) and, for a search example, its source.
    // Consumed once, below, after `begin` exists.
    const handover = questionParam(searchParams, 'q');
    const seedToken = searchParams.get('seed');
    const holdToken = searchParams.get(HANDOFF_HOLD_PARAM);
    const handoverSource = handoffPromptSource(searchParams);
    const handedOver = useRef(false);
    // A question the search API's router moved here: its conversation says
    // why and offers the way back, until New Chat or a saved conversation
    // replaces it. Read once, since an account's first turn moves the URL.
    const [routed, setRouted] = useState(() => routedArrival(searchParams));

    // `source` names the example a picked question came from; a typed one
    // has none. `held` is the turn Get Data started for the question, or
    // `adopted` when this page load took it already and starts nothing more.
    const begin = (
        text: string,
        source?: PromptSource,
        seeds?: Seed[],
        held?: HeldTurn | 'adopted',
    ) => {
        const trimmed = text.trim();

        if (held === 'adopted') {
            return;
        }

        if (!trimmed) {
            void held?.cancel();
            inputRef.current?.focus();

            return;
        }

        const id = uuid();

        // The conversation gets its own URL, so a refresh comes back to it —
        // for an account; a guest's is never saved, so the URL stays /studio.
        if (account) {
            window.history.replaceState(null, '', `/studio/${id}`);
        }

        save.track(id, {});
        doc.reset();
        setQuery(trimmed);
        chat.send(trimmed, undefined, seeds, undefined, source, held);

        // A handed-over question is already on the workspace.
        if (mode === 'start') {
            enterWorkspace();
        }
    };

    // Reopen a saved conversation exactly as it was left — same transcript,
    // widgets, pins and card layout; follow-ups keep saving under its id.
    // A guest canvas restored after sign-in (`fromGuest`) has no owner until
    // its first save claims it, and before then the harness state read
    // answers 404, so the restore reads the harness once that save lands.
    const openSaved = (stored: SavedConversation, fromGuest = false) => {
        // A fork's inherited turns and cards are marked as such (openedSave).
        const saved = openedSave(stored);

        setRouted(null);

        window.history.replaceState(null, '', `/studio/${saved.id}`);
        saved.widgets.forEach((widget) => trackedCards.current.add(widget.id));
        logRefusedDescriptions(saved.widgets);
        save.track(saved.id, saved.layout);
        doc.load(saved);
        setQuery(saved.title);
        chat.hydrate(saved);

        // The harness's copy of the conversation fills in what the snapshot
        // missed: a pending card, a turn that ended or paused after the page
        // left, a turn left running.
        if (account && fromGuest) {
            const { reattach } = chat;

            // A failed save leaves the wait open for the next save of this
            // conversation; the page leaving it ends the wait.
            const awaitLanding = () => {
                void save.whenSaved(saved.id).then((landed) => {
                    if (landed) {
                        setUnsavedGuestId((id) => (id === saved.id ? null : id));
                        reattach();
                    } else if (save.conversationId() === saved.id) {
                        console.warn(
                            'studio: the restored guest conversation did not save; the harness state is not read yet',
                            saved.id,
                        );
                        awaitLanding();
                    } else {
                        setUnsavedGuestId((id) => (id === saved.id ? null : id));
                    }
                });
            };

            setUnsavedGuestId(saved.id);
            awaitLanding();
        } else if (account) {
            chat.reattach();
        }

        enterWorkspace();
    };

    // The other half of QA-58: signed in, with a guest canvas waiting in
    // this tab, Studio reopens it instead of the empty landing. Saving is on
    // now, so hydrating it is also what writes it to history. Deferred by a
    // tick on purpose. `openSaved` starts the landing's stage-out on a timer
    // that the mount effect's cleanup clears, and in development React
    // mounts, cleans up and mounts again; starting it inside that window
    // would cancel the transition and leave the page on a blank stage.
    const restored = useRef(false);

    useEffect(() => {
        if (!account || openId || shared || handover) {
            return;
        }

        const handle = window.setTimeout(() => {
            // Claimed inside the timer, not before it: development mounts,
            // cleans up and mounts again, and a flag set on the way in
            // would have the second pass skip the restore the first one
            // never got to run.
            if (restored.current) {
                return;
            }

            restored.current = true;

            const saved = takeGuestSession(() => window.sessionStorage);

            if (saved) {
                openSaved(saved, true);
            }
        }, 0);

        return () => window.clearTimeout(handle);
        // `openSaved` is rebuilt every render; the ref is what makes this
        // run once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account, openId, shared, handover]);

    const landingHistory = useLandingHistory({
        onLanding: mode === 'start' && account,
        openId,
        disabled: !account,
        onOpen: openSaved,
    });

    // Back to the landing: flush the pending save so the canvas being left
    // is not lost.
    const startNew = () => {
        endSession();
        save.flush();
        save.track(null, {});
        window.history.replaceState(null, '', '/studio');
        window.clearTimeout(leaveTimer.current);
        setRouted(null);
        setArrival(null);
        setQuery('');
        setFollowDraft('');
        setChatCollapsed(false);
        setChatTab('chat');
        doc.reset();
        modals.closeAll();
        chat.reset();
        setMode('start');
    };

    // A live share's canvas: its data cards drawn on current data as each
    // refresh answers, and their states. A snapshot's cards its page could
    // not draw are filled the same way. The owner's own widgets pass
    // through untouched.
    const { widgets: visibleWidgets, live: liveCanvas } = useLiveCards(
        shared,
        editedCanvasCards(chat.canvas, chat.pendingCards, (canvas) =>
            doc.visibleWidgets(chat.widgets, canvas, chat.owedRemovals),
        ),
    );

    useLayoutEffect(() => {
        shownIdsRef.current = visibleWidgets.map((widget) => widget.id);
    }, [visibleWidgets]);

    const isOnCanvas = (id: string) => visibleWidgets.some((widget) => widget.id === id);
    const cardTitleOf = (id: string): string => {
        const widget = visibleWidgets.find((other) => other.id === id);

        return doc.titles[id] ?? (widget ? widgetTitle(widget) : 'Card');
    };
    const flyToCard = (id: string) => flyToCardRef.current?.(id);
    // Card menu → Change unit → Send: a turn that moves the card to `unit`.
    const changeUnit = (id: string, unit: UnitChoice) => {
        const widget = chat.widgets.find((other) => other.id === id);
        const change = widget && cardUnitChange(widget, cardTitleOf(id), unit);

        if (change) {
            chat.applyUnit(change);
        }
    };

    // A card the harness holds goes on and off the canvas by the harness's
    // manifest, so Add and Remove are edits sent to the harness. A text card
    // and a fork's inherited card live only here (isHarnessCard).
    const harnessCard = (id: string) =>
        isHarnessCard({ widgets: chat.widgets, localIds: doc.localIds }, id);

    // Chat chip → Add: back on the canvas.
    const addWidget = (id: string) => {
        if (harnessCard(id)) {
            chat.syncCanvas([{ op: 'add', component_id: id }]);
        } else {
            doc.addWidget(id);
        }
    };

    // The cards a legacy canvas's save held that its harness session never
    // held become local cards, before the frame that takes the manifest is
    // painted: the ones it showed stay on the canvas, and the ones it hid
    // stay off it, so Add brings one back on the page alone.
    const { localCards } = conversation;
    const { addLocalIds } = doc;

    useLayoutEffect(() => {
        addLocalIds(localCards.shown, localCards.hidden);
    }, [localCards, addLocalIds]);

    // A harness card's pin is the harness manifest's (chat.pins): the
    // document takes it, keeping the pins of the cards only the page holds,
    // the ones the effect above made local included.
    // A legacy canvas, whose manifest has not been taken, keeps the save's.
    const { pins, widgets: chatWidgets } = chat;
    const { takeHarnessPins } = doc;

    useLayoutEffect(() => {
        if (pins) {
            takeHarnessPins(pins, chatWidgets);
        }
    }, [pins, chatWidgets, takeHarnessPins]);

    // The card menu's Remove and Pin. A harness card's edit goes to the
    // harness, whose answer settles it; a legacy canvas shows its pin here
    // at once.
    const removeCard = (id: string) => {
        if (harnessCard(id)) {
            chat.syncCanvas([{ op: 'remove', component_id: id }]);
        } else {
            doc.removeWidget(id);
        }
    };
    const togglePin = (id: string) => {
        if (!harnessCard(id)) {
            doc.togglePin(id);

            return;
        }

        if (!pins) {
            doc.togglePin(id);
        }

        chat.syncCanvas([pinEdit(pins ?? doc.pinnedIds, id)]);
    };

    // Studio opens on the handed-over question instead of a blank canvas.
    // For an account, the id-bearing URL replaces this one as soon as the
    // turn starts, so a refresh continues the conversation. A guest's
    // conversation has no URL of its own, so its entry becomes the
    // question as a draft (arrivalDraftHref): Back, Forward, a reload or a
    // copied link open the landing with the question unsent, and spend no
    // second prompt. The question is already on the workspace, so the turn
    // starts here, after the commit that showed it. A turn Get Data started
    // during the move's hold is adopted, and a hard load or a reload, which
    // find none, post their own. A turn this page load adopted already
    // starts nothing more.
    useEffect(() => {
        if (!handover || handedOver.current) {
            return;
        }

        handedOver.current = true;
        // Seeds that cannot be read leave the question alone.
        begin(
            handover,
            handoverSource,
            (seedToken && takeSeeds(() => window.sessionStorage, seedToken)) || undefined,
            (holdToken && takeHeldTurn(holdToken)) || undefined,
        );

        const draft = !account && arrivalDraftHref(new URLSearchParams(window.location.search));

        if (draft) {
            window.history.replaceState(null, '', draft);
        }
        // `begin` is rebuilt every render; the ref is what makes this run once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handover, handoverSource, seedToken, holdToken]);

    // Card menu → Ask follow up: the question itself is typed in the chat
    // input, so this only arms the card as its target (chip above the input)
    // and opens the chat to type into. The turn then carries the card's
    // component_ref, so the agent answers about — or reworks — that card
    // instead of re-deriving what "it" means from the transcript.
    const askFollowUp = (id: string, title: string) => {
        setChatCollapsed(false);
        setEditTarget({ id, title });
    };

    // The Data tab: every visible card with a revision to export.
    const shareData: ShareDatum[] = visibleWidgets.flatMap((widget) =>
        widget.kind !== 'text' && widget.ref
            ? [{ id: widget.id, title: cardTitleOf(widget.id), ref: widget.ref, kind: widget.kind }]
            : [],
    );
    const infoWidget = visibleWidgets.find((widget) => widget.id === infoCardId) ?? null;
    const downloadWidget = visibleWidgets.find((widget) => widget.id === downloadCardId) ?? null;

    // Card-type tabs are dynamic: a type only gets a tab once it exists on
    // the canvas (nothing to filter otherwise), each with its live count. If
    // the selected tab's type disappears (e.g. a reset), the view falls back
    // to All.
    const kindCounts = visibleWidgets.reduce<Record<string, number>>((acc, widget) => {
        const kind = effectiveKind(widget, doc.views[widget.id]);

        acc[kind] = (acc[kind] ?? 0) + 1;

        return acc;
    }, {});
    const tabFor = (id: string, label: string, kind: string) =>
        kindCounts[kind] ? [{ id, label, count: kindCounts[kind] }] : [];
    const cardTabItems = [
        { id: 'all', label: 'All', count: visibleWidgets.length },
        ...tabFor('stats', 'Stats', 'key_number'),
        ...tabFor('charts', 'Charts', 'chart'),
        ...tabFor('tables', 'Tables', 'table'),
        ...tabFor('notes', 'Notes', 'text'),
    ];
    const activeCardsTab = cardTabItems.some((tab) => tab.id === cardsTab) ? cardsTab : 'all';
    // A share shows the filters only when there's something to filter —
    // at least two kinds of card on the sheet.
    const showFilters =
        visibleWidgets.length > 0 && (!shared || Object.keys(kindCounts).length >= 2);

    // From the first send until the workspace mounts, the landing's field is
    // on screen and keeps focus, so a quick follow-up is typed into it.
    // It then holds the follow-up draft, so that text carries into the chat's
    // follow-up field, and Enter sends it as a follow-up.
    const leaving = mode === 'leaving';
    const sendDraft = (text: string, source?: PromptSource) => {
        if (text.trim()) {
            send(text, undefined, undefined, undefined, source);
            setFollowDraft('');
        }
    };

    const title = doc.conversationTitle ?? query;
    // A handed-over question before its turn starts: shown as the turn will
    // show it, the question with its pending line. React runs the effects
    // of a commit that a view transition carries only once the transition
    // ends, so the turn the handover effect starts lands after Get Data's
    // move, and the move carries this transcript in. A guest's wall is known
    // only on the client, so a guest's hard load shows it from the first
    // client render, and a guest out of prompts never sees it.
    const shownChat =
        arrival && chat.messages.length === 0 && !walled && (!guest || clientRendered)
            ? {
                  ...chat,
                  messages: [{ role: 'user' as const, text: arrival, turn: 1 }],
                  thinking: true,
                  status: ARRIVAL_STATUS,
              }
            : chat;
    const firstPrompt = chat.messages.find((message) => message.role === 'user')?.text ?? query;
    const inWorkspace = mode === 'workspace';

    // Phone: the card filters get their own tools row while the sheet is on
    // screen — the section moves the sheet's top down for it.
    const filtersRow = phone && showFilters && (solo || chatCollapsed);
    // Phone: while the chat is on screen the sheet hides behind it.
    const chatShown = phone && inWorkspace && !solo && !chatCollapsed;

    return (
        <section
            ref={sectionRef}
            className={classNames(
                styles.section,
                filtersRow && styles.filtersRow,
                chatShown && styles.chatShown,
            )}
            data-arrival={arrival ? 'route' : undefined}
        >
            {/* Docking starts with the stage-out (not after it) — one continuous
                move instead of two beats. */}
            <div
                className={classNames(
                    styles.canvas,
                    mode !== 'start' && styles.canvasDocked,
                    mode !== 'start' && chatCollapsed && styles.canvasWide,
                    solo && styles.canvasSolo,
                )}
                aria-hidden="true"
            >
                {/* Viewport-sized inner layer counter-translated on the same
                    curve as the clip box — the grid stays screen-static and
                    only gets cropped. */}
                <div className={styles.canvasInner}>
                    <GridPattern variant="light" cell={gridCell} />
                    {fills.map(({ id, x, y, w, h, shade, leaving }) => (
                        <span
                            key={id}
                            className={classNames(styles.fill, leaving && styles.fillOut)}
                            style={{
                                left: x * gridScale,
                                top: y * gridScale,
                                width: w * gridScale,
                                height: h * gridScale,
                                backgroundColor: shade,
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Widgets ride ABOVE the clipped pattern, in the same docked
                region (a separate scroll layer so the grid stays a backdrop). */}
            {inWorkspace && (
                <div
                    className={classNames(
                        styles.canvasContent,
                        chatCollapsed && styles.canvasContentWide,
                        solo && styles.canvasContentSolo,
                    )}
                    style={themeVars(derivedTheme) as React.CSSProperties}
                >
                    <Whiteboard
                        widgets={visibleWidgets}
                        filter={activeCardsTab}
                        pinnedIds={doc.pinnedIds}
                        onTogglePin={togglePin}
                        onRemove={removeCard}
                        onAskFollowUp={askFollowUp}
                        onChangeUnit={readOnly ? undefined : changeUnit}
                        onCardInfo={setInfoCardId}
                        focusedId={infoCardId}
                        onEditText={modals.textCard.show}
                        onEditTitle={modals.cardTitle.show}
                        titles={doc.titles}
                        notes={doc.notes}
                        onEditNote={modals.note.show}
                        onRemoveNote={doc.removeNote}
                        initialLayout={save.openedLayout}
                        onLayoutChange={save.handleLayoutChange}
                        replacedIds={doc.replacedIds}
                        flyToCardRef={flyToCardRef}
                        theme={derivedTheme}
                        views={doc.views}
                        onViewChange={doc.setView}
                        ratios={doc.ratios}
                        onRatioChange={doc.setRatio}
                        onShare={
                            readOnly
                                ? undefined
                                : (id) =>
                                      modals.share.show({
                                          kind: 'card',
                                          id,
                                          title: cardTitleOf(id),
                                      })
                        }
                        onDownload={setDownloadCardId}
                        readOnly={readOnly}
                        // A viewer may resize a share's cards for
                        // themselves: the layout and ratios stay in this
                        // page (a share has no conversation id, so
                        // useConversationSave saves nothing).
                        resizable={readOnly}
                        centerSingle={shared?.kind === 'card'}
                        live={liveCanvas}
                    />
                </div>
            )}

            <CardInfoPanel
                info={infoWidget?.info ?? null}
                widget={infoWidget}
                open={infoCardId !== null}
                onOpenChange={(next) => !next && setInfoCardId(null)}
                shared={infoWidget && sharedCardAddress(shared, infoWidget.id)}
                // A share row's `live` is set either way (sharedViewOfRecord).
                snapshot={
                    shared?.live === false
                        ? {
                              id: shared.id,
                              servedAt: infoWidget ? shared.servedAt?.[infoWidget.id] : undefined,
                          }
                        : undefined
                }
                canShare={!readOnly}
                citeLink={infoWidget ? citeLinks[citeLinkKey(infoWidget)] : undefined}
                onCiteLink={
                    infoWidget && !readOnly
                        ? () => {
                              const key = citeLinkKey(infoWidget);

                              setCiteLinks((now) => ({ ...now, [key]: 'minting' }));
                              void citeLinkOnce(citeLinksInFlight.current, key, async () =>
                                  citeLinkOf(
                                      await save.createShare('card', infoWidget.id, 'snapshot'),
                                  ),
                              )
                                  .then((link): CitedSnapshot | CiteAsk =>
                                      'id' in link ? link : link.refusal,
                                  )
                                  .then((settled) =>
                                      setCiteLinks((now) => ({ ...now, [key]: settled })),
                                  );
                          }
                        : undefined
                }
            />

            <Modal
                open={downloadWidget !== null}
                onOpenChange={(next) => !next && setDownloadCardId(null)}
                title="Download Data"
                fit
            >
                {downloadWidget && (
                    <CardDownload
                        widget={downloadWidget}
                        details
                        shared={sharedCardAddress(shared, downloadWidget.id)}
                    />
                )}
            </Modal>

            {inWorkspace && !readOnly && (
                <StudioModals
                    modals={modals}
                    doc={doc}
                    visibleWidgets={visibleWidgets}
                    title={title}
                    firstPrompt={firstPrompt}
                    shareData={shareData}
                    cardTitleOf={cardTitleOf}
                    createShare={save.createShare}
                    buildSnapshot={save.buildSnapshot}
                    guest={guest}
                />
            )}

            {/* The bar reads "Studio"; the conversation's title lives in the
                tools row over the canvas — except on a phone, where that row
                has no room for it and the bar keeps it. */}
            <Header
                variant="studio"
                title={inWorkspace && phone ? title : undefined}
                titleEditable={inWorkspace && phone && !readOnly}
                onEditTitle={modals.title.show}
                onBack={mode === 'start' || readOnly ? undefined : startNew}
                // A share is a plain read-only view: no way back, no account —
                // logo and title only.
                back={!readOnly}
                account={!readOnly}
            >
                {inWorkspace && !readOnly && (
                    <>
                        <Button
                            variant="bordered"
                            className={styles.barExtra}
                            style={{ '--i': 0 } as React.CSSProperties}
                            onClick={startNew}
                        >
                            New Chat
                        </Button>
                        <Button
                            variant="bordered"
                            className={styles.barExtra}
                            style={{ '--i': 1 } as React.CSSProperties}
                            onClick={() => modals.customize.setOpen((prev) => !prev)}
                        >
                            Customize
                        </Button>
                        {account && (
                            <Button
                                variant="dark"
                                wide
                                icon="arrow-up-right"
                                className={styles.barExtra}
                                style={{ '--i': 2 } as React.CSSProperties}
                                onClick={() => modals.share.show({ kind: 'whole' })}
                            >
                                Share
                            </Button>
                        )}
                    </>
                )}
            </Header>

            {!inWorkspace && (
                <StudioLanding
                    query={leaving ? followDraft : query}
                    onQueryChange={leaving ? setFollowDraft : setQuery}
                    onBegin={leaving ? sendDraft : begin}
                    examples={examples}
                    inputRef={inputRef}
                    history={account ? landingHistory.history : null}
                    openingId={landingHistory.openingId}
                    onOpenHistory={landingHistory.openHistory}
                    leaving={leaving}
                    wall={walled ? <GuestWall /> : null}
                />
            )}

            {!readOnly && <FeedbackWidget />}

            {inWorkspace && (
                <div className={styles.workspace}>
                    <WorkspaceToolbar
                        chatTab={chatTab}
                        onChatTab={setChatTab}
                        chatCollapsed={chatCollapsed}
                        onChatCollapsed={setChatCollapsed}
                        cardTabs={showFilters ? cardTabItems : null}
                        cardsTab={activeCardsTab}
                        onCardsTab={setCardsTab}
                        solo={solo}
                        readOnly={readOnly}
                        title={title}
                        onEditTitle={modals.title.show}
                        phone={phone}
                        onNewChat={startNew}
                        onCustomize={() => modals.customize.setOpen((prev) => !prev)}
                        onShare={readOnly ? undefined : () => modals.share.show({ kind: 'whole' })}
                        note={
                            liveCanvas ? (
                                <LiveNote
                                    live={liveCanvas}
                                    dataThrough={liveDataThrough(visibleWidgets, liveCanvas)}
                                />
                            ) : undefined
                        }
                    />
                    <ChatPanel
                        draft={followDraft}
                        onDraftChange={setFollowDraft}
                        editTarget={editTarget}
                        onClearEditTarget={() => setEditTarget(null)}
                        chat={shownChat}
                        tab={chatTab}
                        collapsed={chatCollapsed}
                        gone={solo}
                        readOnly={readOnly}
                        // The workspace follows the landing, whose prompt or drawer
                        // button has just unmounted. Focus moves to the follow-up
                        // field so a keyboard user does not land on the page body.
                        // Skipped on a phone, where focus opens the keyboard, and on
                        // a share, which opens straight on the workspace.
                        autoFocus={!shared && !phone}
                        wall={walled ? <GuestWall /> : null}
                        arrival={routed && <RouteArrival {...routed} />}
                        shareMarks={doc.shareMarks}
                        titles={doc.titles}
                        views={doc.views}
                        onCanvas={isOnCanvas}
                        onGo={flyToCard}
                        onAdd={addWidget}
                        onRemove={removeCard}
                    />
                </div>
            )}
        </section>
    );
};

export default Studio;
