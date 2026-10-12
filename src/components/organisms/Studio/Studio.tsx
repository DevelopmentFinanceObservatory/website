'use client';

import classNames from 'classnames';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { effectiveKind, LEAVE_MS, widgetTitle } from './canvas/layout';
import LiveNote from './canvas/LiveNote';
import Whiteboard from './canvas/Whiteboard';
import { useCanvasDocument } from './hooks/useCanvasDocument';
import { useChat } from './hooks/useChat';
import { useConversationSave } from './hooks/useConversationSave';
import { useLandingHistory } from './hooks/useLandingHistory';
import { useLiveCards } from './hooks/useLiveCards';
import GuestWall, { GUEST_LIMIT } from './GuestWall';
import StudioLanding from './landing/StudioLanding';
import { type PromptField } from './prompt/PromptForm';
import type { ShareDatum } from './modals/ShareModal';
import CardDownload from './modals/CardDownload';
import CardInfoPanel from './modals/CardInfoPanel';
import StudioModals from './modals/StudioModals';
import { useStudioModals } from './modals/useStudioModals';
import styles from './Studio.module.scss';
import ChatPanel, { type ChatTab } from './workspace/ChatPanel';
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
import { latestTurnOf } from '@/lib/chat/canvas';
import type { SavedConversation } from '@/lib/chat/history';
import type { ShareKind } from '@/lib/chat/shareStore';
import { track } from '@/lib/events/client';
import { stashGuestSession, takeGuestSession } from '@/lib/studio/guestStash';
import { takeSeeds } from '@/lib/studio/seedStore';
import { deriveTheme, themeVars } from '@/lib/studio/theme';
import type { Seed } from '@/lib/studio/wire';
import { pushConversation } from '@/lib/chat/historyClient';
import { uuid } from '@/lib/uuid';

// Light-canvas cell tints (hardcoded hex by the canvas-layer convention).
const FILL_SHADES = ['#ffffff', '#eceada', '#dedcc6', '#cfceb6'];

// Landing → workspace choreography: the landing staggers out first, then the
// workspace mounts (pattern morphs, chat slides in, bar actions cascade).
const STAGE_OUT_MS = 560;

type Mode = 'start' | 'leaving' | 'workspace';

export type StudioProps = {
    // A public share (/s/<id>): the Studio opens straight on the stored
    // conversation, read-only — no input, no card actions, no saving, no
    // way back and no account: logo, title, filters and the sheet. A `live`
    // share's data cards arrive held and are filled from the refresh route
    // (see useLiveCards); `createdAt` is when the share was made.
    shared?: {
        id: string;
        kind: ShareKind;
        saved: SavedConversation;
        live?: boolean;
        createdAt?: string;
    };
    // /studio/<id>: the conversation to open on arrival (a refresh, a link
    // from history, a fresh fork).
    openId?: string;
    // Signed out: GUEST_LIMIT free prompts, then the wall; nothing is saved
    // or shareable (both need an account).
    guest?: boolean;
    // A gallery item: the same read-only sheet, plus the one action a
    // curated session exists for — carrying it on in your own Studio.
    continuable?: boolean;
    // The site can refresh a live share's cards (`liveSharingAvailable`,
    // read on the server), so the Share dialog offers Live Data.
    liveSharing?: boolean;
};

