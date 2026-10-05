'use client';

import { useCallback, useState } from 'react';

import type { CardView } from '../canvas/layout';
import type { TurnWidget } from './useChat';

import type { SavedConversation, ShareMark } from '@/lib/chat/history';
import type { TextWidget, Widget } from '@/lib/chat/widgets';
import { DEFAULT_THEME, type StudioTheme } from '@/lib/studio/theme';
import { uuid } from '@/lib/uuid';

/**
 * Everything on the canvas that ISN'T the chat: which cards are pinned,
 * removed or on grace, per-card views / titles / notes, the user's text
 * cards, the theme, the conversation's title and its share points. Saved
 * with the conversation; reset for a new one; loaded from a saved one.
 */
export const useCanvasDocument = (initial?: SavedConversation) => {
    // Pinned cards survive turn changes; everything else on the canvas is
    // transient — the next turn's widgets replace it (the demo's semantics).
    const [pinnedIds, setPinnedIds] = useState<string[]>(initial?.pinnedIds ?? []);
    // Cards the user explicitly removed from the canvas (via the card menu).
    const [removedIds, setRemovedIds] = useState<string[]>(initial?.removedIds ?? []);
    // Unpinning an older-turn card does NOT drop it on the spot — it stays
    // until the bot's next answer replaces the canvas (a mis-click must not
    // wipe a card). `grace` holds those ids and the turn they belong to: the
    // next turn makes the set stale, which is what ends the grace. Stamping
    // the turn (rather than clearing on a turn change) is what lets a
    // reopened conversation — and a share link, the same snapshot — come
    // back with those cards still on the canvas.
    const [grace, setGrace] = useState<{ ids: string[]; turn: number }>({
        ids: initial?.graceIds ?? [],
        turn: initial?.graceTurn ?? 0,
    });
    // Per-card visualisation from the kebab switcher (chart↔table↔line) —
    // drives the filters/tabs and is saved with the conversation.
    const [views, setViews] = useState<Record<string, CardView>>(initial?.views ?? {});
    // User-authored text cards (Add Text Card) — local, turn-independent,
    // they stay on the canvas until removed.
    const [textCards, setTextCards] = useState<TextWidget[]>(initial?.textCards ?? []);
    // Renamed card titles (menu → Edit Title) and user notes (menu → Add
    // Note), by widget id.
    const [titles, setTitles] = useState<Record<string, string>>(initial?.titles ?? {});
    const [notes, setNotes] = useState<Record<string, string>>(initial?.notes ?? {});
    // Canvas theme (Customize drawer) — per conversation.
    const [theme, setTheme] = useState<StudioTheme>(initial?.theme ?? DEFAULT_THEME);
    // The conversation's title (header): the first prompt by default, or a
    // user rename (header pencil → Edit Title).
    const [conversationTitle, setConversationTitle] = useState<string | null>(
        initial?.title ?? null,
    );
    // Chat + Canvas share points (see ShareMark).
    const [shareMarks, setShareMarks] = useState<ShareMark[]>([]);

    // A fresh canvas (a new prompt from the landing).
    const reset = useCallback(() => {
        setPinnedIds([]);
        setRemovedIds([]);
        setGrace({ ids: [], turn: 0 });
        setViews({});
        setTextCards([]);
        setTitles({});
        setNotes({});
        setTheme(DEFAULT_THEME);
        setConversationTitle(null);
        setShareMarks([]);
    }, []);

    // A saved conversation, exactly as it was left.
    const load = useCallback((saved: SavedConversation) => {
        setPinnedIds(saved.pinnedIds);
        setRemovedIds(saved.removedIds);
        setGrace({ ids: saved.graceIds ?? [], turn: saved.graceTurn ?? 0 });
        setViews(saved.views ?? {});
        setTextCards(saved.textCards ?? []);
        setTitles(saved.titles ?? {});
        setNotes(saved.notes ?? {});
        setTheme(saved.theme ?? DEFAULT_THEME);
        // The saved title IS the display title (a rename or the first prompt).
        setConversationTitle(saved.title);
        setShareMarks(saved.shareMarks ?? []);
    }, []);

    // The ids still on grace at `latestTurn` — an older stamp is a set the
    // next turn already replaced.
    const graceAt = useCallback(
        (latestTurn: number): string[] => (grace.turn === latestTurn ? grace.ids : []),
        [grace],
    );

    // Unpinning puts the card on grace for the turn on screen (see above);
    // pinning takes it off.
    const togglePin = useCallback(
        (id: string, latestTurn: number) => {
            const pinning = !pinnedIds.includes(id);

            setPinnedIds((prev) =>
                pinning ? [...prev, id] : prev.filter((other) => other !== id),
            );
            setGrace((prev) => {
                const ids = prev.turn === latestTurn ? prev.ids : [];

                return {
                    turn: latestTurn,
                    ids: pinning
                        ? ids.filter((other) => other !== id)
                        : ids.includes(id)
                          ? ids
                          : [...ids, id],
                };
            });
        },
        [pinnedIds],
    );

    const removeWidget = useCallback((id: string) => {
        setRemovedIds((prev) => [...prev, id]);
        setPinnedIds((prev) => prev.filter((other) => other !== id));
    }, []);

    // Chat chip → Add: put a card back on the canvas, unpinned. A removed
    // card is un-removed; a card from an older turn comes back on grace (it
    // stays until the bot's next answer, exactly like an unpinned card) —
    // pin it yourself if it should outlive the turn.
    const addWidget = useCallback((id: string, isOlderTurn: boolean, latestTurn: number) => {
        setRemovedIds((prev) => prev.filter((other) => other !== id));

        if (isOlderTurn) {
            setGrace((prev) => {
                const ids = prev.turn === latestTurn ? prev.ids : [];

                return { turn: latestTurn, ids: ids.includes(id) ? ids : [...ids, id] };
            });
        }
    }, []);

    // Add or edit a text card (an empty title falls back to "Text Card").
    const upsertTextCard = useCallback((id: string | null, title: string, body: string) => {
        const safeTitle = title || 'Text Card';

        setTextCards((prev) =>
            id
                ? prev.map((card) => (card.id === id ? { ...card, title: safeTitle, body } : card))
                : [...prev, { kind: 'text', id: `text-${uuid()}`, title: safeTitle, body }],
        );
    }, []);

    const setView = useCallback(
        (id: string, view: CardView) => setViews((prev) => ({ ...prev, [id]: view })),
        [],
    );

    const setTitle = useCallback(
        (id: string, title: string) => setTitles((prev) => ({ ...prev, [id]: title })),
        [],
    );

    const setNote = useCallback(
        (id: string, note: string) => setNotes((prev) => ({ ...prev, [id]: note })),
        [],
    );

    const removeNote = useCallback(
        (id: string) =>
            setNotes((prev) => {
                const next = { ...prev };

                delete next[id];

                return next;
            }),
        [],
    );

    const addShareMark = useCallback(
        (mark: ShareMark) => setShareMarks((prev) => [...prev, mark]),
        [],
    );

    // The canvas shows the latest turn's widgets plus everything pinned or on
    // grace — unpinned cards from older turns are gone (the sheet fades them
    // out) — and the user's text cards; removed cards never.
    const visibleWidgets = useCallback(
        (chatWidgets: TurnWidget[], latestTurn: number): Widget[] => [
            ...chatWidgets.filter(
                (widget) =>
                    !removedIds.includes(widget.id) &&
                    (widget.turn === latestTurn ||
                        pinnedIds.includes(widget.id) ||
                        graceAt(latestTurn).includes(widget.id)),
            ),
            ...textCards.filter((card) => !removedIds.includes(card.id)),
        ],
        [removedIds, pinnedIds, graceAt, textCards],
    );

    return {
        pinnedIds,
        removedIds,
        graceIds: grace.ids,
        graceTurn: grace.turn,
        views,
        textCards,
        titles,
        notes,
        theme,
        conversationTitle,
        shareMarks,
        setTheme,
        setConversationTitle,
        reset,
        load,
        togglePin,
        removeWidget,
        addWidget,
        upsertTextCard,
        setView,
        setTitle,
        setNote,
        removeNote,
        addShareMark,
        visibleWidgets,
    };
};

export type CanvasDocument = ReturnType<typeof useCanvasDocument>;