// The guest's prompt count lives in the browser only — a limit, not a lock.
// (ponytail: localStorage, clearing it resets the count; server-side
// counting when that matters.)
const GUEST_KEY = 'dfo-guest-prompts';
const guestListeners = new Set<() => void>();
const readGuestUsed = () => Number(localStorage.getItem(GUEST_KEY)) || 0;
const writeGuestUsed = (used: number) => {
    localStorage.setItem(GUEST_KEY, String(used));
    guestListeners.forEach((listener) => listener());
};
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
const Studio = ({
    shared,
    openId,
    guest = false,
    continuable = false,
    liveSharing = false,
}: StudioProps) => {
    const sharedSaved = shared?.saved;

    const readOnly = !!shared;
    // What a signed-in user has and a guest lacks: history, saving, sharing.
    const account = !readOnly && !guest;
    // A canvas-only or one-card share: no chat at all — the sheet takes the
    // whole width and only the filters stay above it.
    const solo = !!shared && shared.kind !== 'conversation';
    const sectionRef = useReveal<HTMLElement>();
    // Fluid-scaled cell: the studio grid (pattern + landing fills + the
    // whiteboard) rides the root font-size like the rest of the page.
    const gridCell = useGridCell();
    const gridScale = gridCell / GRID_CELL;
    const [mode, setMode] = useState<Mode>(shared ? 'workspace' : 'start');
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
    const [query, setQuery] = useState(sharedSaved?.title ?? '');
    const [chatTab, setChatTab] = useState<ChatTab>('chat');
    const [cardsTab, setCardsTab] = useState('all');
    // A canvas/card share has no chat to show — it opens collapsed.
    const [chatCollapsed, setChatCollapsed] = useState(solo);
    // The card a pending follow-up is scoped to (chip above
    // the chat input); cleared once that message is sent.
    const [editTarget, setEditTarget] = useState<{ id: string; title: string } | null>(null);
    // The card whose More Info panel is open (its attribution line opens it).
    const [infoCardId, setInfoCardId] = useState<string | null>(null);
    // The card whose Download Data dialog is open (its menu opens it).
    const [downloadCardId, setDownloadCardId] = useState<string | null>(null);
    // The canvas hands up its fly-to-card function (Activity → "View on
    // whiteboard", the chat chips).
    const flyToCardRef = useRef<((id: string) => void) | null>(null);
    const leaveTimer = useRef(0);

    const conversation = useChat(sharedSaved);
    // Guest prompts spent so far (0 on the server and for the hydration pass).
    const guestUsed = useSyncExternalStore(subscribeGuest, readGuestUsed, () => 0);
    // A prompt counts once it is actually sent (a queued one can still be
    // removed): the count follows the user turns in the transcript, so the
    // queue's own drain is covered too. Only growth counts — New Chat empties
    // the transcript without giving prompts back.
    const sentCount = conversation.messages.filter((message) => message.role === 'user').length;
    const sentRef = useRef(sentCount);

    useEffect(() => {
        const delta = sentCount - sentRef.current;

        sentRef.current = sentCount;

        if (guest && delta > 0) {
            writeGuestUsed(readGuestUsed() + delta);
        }
    }, [guest, sentCount]);

    // Queued prompts hold their place in the limit until sent or removed.
    const walled = guest && guestUsed + conversation.queued.length >= GUEST_LIMIT;
    // Every prompt (landing, follow-up, card menu) goes through here: past
    // the limit a guest's is dropped, the rest are counted as usage (turn,
    // intent and length — never the text).
    const send: typeof conversation.send = (text, options, seeds) => {
        // Read the count afresh: the `?q=` handover fires from the first
        // render's closure, before the stored count has synced in.
        if (guest && readGuestUsed() + conversation.queued.length >= GUEST_LIMIT) {
            return;
        }

        track('studio.prompt', {
            turn: sentCount + conversation.queued.length + 1,
            intent: options?.intent ?? (sentCount === 0 ? 'new' : 'follow_up'),
            length: text.trim().length,
            guest,
        });
        conversation.send(text, options, seeds);
    };
    const chat = { ...conversation, send };

    // Usage: each card the harness puts on the canvas, once (a reopened or
    // shared conversation's cards were counted when they were made).
    const trackedCards = useRef(new Set((sharedSaved?.widgets ?? []).map((widget) => widget.id)));

    useEffect(() => {
        for (const widget of conversation.widgets) {
            if (trackedCards.current.has(widget.id)) {
                continue;
            }

            trackedCards.current.add(widget.id);
            track('studio.card', {
                kind: widget.kind,
                turn: widget.turn,
                source: widget.info?.sourceId ?? widget.source ?? null,
                indicators: widget.info?.indicators.map((indicator) => indicator.id) ?? [],
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

    const doc = useCanvasDocument(sharedSaved);

    // Cards the agent took off the canvas leave it as a card-menu Remove does.
    const { agentRemovals, takeAgentRemoved } = conversation;

    useEffect(() => {
        takeAgentRemoved().forEach(doc.removeWidget);
    }, [agentRemovals, takeAgentRemoved, doc.removeWidget]);
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
    // with the token its seeds are stored under. Consumed once, below, after
    // `begin` exists.
    const searchParams = useSearchParams();
    const handover = searchParams.get('q');
    const seedToken = searchParams.get('seed');
    const handedOver = useRef(false);

    const begin = (text: string, seeds?: Seed[]) => {
        const trimmed = text.trim();

        if (!trimmed) {
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
        chat.send(trimmed, undefined, seeds);
        enterWorkspace();
    };

    // Reopen a saved conversation exactly as it was left — same transcript,
    // widgets, pins and card layout; follow-ups keep saving under its id.
    const openSaved = (saved: SavedConversation) => {
        window.history.replaceState(null, '', `/studio/${saved.id}`);
        saved.widgets.forEach((widget) => trackedCards.current.add(widget.id));
        save.track(saved.id, saved.layout);
        doc.load(saved);
        setQuery(saved.title);
        chat.hydrate(saved);
        enterWorkspace();
    };

    // The other half of QA-58: signed in, with a guest canvas waiting in
    // this tab, Studio reopens it instead of the empty landing. Saving is on
    // now, so hydrating it is also what writes it to history. Deferred by a
    // tick for the same reason the `?q=` handover below is — see its note.
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
                openSaved(saved);
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
        setQuery('');
        setChatCollapsed(false);
        doc.reset();
        modals.closeAll();
        chat.reset();
        setMode('start');
    };

    // Gallery → "Continue this session": the curated snapshot becomes a
    // conversation of the viewer's own (a new id, no agent session behind
    // it), and the Studio opens on that copy. Signed out, the login sends
    // them back here.
    const router = useRouter();
    const [forking, setForking] = useState(false);
    const continueSession = async () => {
        if (!sharedSaved || forking) {
            return;
        }

        setForking(true);

        const copy: SavedConversation = {
            ...sharedSaved,
            id: uuid(),
            sessionId: null,
            updatedAt: Date.now(),
            shareMarks: [],
        };

        if (await pushConversation(copy)) {
            router.push(`/studio/${copy.id}`);

            return;
        }

        setForking(false);
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    };

    const latestTurn = latestTurnOf(chat.widgets);

    // A live share's canvas: its data cards drawn on current data as each
    // refresh answers, and their states. A snapshot's and the owner's own
    // widgets pass through untouched.
    const { widgets: visibleWidgets, live: liveCanvas } = useLiveCards(
        shared,
        doc.visibleWidgets(chat.widgets),
    );
    // The harness cards off screen that the user did not remove: a new turn
    // hid them. Reported once their fade-out has finished.
    const hiddenKey = chat.widgets
        .filter(
            (widget) =>
                !visibleWidgets.some((other) => other.id === widget.id) &&
                !doc.removedIds.includes(widget.id),
        )
        .map((widget) => widget.id)
        .join(' ');
    const { reportHidden, canvasVersion } = conversation;

    useEffect(() => {
        if (!hiddenKey) {
            return;
        }

        const timer = window.setTimeout(() => reportHidden(hiddenKey.split(' ')), LEAVE_MS);

        return () => window.clearTimeout(timer);
    }, [hiddenKey, canvasVersion, reportHidden]);

    const isOnCanvas = (id: string) => visibleWidgets.some((widget) => widget.id === id);
    const cardTitleOf = (id: string): string => {
        const widget = visibleWidgets.find((other) => other.id === id);

        return doc.titles[id] ?? (widget ? widgetTitle(widget) : 'Card');
    };
    const flyToCard = (id: string) => flyToCardRef.current?.(id);

    // Chat chip → Add: back on the canvas (on grace if from an older turn).
    const addWidget = (id: string) => {
        const widget = chat.widgets.find((other) => other.id === id);

        doc.addWidget(id, !!widget && widget.turn !== latestTurn, latestTurn);

        if (widget) {
            chat.syncCanvas([{ op: 'add', component_id: id }]);
        }
    };

    // The card menu's Remove and Pin. A harness card's edit goes to the
    // harness too; a text card lives only here.
    const removeCard = (id: string) => {
        doc.removeWidget(id);

        if (chat.widgets.some((widget) => widget.id === id)) {
            chat.syncCanvas([{ op: 'remove', component_id: id }]);
        }
    };
    const togglePin = (id: string) => {
        const pinning = !doc.pinnedIds.includes(id);

        doc.togglePin(id, latestTurn);

        if (chat.widgets.some((widget) => widget.id === id)) {
            chat.syncCanvas([{ op: pinning ? 'pin' : 'unpin', component_id: id }]);
        }
    };

    // Studio opens on the handed-over question instead of a blank canvas.
    // The id-bearing URL replaces this one as soon as the turn starts, so a
    // refresh continues the conversation rather than re-asking.
    useEffect(() => {
        // Deferred by a tick on purpose. `begin` starts the landing's
        // stage-out on a timer that the mount effect's cleanup clears, and in
        // development React mounts, cleans up and mounts again — starting the
        // turn inside that window would cancel the transition and leave the
        // page on a blank stage. A tick puts it safely after.
        const handle = window.setTimeout(() => {
            if (handover && !handedOver.current) {
                handedOver.current = true;
                // Seeds that cannot be read leave the question alone.
                begin(
                    handover,
                    (seedToken && takeSeeds(() => window.sessionStorage, seedToken)) || undefined,
                );
            }
        }, 0);

        return () => window.clearTimeout(handle);
        // `begin` is rebuilt every render; the ref is what makes this run once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handover, seedToken]);

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
            ? [{ id: widget.id, title: cardTitleOf(widget.id), ref: widget.ref }]
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

    const title = doc.conversationTitle ?? query;
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
                        flyToCardRef={flyToCardRef}
                        theme={derivedTheme}
                        views={doc.views}
                        onViewChange={doc.setView}
                        onShare={
                            !account
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
                liveShareId={liveCanvas?.shareId}
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
                        liveShareId={liveCanvas?.shareId}
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
                    liveSharing={liveSharing}
                    createShare={save.createShare}
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
                    query={query}
                    onQueryChange={setQuery}
                    onBegin={begin}
                    inputRef={inputRef}
                    history={account ? landingHistory.history : null}
                    openingId={landingHistory.openingId}
                    onOpenHistory={landingHistory.openHistory}
                    leaving={mode === 'leaving'}
                    wall={walled ? <GuestWall /> : null}
                />
            )}

            {continuable && solo && (
                <div className={styles.continueBar}>
                    <Button onClick={continueSession} disabled={forking}>
                        {forking ? 'Opening…' : 'Continue this session'}
                    </Button>
                </div>
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
                        onShare={account ? () => modals.share.show({ kind: 'whole' }) : undefined}
                        note={liveCanvas ? <LiveNote live={liveCanvas} /> : undefined}
                    />
                    <ChatPanel
                        editTarget={editTarget}
                        onClearEditTarget={() => setEditTarget(null)}
                        chat={chat}
                        tab={chatTab}
                        collapsed={chatCollapsed}
                        gone={solo}
                        readOnly={readOnly}
                        wall={walled ? <GuestWall /> : null}
                        onContinue={continuable ? continueSession : null}
                        continuing={forking}
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
